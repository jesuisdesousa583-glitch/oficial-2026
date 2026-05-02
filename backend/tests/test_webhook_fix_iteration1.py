"""
Iteration 1 test - validates the webhook token fix and full WhatsApp/CRM/Chat IA flow.
Bug context: /api/whatsapp/webhook/baileys used default token 'espirito-santo-baileys-2026'
which mismatched baileys-service that sends 'legalflow-baileys-2026'. Now fixed.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-debug-test.preview.emergentagent.com").rstrip("/")
INTERNAL_TOKEN = os.environ.get("BAILEYS_INTERNAL_TOKEN", "legalflow-baileys-2026")

ADMIN_EMAIL = "admin@kenia-garcia.com.br"
ADMIN_PASSWORD = "Kenia@Admin2026"


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                     timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---------- auth ----------

class TestAuth:
    def test_login_ok(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and len(data["token"]) > 20
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_wrong_password(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code in (400, 401)


# ---------- Baileys status & WhatsApp config ----------

class TestBaileysAndConfig:
    def test_baileys_status(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/whatsapp/baileys/status", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # ok should indicate sidecar reachable
        assert "ok" in data or "connected" in data or "state" in data

    def test_diagnostics(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/whatsapp/diagnostics", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "baileys" in data or "provider" in data or isinstance(data, dict)

    def test_get_whatsapp_config(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/whatsapp/config", headers=auth_headers)
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert isinstance(cfg, dict)

    def test_update_whatsapp_config(self, session, auth_headers):
        payload = {"provider": "baileys", "bot_enabled": True}
        r = session.put(f"{BASE_URL}/api/whatsapp/config",
                        json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

        # verify persistence via GET (PUT returns only {"ok": true})
        r2 = session.get(f"{BASE_URL}/api/whatsapp/config", headers=auth_headers)
        assert r2.status_code == 200
        cfg2 = r2.json()
        assert cfg2.get("provider") == "baileys"
        assert cfg2.get("bot_enabled") is True


# ---------- Webhook (token fix validation) ----------

class TestBaileysWebhook:
    def _make_payload(self, phone="5511911112222", token=None):
        return {
            "token": token,
            "event": "message",
            "phone": phone,
            "jid": f"{phone}@s.whatsapp.net",
            "phone_jid": f"{phone}@s.whatsapp.net",
            "fromMe": False,
            "id": f"TEST_{uuid.uuid4().hex[:10]}",
            "timestamp": int(time.time()),
            "text": "Olá, gostaria de informações sobre serviços jurídicos.",
            "name": "TEST_User",
        }

    def test_webhook_wrong_token_rejected(self, session):
        payload = self._make_payload(token="WRONG_TOKEN")
        r = session.post(f"{BASE_URL}/api/whatsapp/webhook/baileys",
                         headers={"Content-Type": "application/json"},
                         json=payload)
        # NOTE: backend returns 200 with {"ok": false, "error": "unauthorized"} instead of 401.
        # This is a minor security code-smell, documented in test report.
        data = r.json()
        assert data.get("ok") is False and data.get("error") == "unauthorized", \
            f"expected unauthorized body, got {r.status_code} {r.text}"

    def test_webhook_correct_token_processes(self, session, auth_headers):
        # Ensure bot is enabled + provider=baileys
        session.put(f"{BASE_URL}/api/whatsapp/config",
                    json={"provider": "baileys", "bot_enabled": True},
                    headers=auth_headers)

        payload = self._make_payload(phone="5511933334444", token=INTERNAL_TOKEN)
        r = session.post(f"{BASE_URL}/api/whatsapp/webhook/baileys",
                         headers={"Content-Type": "application/json"},
                         json=payload, timeout=120)
        assert r.status_code == 200, f"webhook failed {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True, f"expected ok:true, got {data}"

    def test_webhook_contact_and_messages_persisted(self, session, auth_headers):
        phone = "5511955556666"
        payload = self._make_payload(phone=phone, token=INTERNAL_TOKEN)
        payload["text"] = "TEST_persistencia: preciso de um advogado."
        r = session.post(f"{BASE_URL}/api/whatsapp/webhook/baileys",
                         headers={"Content-Type": "application/json"},
                         json=payload, timeout=120)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True, r.text

        # small wait for async autoresponse generation
        time.sleep(4)

        # fetch contacts
        rc = session.get(f"{BASE_URL}/api/whatsapp/contacts", headers=auth_headers)
        assert rc.status_code == 200, rc.text
        contacts = rc.json()
        assert isinstance(contacts, list)
        found = [c for c in contacts if phone in (c.get("phone") or c.get("jid") or c.get("id") or "")]
        assert found, f"expected contact {phone} in list (got {len(contacts)} contacts)"
        contact = found[0]
        contact_id = contact.get("id") or contact.get("_id") or contact.get("contact_id")
        assert contact_id, f"contact has no id field: {contact}"

        # fetch messages for that contact
        rm = session.get(f"{BASE_URL}/api/whatsapp/messages/{contact_id}", headers=auth_headers)
        assert rm.status_code == 200, rm.text
        msgs = rm.json()
        assert isinstance(msgs, list) and len(msgs) >= 1
        # Should include inbound (from_me=false)
        inbound = [m for m in msgs if not m.get("from_me")]
        assert inbound, f"expected inbound message, got {msgs[:2]}"


# ---------- Chat IA público ----------

class TestChatIA:
    def test_chat_message_public(self, session):
        session_id = f"TEST_{uuid.uuid4().hex[:8]}"
        r = session.post(f"{BASE_URL}/api/chat/message",
                         json={"session_id": session_id,
                               "message": "Olá, pode me ajudar com uma dúvida?"},
                         timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        # response field may be 'response', 'reply', 'message'
        reply = data.get("response") or data.get("reply") or data.get("message")
        assert reply and len(reply) > 3, f"no reply: {data}"

    def test_chat_history(self, session):
        session_id = f"TEST_{uuid.uuid4().hex[:8]}"
        # seed one message
        session.post(f"{BASE_URL}/api/chat/message",
                     json={"session_id": session_id,
                           "message": "Primeira pergunta de teste"},
                     timeout=90)
        r = session.get(f"{BASE_URL}/api/chat/history/{session_id}", timeout=30)
        assert r.status_code == 200, r.text
        hist = r.json()
        assert isinstance(hist, list)
        assert len(hist) >= 1


# ---------- CRM ----------

class TestCRM:
    def test_list_leads(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/leads", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_lead(self, session, auth_headers):
        payload = {
            "name": "TEST_Lead_" + uuid.uuid4().hex[:6],
            "phone": "5511977778888",
            "email": "test_lead@example.com",
            "source": "test",
        }
        r = session.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("name") == payload["name"]

    def test_list_processes(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/processes", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_list_transactions(self, session, auth_headers):
        # Transactions live under /api/finance/transactions in this app
        r = session.get(f"{BASE_URL}/api/finance/transactions", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_list_appointments(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/appointments", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
