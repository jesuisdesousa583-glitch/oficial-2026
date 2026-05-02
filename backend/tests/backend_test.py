"""LegalFlow AI Backend tests - covers auth, leads, processes, finance,
chat (AI), creatives caption, whatsapp config and persistence verification."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL",
    "https://app-config-render.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


# ------------------------ Fixtures ------------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    # Login as demo (auto-created on first login attempt)
    r = session.post(f"{API}/auth/login", json={
        "email": "demo@legalflow.ai", "password": "demo123",
    }, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == "demo@legalflow.ai"
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"}


# ------------------------ Health ------------------------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert "message" in body


# ------------------------ Auth ------------------------
class TestAuth:
    def test_register_new_user(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@legalflow.ai"
        r = session.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email,
            "password": "SecurePass123!", "oab": "12345/SP",
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email
        assert data["user"]["name"] == "Test User"
        assert "id" in data["user"]

    def test_register_duplicate_email(self, session):
        email = f"TEST_dup_{uuid.uuid4().hex[:8]}@legalflow.ai"
        payload = {"name": "Dup User", "email": email, "password": "Pass1234!"}
        r1 = session.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r1.status_code == 200
        r2 = session.post(f"{API}/auth/register", json=payload, timeout=15)
        assert r2.status_code == 400

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "doesnotexist@nope.com", "password": "wrong",
        }, timeout=15)
        assert r.status_code == 401

    def test_login_demo_account(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "demo@legalflow.ai", "password": "demo123",
        }, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == "demo@legalflow.ai"

    def test_me_requires_auth(self, session):
        r = session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_with_token(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        u = r.json()
        assert u.get("email") == "demo@legalflow.ai"
        # ensure no _id leaks and password not returned
        assert "_id" not in u
        assert "password" not in u


# ------------------------ Leads CRUD ------------------------
class TestLeads:
    def test_create_lead_requires_auth(self, session):
        r = session.post(f"{API}/leads", json={"name": "x", "phone": "1"}, timeout=10)
        assert r.status_code == 401

    def test_create_and_list_lead(self, session, auth_headers):
        payload = {
            "name": "TEST_Lead Maria", "phone": "+55 11 90000-1111",
            "email": "TEST_lead@example.com", "case_type": "Trabalhista",
            "description": "Demissao", "source": "test",
        }
        r = session.post(f"{API}/leads", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        lead = r.json()
        assert lead["name"] == payload["name"]
        assert lead["phone"] == payload["phone"]
        assert lead["case_type"] == "Trabalhista"
        assert "id" in lead
        assert "_id" not in lead
        assert lead["stage"] == "novos_leads"
        # urgent score boost (trabalhista -> 75)
        assert lead["score"] == 75

        lead_id = lead["id"]
        # list and verify persistence
        rl = session.get(f"{API}/leads", headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        leads = rl.json()
        assert isinstance(leads, list)
        ids = [l["id"] for l in leads]
        assert lead_id in ids
        for l in leads:
            assert "_id" not in l

    def test_update_lead(self, session, auth_headers):
        # create
        r = session.post(f"{API}/leads", json={
            "name": "TEST_Update Lead", "phone": "+55 11 90000-2222",
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        lead_id = r.json()["id"]
        # update stage
        ru = session.patch(f"{API}/leads/{lead_id}", json={
            "stage": "em_contato", "score": 85,
        }, headers=auth_headers, timeout=15)
        assert ru.status_code == 200
        updated = ru.json()
        assert updated["stage"] == "em_contato"
        assert updated["score"] == 85
        assert "_id" not in updated

    def test_delete_lead(self, session, auth_headers):
        r = session.post(f"{API}/leads", json={
            "name": "TEST_Delete Lead", "phone": "+55 11 90000-3333",
        }, headers=auth_headers, timeout=15)
        lead_id = r.json()["id"]
        rd = session.delete(f"{API}/leads/{lead_id}", headers=auth_headers, timeout=15)
        assert rd.status_code == 200
        # ensure removed
        rl = session.get(f"{API}/leads", headers=auth_headers, timeout=15)
        assert lead_id not in [l["id"] for l in rl.json()]


# ------------------------ Chat IA (public) ------------------------
class TestChat:
    def test_chat_message_public(self, session):
        r = session.post(f"{API}/chat/message", json={
            "message": "Olá, preciso de ajuda com uma demissão sem justa causa.",
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data
        assert "response" in data
        assert isinstance(data["response"], str)
        # AI may fallback gracefully; just make sure non-empty string
        assert len(data["response"]) > 0


# ------------------------ Processes ------------------------
class TestProcesses:
    def test_create_and_list_process(self, session, auth_headers):
        payload = {
            "client_name": "TEST_Cliente", "process_number": f"TEST-{uuid.uuid4().hex[:8]}",
            "case_type": "Trabalhista", "court": "TRT-2",
            "status": "Em Andamento", "description": "TEST proc",
        }
        r = session.post(f"{API}/processes", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["process_number"] == payload["process_number"]
        assert "id" in p
        assert "_id" not in p
        assert isinstance(p.get("timeline"), list)
        # list
        rl = session.get(f"{API}/processes", headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        items = rl.json()
        assert any(it["id"] == p["id"] for it in items)
        for it in items:
            assert "_id" not in it


# ------------------------ Finance ------------------------
class TestFinance:
    def test_create_and_list_transaction(self, session, auth_headers):
        payload = {
            "client_name": "TEST_Client", "description": "TEST honorarios",
            "amount": 1500.50, "type": "receita", "status": "pendente",
            "due_date": "2026-02-15",
        }
        r = session.post(f"{API}/finance/transactions", json=payload,
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["amount"] == 1500.50
        assert tx["type"] == "receita"
        assert "_id" not in tx
        # list
        rl = session.get(f"{API}/finance/transactions",
                         headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        items = rl.json()
        assert any(t["id"] == tx["id"] for t in items)


# ------------------------ Creatives caption (AI) ------------------------
class TestCreatives:
    def test_generate_creative_caption(self, session, auth_headers):
        # Note: generate also tries image gen; should not fail endpoint even if image fails
        payload = {
            "title": "Direitos Trabalhistas", "network": "instagram",
            "format": "post", "topic": "Demissao sem justa causa",
            "tone": "informativo", "case_type": "Trabalhista",
        }
        r = session.post(f"{API}/creatives/generate", json=payload,
                         headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "caption" in data
        assert isinstance(data["caption"], str)
        assert len(data["caption"]) > 0
        assert data["network"] == "instagram"


# ------------------------ WhatsApp Config ------------------------
class TestWhatsAppConfig:
    def test_get_config_creates_default(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg.get("provider") in ("zapi", "evolution", "meta")
        assert "_id" not in cfg
        assert "bot_prompt" in cfg

    def test_set_config(self, session, auth_headers):
        # NOTE: route is PUT in server (spec says POST). Use PUT per actual implementation.
        payload = {
            "provider": "zapi",
            "zapi_instance_id": "TEST_INSTANCE",
            "zapi_instance_token": "TEST_TOKEN",
            "zapi_client_token": "TEST_CLIENT",
            "bot_enabled": False,
            "bot_prompt": "TEST prompt",
        }
        r = session.put(f"{API}/whatsapp/config", json=payload,
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # verify persistence via GET
        rg = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        cfg = rg.json()
        assert cfg["zapi_instance_id"] == "TEST_INSTANCE"
        assert cfg["bot_prompt"] == "TEST prompt"


# ------------------------ MongoDB persistence sweep ------------------------
class TestPersistence:
    def test_no_object_id_in_responses(self, session, auth_headers):
        endpoints = [
            "/leads", "/processes", "/finance/transactions",
            "/whatsapp/config", "/auth/me", "/dashboard/metrics",
            "/appointments", "/creatives", "/whatsapp/contacts",
        ]
        for ep in endpoints:
            r = session.get(f"{API}{ep}", headers=auth_headers, timeout=20)
            assert r.status_code == 200, f"{ep} -> {r.status_code}"
            text = r.text
            # ObjectId would only show as _id field when leaked
            assert '"_id"' not in text, f"_id leaked in {ep}"
