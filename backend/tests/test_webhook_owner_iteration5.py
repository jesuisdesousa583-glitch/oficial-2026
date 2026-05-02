"""Iteration 5 tests: Post-fix retest for webhook owner resolution.

Validates that `_resolve_owner_for_provider` (server.py ~L874) routes incoming
WhatsApp messages to the user whose whatsapp_config matches the incoming
instance (for Z-API) or provider (for Baileys), sorted by updated_at DESC.

Flow:
  1. Login as demo user
  2. PUT /api/whatsapp/config with Z-API creds -> refreshes updated_at
  3. POST /api/whatsapp/webhook/zapi with that instanceId and a TEST_ phone
  4. GET /api/whatsapp/contacts as demo -> must contain that contact
  5. isGroup payload -> ignored with reason group-or-newsletter
  6. PUT config with provider=baileys -> refreshes updated_at
  7. POST /api/whatsapp/webhook/baileys -> owner must be demo again
  8. Regressions: setup-webhook, diagnostics, baileys status/qr,
     test-connection, login, config
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://z-api-connector.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ZAPI_INSTANCE = "3F25F1D0548F427ADB0E26F49989160C"
ZAPI_TOKEN = "466F1CFB56C986E469829306"
ZAPI_CLIENT_TOKEN = "Fbe5955e91194424b986a132aba24f418S"
BAILEYS_INTERNAL_TOKEN = "legalflow-baileys-2026"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": "demo@legalflow.ai", "password": "demo123"},
        timeout=20,
    )
    assert r.status_code == 200, f"demo login failed: {r.text}"
    data = r.json()
    assert "token" in data
    return {
        "Authorization": f"Bearer {data['token']}",
        "Content-Type": "application/json",
    }


def _put_zapi_config(session, auth_headers):
    """PUT Z-API config as demo -> refreshes updated_at (wins resolver)."""
    cfg = {
        "provider": "zapi",
        "zapi_instance_id": ZAPI_INSTANCE,
        "zapi_instance_token": ZAPI_TOKEN,
        "zapi_client_token": ZAPI_CLIENT_TOKEN,
        "bot_enabled": False,
        "bot_auto_reply": False,
    }
    r = session.put(f"{API}/whatsapp/config", headers=auth_headers, json=cfg, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


def _put_baileys_config(session, auth_headers):
    cfg = {
        "provider": "baileys",
        "bot_enabled": False,
        "bot_auto_reply": False,
    }
    r = session.put(f"{API}/whatsapp/config", headers=auth_headers, json=cfg, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


# ---------- Auth regression ----------
class TestAuthRegression:
    def test_login_demo(self, session):
        r = session.post(
            f"{API}/auth/login",
            json={"email": "demo@legalflow.ai", "password": "demo123"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("user", {}).get("email") == "demo@legalflow.ai"
        assert isinstance(data.get("token"), str) and len(data["token"]) > 10


# ---------- WhatsApp config regression ----------
class TestConfigRegression:
    def test_get_config(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)

    def test_put_zapi_config_ok(self, session, auth_headers):
        _put_zapi_config(session, auth_headers)

    def test_put_baileys_config_ok(self, session, auth_headers):
        _put_baileys_config(session, auth_headers)
        # put back zapi to keep later tests stable
        _put_zapi_config(session, auth_headers)

    def test_test_connection_zapi_connected(self, session, auth_headers):
        _put_zapi_config(session, auth_headers)
        r = session.post(f"{API}/whatsapp/test-connection", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # real z-api account should be connected
        assert data.get("provider") in ("zapi", "Z-API")
        assert data.get("connected") is True, f"Z-API should be connected: {data}"


# ---------- Webhook owner resolution (the fix) ----------
class TestWebhookOwnerResolution:
    TEST_PHONE = f"5599{int(time.time())%100000000:08d}"
    TEST_TEXT_ZAPI = f"TEST_OWNER_ZAPI_{uuid.uuid4().hex[:8]}"
    TEST_TEXT_BAILEYS = f"TEST_OWNER_BAILEYS_{uuid.uuid4().hex[:8]}"

    def test_zapi_webhook_routes_to_demo(self, session, auth_headers):
        # Make demo win: refresh updated_at via PUT config
        _put_zapi_config(session, auth_headers)
        time.sleep(0.5)

        payload = {
            "phone": self.TEST_PHONE,
            "senderName": "TEST_OWNER_DEMO",
            "text": {"message": self.TEST_TEXT_ZAPI},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "type": "ReceivedCallback",
        }
        r = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert not body.get("ignored"), f"Should not be ignored: {body}"

        # Demo should see the new contact in its list
        time.sleep(1.0)
        r2 = session.get(f"{API}/whatsapp/contacts", headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        contacts = r2.json()
        phones = [c.get("phone") for c in contacts]
        last_msgs = [c.get("last_message") for c in contacts]
        assert self.TEST_PHONE in phones or any(
            (lm or "").startswith("TEST_OWNER_ZAPI_") for lm in last_msgs
        ), (
            f"Demo user should own the new Z-API contact. "
            f"phones_seen={phones[:10]} msgs_seen={[m for m in last_msgs if m and 'TEST_' in m][:10]}"
        )

    def test_zapi_webhook_ignores_group(self, session, auth_headers):
        payload = {
            "phone": "120363423160081802",
            "senderName": "TEST_GROUP",
            "text": {"message": "should be ignored"},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "isGroup": True,
            "type": "ReceivedCallback",
        }
        r = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("ignored") is True
        assert body.get("reason") == "group-or-newsletter"

    def test_zapi_webhook_ignores_newsletter(self, session):
        payload = {
            "phone": "130000000000",
            "senderName": "TEST_NEWS",
            "text": {"message": "news"},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "isNewsletter": True,
            "type": "ReceivedCallback",
        }
        r = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ignored") is True
        assert body.get("reason") == "group-or-newsletter"

    def test_baileys_webhook_routes_to_demo(self, session, auth_headers):
        # Flip provider to baileys (refreshes updated_at), then restore to zapi at end
        _put_baileys_config(session, auth_headers)
        time.sleep(0.5)
        phone_b = f"5588{int(time.time())%100000000:08d}"
        payload = {
            "token": BAILEYS_INTERNAL_TOKEN,
            "phone": phone_b,
            "name": "TEST_BAILEYS_OWNER",
            "text": self.TEST_TEXT_BAILEYS,
        }
        r = requests.post(f"{API}/whatsapp/webhook/baileys", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert not body.get("noowner"), f"owner should resolve: {body}"

        time.sleep(1.0)
        r2 = session.get(f"{API}/whatsapp/contacts", headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        contacts = r2.json()
        phones = [c.get("phone") for c in contacts]
        last_msgs = [c.get("last_message") for c in contacts]
        assert phone_b in phones or any(
            (lm or "").startswith("TEST_OWNER_BAILEYS_") for lm in last_msgs
        ), f"Demo should own the Baileys contact. phones_seen={phones[:10]}"

        # Restore zapi to not affect other tests
        _put_zapi_config(session, auth_headers)

    def test_baileys_webhook_rejects_bad_token(self):
        payload = {"token": "wrong", "phone": "5599", "text": "x"}
        r = requests.post(f"{API}/whatsapp/webhook/baileys", json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is False
        assert "unauth" in (body.get("error") or "").lower()


# ---------- Setup-webhook / diagnostics regression ----------
class TestSetupAndDiagnostics:
    def test_setup_webhook_verified(self, session, auth_headers):
        _put_zapi_config(session, auth_headers)
        payload = {"base_url": BASE_URL}
        r = session.post(
            f"{API}/whatsapp/setup-webhook",
            headers=auth_headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        assert data.get("verified") is True, data
        assert data.get("webhook_url", "").endswith("/api/whatsapp/webhook/zapi")

    def test_diagnostics_webhook_ok(self, session, auth_headers):
        r = session.get(
            f"{API}/whatsapp/diagnostics",
            headers=auth_headers,
            params={"public_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        checks = {c.get("id"): c for c in data.get("checks", [])}
        assert checks, f"no diagnostics checks: {data}"
        wh = checks.get("webhook")
        assert wh and wh.get("ok") is True, f"webhook diag not ok: {wh}"


# ---------- Baileys proxy regression ----------
class TestBaileysProxy:
    def test_baileys_status(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/baileys/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        # must return connected boolean and a state
        assert "connected" in data

    def test_baileys_qr(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/baileys/qr", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # either connected or returns a qr
        assert data.get("ok") is True
        assert ("qr" in data) or (data.get("connected") is True)
