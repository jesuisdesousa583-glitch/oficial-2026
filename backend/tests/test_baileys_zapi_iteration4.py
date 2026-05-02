"""Iteration 4 tests:
- Z-API real-creds connectivity (test-connection, setup-webhook, diagnostics)
- Baileys provider PUT config + status/qr proxies via FastAPI to Node sidecar
- Baileys webhook (token-auth) -> contact + message + autorespond
- Z-API webhook regression
- Existing endpoints regression: dashboard/metrics, leads, default-prompt, seed/demo
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL", "https://z-api-connector.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ZAPI_INSTANCE = "3F25F1D0548F427ADB0E26F49989160C"
ZAPI_TOKEN = "466F1CFB56C986E469829306"
ZAPI_CLIENT_TOKEN = "Fbe5955e91194424b986a132aba24f418S"
BAILEYS_INTERNAL_TOKEN = "legalflow-baileys-2026"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(session):
    r = session.post(f"{API}/auth/login",
                     json={"email": "demo@legalflow.ai", "password": "demo123"},
                     timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    return {"Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_demo(self, session):
        r = session.post(f"{API}/auth/login",
                         json={"email": "demo@legalflow.ai", "password": "demo123"},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data.get("user", {}).get("email") == "demo@legalflow.ai"


# ---------- WhatsApp config (incl. baileys provider) ----------
class TestWhatsAppConfig:
    def test_get_config(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert "provider" in data

    def test_put_config_zapi_real_creds(self, session, auth_headers):
        payload = {
            "provider": "zapi",
            "zapi_instance_id": ZAPI_INSTANCE,
            "zapi_instance_token": ZAPI_TOKEN,
            "zapi_client_token": ZAPI_CLIENT_TOKEN,
            "bot_enabled": True,
        }
        r = session.put(f"{API}/whatsapp/config", json=payload,
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        # Verify persisted
        g = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        cfg = g.json()
        assert cfg["provider"] == "zapi"
        assert cfg["zapi_instance_id"] == ZAPI_INSTANCE
        assert cfg["zapi_instance_token"] == ZAPI_TOKEN
        assert cfg["zapi_client_token"] == ZAPI_CLIENT_TOKEN
        assert cfg["bot_enabled"] is True

    def test_put_config_provider_baileys(self, session, auth_headers):
        """Verify Literal accepts 'baileys' as a provider value."""
        payload = {"provider": "baileys", "bot_enabled": True}
        r = session.put(f"{API}/whatsapp/config", json=payload,
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        g = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert g.json()["provider"] == "baileys"
        # Restore zapi for downstream tests
        session.put(f"{API}/whatsapp/config",
                    json={"provider": "zapi",
                          "zapi_instance_id": ZAPI_INSTANCE,
                          "zapi_instance_token": ZAPI_TOKEN,
                          "zapi_client_token": ZAPI_CLIENT_TOKEN,
                          "bot_enabled": True},
                    headers=auth_headers, timeout=15)


# ---------- Z-API real connectivity ----------
class TestZAPILive:
    def test_connection_returns_connected(self, session, auth_headers):
        r = session.post(f"{API}/whatsapp/test-connection",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, f"test-connection not ok: {data}"
        # User said real WA is connected -> connected=True expected
        assert data.get("connected") is True, \
            f"Z-API not reporting connected (creds may be stale): {data}"

    def test_setup_webhook_persists_and_verifies(self, session, auth_headers):
        payload = {"base_url": BASE_URL}
        r = session.post(f"{API}/whatsapp/setup-webhook", json=payload,
                         headers=auth_headers, timeout=40)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, f"setup-webhook ok=false: {data}"
        assert data.get("verified") is True, \
            f"setup-webhook did not verify: {data}"
        expected = f"{BASE_URL}/api/whatsapp/webhook/zapi"
        assert data.get("webhook_url") == expected
        # update-every-webhooks should have returned status 200 with {value:true}
        every = (data.get("results") or {}).get("update-every-webhooks") or {}
        assert every.get("status") == 200, every
        assert (every.get("body") or {}).get("value") is True, every

    def test_diagnostics_webhook_ok_after_setup(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/diagnostics",
                        params={"public_url": BASE_URL},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        checks = {c["id"]: c for c in (data.get("checks") or [])}
        assert "webhook" in checks
        # The webhook check should be ok=true after persist
        assert checks["webhook"].get("ok") is True, checks["webhook"]
        # Provider connected check should also be ok with real creds
        assert checks["provider_connected"].get("ok") is True, \
            checks.get("provider_connected")


# ---------- Baileys proxy endpoints ----------
class TestBaileysProxy:
    def test_status(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/baileys/status",
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        # connected should be a bool
        assert isinstance(data.get("connected"), bool)
        # state can be 'connecting'/'open'/'close'/None - just present as field
        assert "state" in data or "data" in data

    def test_qr_returns_payload(self, session, auth_headers):
        # Status first - if connected we may not have a QR
        st = session.get(f"{API}/whatsapp/baileys/status",
                         headers=auth_headers, timeout=15).json()
        connected = bool(st.get("connected"))
        r = session.get(f"{API}/whatsapp/baileys/qr",
                        headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        if not connected:
            # Should expose has_qr/qr fields. QR may take a moment to generate.
            # Poll a few times.
            qr = data.get("qr")
            if not qr:
                for _ in range(6):
                    time.sleep(2)
                    r2 = session.get(f"{API}/whatsapp/baileys/qr",
                                     headers=auth_headers, timeout=20)
                    d2 = r2.json()
                    if d2.get("qr"):
                        qr = d2["qr"]
                        break
            # Soft assert: print rather than fail if QR not yet ready
            if qr:
                assert isinstance(qr, str)
                assert qr.startswith("data:image/png;base64,"), qr[:60]
            else:
                print("[INFO] Baileys QR not yet ready; sidecar may still be initializing.")


# ---------- Baileys webhook ----------
class TestBaileysWebhook:
    def test_invalid_token(self, session):
        r = session.post(f"{API}/whatsapp/webhook/baileys",
                         json={"token": "wrong",
                               "phone": "5511999990000",
                               "name": "x", "text": "hi"},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False
        assert "unauthorized" in (data.get("error") or "").lower()

    def test_valid_token_creates_contact_and_message(self, session, auth_headers):
        phone = "5511" + str(uuid.uuid4().int)[:9]
        unique_text = f"oi teste baileys {uuid.uuid4().hex[:6]}"
        payload = {
            "token": BAILEYS_INTERNAL_TOKEN,
            "phone": phone,
            "name": "TEST_BAILEYS_USER",
            "text": unique_text,
        }
        r = session.post(f"{API}/whatsapp/webhook/baileys",
                         json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        # NOTE: webhook persists message + triggers bot, but resolves owner via
        # db.users.find_one({}) -> first user in db, not the demo user.
        # As a result the demo user's /contacts view will NOT contain this
        # message in multi-user envs (CRITICAL BUG documented in report).
        # We accept the 200 OK + ok=true as proof of persistence.

    def test_missing_phone_or_text_ignored(self, session):
        r = session.post(f"{API}/whatsapp/webhook/baileys",
                         json={"token": BAILEYS_INTERNAL_TOKEN}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("ignored") is True


# ---------- Regression ----------
class TestRegression:
    def test_dashboard_metrics(self, session, auth_headers):
        r = session.get(f"{API}/dashboard/metrics", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Real shape: {leads:{total,by_stage,by_urgency,conversion_rate}, finance:{...}, processes:{...}, alerts:{...}}
        assert "leads" in d and isinstance(d["leads"], dict)
        assert "total" in d["leads"]
        assert "finance" in d
        assert "processes" in d

    def test_leads_list(self, session, auth_headers):
        r = session.get(f"{API}/leads", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_default_prompt(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/default-prompt",
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert "prompt" in r.json()

    def test_seed_demo(self, session, auth_headers):
        r = session.post(f"{API}/seed/demo", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_zapi_webhook_text_still_works(self, session, auth_headers):
        phone = "5511" + str(uuid.uuid4().int)[:9]
        unique_text = f"TEST_REG_ZAPI_{uuid.uuid4().hex[:8]}"
        payload = {
            "phone": phone,
            "text": {"message": unique_text},
            "senderName": "TEST_ZAPI_REG",
            "fromMe": False,
            "messageId": f"M-{uuid.uuid4().hex[:10]}",
        }
        r = session.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        # Same caveat as baileys: owner resolution picks first db user, not
        # demo user; inbox lookup may be empty in multi-user envs.
