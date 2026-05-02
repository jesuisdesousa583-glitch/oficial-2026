"""Espírito Santo AI - Iteration 8 tests.

Focus: @lid phantom number bug fix, BaileysProvider.send_text jid kwarg,
webhook persistence of wa_jid/is_lid, demo login, dashboard/leads, whatsapp config.
"""
import os
import uuid
import inspect
import pytest
import requests

# Public URL from frontend env (what the user sees)
BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nude-gold-dashboard.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@espirito-santo.com.br"
DEMO_PASSWORD = "demo123"
BAILEYS_TOKEN = os.environ.get("BAILEYS_INTERNAL_TOKEN", "legalflow-baileys-2026")


# ------------------------ Fixtures ------------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    """Login demo. If 401, call /api/seed/demo first then retry."""
    r = session.post(f"{API}/auth/login", json={
        "email": DEMO_EMAIL, "password": DEMO_PASSWORD,
    }, timeout=20)
    if r.status_code == 401:
        # seed demo user
        seed = session.post(f"{API}/seed/demo", timeout=30)
        assert seed.status_code in (200, 201), f"seed failed {seed.status_code}: {seed.text}"
        r = session.post(f"{API}/auth/login", json={
            "email": DEMO_EMAIL, "password": DEMO_PASSWORD,
        }, timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == DEMO_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"}


# ------------------------ Health ------------------------
class TestHealth:
    def test_api_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("message") == "Espírito Santo AI API"


# ------------------------ Auth ------------------------
class TestAuth:
    def test_login_demo(self, session, auth_token):
        assert isinstance(auth_token, str) and len(auth_token) > 20

    def test_me_with_token(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == DEMO_EMAIL
        assert "_id" not in u
        assert "password" not in u


# ------------------------ Dashboard / Leads ------------------------
class TestDashboardLeads:
    def test_dashboard_metrics(self, session, auth_headers):
        r = session.get(f"{API}/dashboard/metrics", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert '"_id"' not in r.text

    def test_leads_list(self, session, auth_headers):
        r = session.get(f"{API}/leads", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for item in data:
            assert "_id" not in item


# ------------------------ WhatsApp Config (baileys) ------------------------
class TestWhatsAppConfig:
    def test_put_and_get_baileys_config(self, session, auth_headers):
        payload = {"provider": "baileys", "bot_enabled": False}
        r = session.put(f"{API}/whatsapp/config", json=payload,
                        headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        rg = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert rg.status_code == 200
        cfg = rg.json()
        assert cfg.get("provider") == "baileys"
        assert cfg.get("bot_enabled") is False
        assert "_id" not in cfg


# ------------------------ BaileysProvider signature ------------------------
class TestBaileysProviderSignature:
    def test_send_text_accepts_jid_kwarg(self):
        # import and check signature
        import sys
        sys.path.insert(0, "/app/backend")
        from whatsapp_providers import BaileysProvider  # noqa: E402
        sig = inspect.signature(BaileysProvider.send_text)
        params = list(sig.parameters.keys())
        # self, phone, text, jid
        assert "jid" in params, f"jid kwarg missing. params={params}"
        assert sig.parameters["jid"].default is None


# ------------------------ @lid Webhook persistence (CRITICAL BUG FIX) ------------------------
class TestBaileysWebhookLid:
    """Validate that posting to /webhook/baileys with jid=xxx@lid persists
    wa_jid and is_lid on the contact — the fix for the phantom-number bug."""

    def test_webhook_lid_persists_wa_jid(self, session, auth_headers):
        # Ensure provider set to baileys so _resolve_owner_for_provider finds owner
        session.put(f"{API}/whatsapp/config",
                    json={"provider": "baileys", "bot_enabled": False},
                    headers=auth_headers, timeout=15)

        unique_phone = f"55119{uuid.uuid4().int % 100000000:08d}"
        unique_jid = f"89550{uuid.uuid4().int % 10**11:011d}@lid"
        payload = {
            "token": BAILEYS_TOKEN,
            "phone": unique_phone,
            "text": "Olá, mensagem de teste via @lid",
            "name": "TEST_LID_USER",
            "jid": unique_jid,
            "is_lid": True,
            "phone_jid": f"{unique_phone}@s.whatsapp.net",
        }
        r = session.post(f"{API}/whatsapp/webhook/baileys",
                         json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, f"webhook returned: {body}"
        assert not body.get("ignored"), "webhook ignored the @lid payload"
        assert not body.get("noowner"), "webhook has no owner resolved"

        # Verify contact persisted with wa_jid=@lid
        rc = session.get(f"{API}/whatsapp/contacts",
                         headers=auth_headers, timeout=20)
        assert rc.status_code == 200, rc.text
        contacts = rc.json()
        assert isinstance(contacts, list)
        # Find our contact by phone_normalized-equivalent (ends with unique_phone digits)
        target = None
        for c in contacts:
            if c.get("wa_jid") == unique_jid:
                target = c
                break
        assert target is not None, (
            f"Contact with wa_jid={unique_jid} NOT found. "
            f"Got {len(contacts)} contacts; sample wa_jids="
            f"{[c.get('wa_jid') for c in contacts[:5]]}"
        )
        assert target["wa_jid"] == unique_jid
        assert target["is_lid"] is True
        assert "_id" not in target

    def test_webhook_unauthorized_token(self, session):
        r = session.post(f"{API}/whatsapp/webhook/baileys", json={
            "token": "wrong-token", "phone": "5511999999999",
            "text": "hi", "jid": "xxx@lid",
        }, timeout=15)
        # Returns 200 with ok=false per current implementation
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is False
        assert body.get("error") == "unauthorized"
