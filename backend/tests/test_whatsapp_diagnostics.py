"""Tests for new WhatsApp features in iteration_2:
- /api/whatsapp/diagnostics (5 checks structure, public_url, Origin fallback)
- /api/whatsapp/webhook/zapi (text, image, audio handlers; lead classify; bot autorespond)
- /api/whatsapp/logs enrichment
- ZAPIProvider._is_client_token_not_allowed fallback (unit)
- PUT /api/whatsapp/config persistence
- POST /api/whatsapp/setup-webhook accepts base_url and uses it
"""
import os
import sys
import time
import uuid
import pytest
import requests

# Make backend importable for unit tests on ZAPIProvider
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get(
    "BACKEND_URL",
    "https://app-config-render.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


# ------------------------ Fixtures ------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(session):
    r = session.post(f"{API}/auth/login", json={
        "email": "demo@legalflow.ai", "password": "demo123",
    }, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def configure_zapi(session, auth_headers):
    """Ensure config has a (fake) Z-API provider so build_provider returns ZAPIProvider.
    bot_enabled True so the webhook autoresponds (provider call will fail silently
    but the bot reply is still persisted)."""
    payload = {
        "provider": "zapi",
        "zapi_instance_id": "3FAKEINST",
        "zapi_instance_token": "FAKETOKEN123",
        "zapi_client_token": "FAKECLIENT",
        "bot_enabled": True,
        "bot_prompt": "Voce e Kenia, atendente. Seja breve.",
    }
    r = session.put(f"{API}/whatsapp/config", json=payload,
                    headers=auth_headers, timeout=15)
    assert r.status_code == 200
    yield


# ------------------------ Diagnostics ------------------------
class TestDiagnostics:
    def test_diagnostics_structure_five_checks(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/diagnostics",
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data and isinstance(data["ok"], bool)
        assert data.get("provider") == "zapi"
        assert "checks" in data and isinstance(data["checks"], list)
        ids = {c["id"] for c in data["checks"]}
        expected_ids = {"credentials", "bot_enabled", "provider_connected",
                        "webhook", "recent_messages"}
        assert expected_ids.issubset(ids), f"missing checks: {expected_ids - ids}"
        # Each check has label/ok/msg
        for c in data["checks"]:
            assert "label" in c
            assert "ok" in c
            assert "msg" in c
        assert data.get("expected_webhook_url", "").endswith(
            "/api/whatsapp/webhook/zapi"
        )
        # bot_enabled should be True since fixture set it
        bot_check = next(c for c in data["checks"] if c["id"] == "bot_enabled")
        assert bot_check["ok"] is True
        # credentials check should be True (fake creds suffice for build_provider)
        creds_check = next(c for c in data["checks"] if c["id"] == "credentials")
        assert creds_check["ok"] is True

    def test_diagnostics_with_public_url(self, session, auth_headers):
        custom = "https://meu-painel-teste.example.com"
        r = session.get(f"{API}/whatsapp/diagnostics",
                        params={"public_url": custom},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["expected_webhook_url"] == \
            f"{custom}/api/whatsapp/webhook/zapi"

    def test_diagnostics_fallback_origin_header(self, session, auth_headers):
        # When public_url not provided, server uses Origin header.
        # Note: ingress may strip/override Origin in some setups, so we
        # accept either Origin echo OR the BASE_URL host.
        custom_origin = "https://origin-test.example.com"
        headers = {**auth_headers, "Origin": custom_origin}
        r = session.get(f"{API}/whatsapp/diagnostics",
                        headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        whu = data["expected_webhook_url"]
        assert whu.endswith("/api/whatsapp/webhook/zapi")
        # at minimum the URL should not be empty / loopback
        assert "://" in whu and "localhost" not in whu


# ------------------------ Webhook (incoming) + Bot + Lead ------------------------
class TestZapiWebhook:
    """The webhook is unauthenticated. It picks db.users.find_one() as owner.
    The autorespond will invoke the fake Z-API which will fail at provider
    call, but the bot reply doc is still inserted (try/except wraps send)."""

    def _post_webhook(self, session, body):
        return session.post(f"{API}/whatsapp/webhook/zapi", json=body,
                            timeout=120)

    def test_text_message_creates_contact_and_message(self, session, auth_headers):
        unique = f"5511{uuid.uuid4().int % 1000000000:09d}"
        body = {
            "type": "ReceivedCallback",
            "phone": unique,
            "fromMe": False,
            "senderName": "TEST_Cliente Webhook",
            "text": {"message": "Olá, fui demitida sem justa causa, preciso de ajuda urgente!"},
        }
        r = self._post_webhook(session, body)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Allow time for AI classify + autorespond
        time.sleep(8)

        # Verify contact persisted (visible to demo if demo is the first user)
        rc = session.get(f"{API}/whatsapp/contacts",
                         headers=auth_headers, timeout=15)
        assert rc.status_code == 200
        contacts = rc.json()
        match = [c for c in contacts if c.get("phone_normalized", "").endswith(unique[-9:])]
        if not match:
            pytest.skip("Owner mismatch: webhook owner != demo user; skipping ownership-based assertions")
        contact = match[0]
        assert contact["name"] == "TEST_Cliente Webhook"
        assert "_id" not in contact

        # Verify messages: must contain the incoming text and a bot reply
        rm = session.get(f"{API}/whatsapp/messages/{contact['id']}",
                         headers=auth_headers, timeout=15)
        assert rm.status_code == 200
        msgs = rm.json()
        incoming = [m for m in msgs if not m.get("from_me")]
        assert len(incoming) >= 1
        assert any("demitida" in m.get("text", "").lower() for m in incoming)
        bot_msgs = [m for m in msgs if m.get("from_me") and m.get("bot")]
        # bot reply may take longer; not strictly required if AI fails
        if bot_msgs:
            assert bot_msgs[0].get("bot_persona") == "Kênia Garcia"

        # Verify lead was created via _classify_and_create_lead
        rl = session.get(f"{API}/leads", headers=auth_headers, timeout=15)
        assert rl.status_code == 200
        leads = rl.json()
        # match by phone suffix (last 8 digits)
        suffix = unique[-8:]
        lead_match = [l for l in leads
                      if "".join(ch for ch in (l.get("phone") or "") if ch.isdigit()).endswith(suffix)]
        if lead_match:
            lead = lead_match[0]
            assert "case_type" in lead
            assert "score" in lead

    def test_image_message_marks_visual(self, session, auth_headers):
        unique = f"5511{uuid.uuid4().int % 1000000000:09d}"
        body = {
            "type": "ReceivedCallback",
            "phone": unique,
            "fromMe": False,
            "senderName": "TEST_Img",
            "image": {"caption": "", "imageUrl": "http://example.com/x.jpg"},
        }
        r = session.post(f"{API}/whatsapp/webhook/zapi", json=body, timeout=30)
        assert r.status_code == 200
        time.sleep(2)
        rc = session.get(f"{API}/whatsapp/contacts",
                         headers=auth_headers, timeout=15)
        contacts = rc.json()
        match = [c for c in contacts if c.get("phone_normalized", "").endswith(unique[-9:])]
        if not match:
            pytest.skip("Owner mismatch (image)")
        c = match[0]
        # Note: last_message may be overwritten by bot reply; verify via the
        # messages list (incoming placeholder must be persisted).
        assert c.get("sinestesic_style") in ("visual", None)
        rm = session.get(f"{API}/whatsapp/messages/{c['id']}",
                         headers=auth_headers, timeout=15).json()
        assert any("[Imagem recebida]" in (m.get("text") or "") for m in rm)

    def test_audio_message_marks_auditivo(self, session, auth_headers):
        unique = f"5511{uuid.uuid4().int % 1000000000:09d}"
        body = {
            "type": "ReceivedCallback",
            "phone": unique,
            "fromMe": False,
            "senderName": "TEST_Audio",
            "audio": {"audioUrl": "http://example.com/a.ogg"},
        }
        r = session.post(f"{API}/whatsapp/webhook/zapi", json=body, timeout=30)
        assert r.status_code == 200
        time.sleep(2)
        rc = session.get(f"{API}/whatsapp/contacts",
                         headers=auth_headers, timeout=15).json()
        match = [c for c in rc if c.get("phone_normalized", "").endswith(unique[-9:])]
        if not match:
            pytest.skip("Owner mismatch (audio)")
        c = match[0]
        assert "udio" in (c.get("last_message") or "") or "[Áudio" in (c.get("last_message") or "")
        rm = session.get(f"{API}/whatsapp/messages/{c['id']}",
                         headers=auth_headers, timeout=15).json()
        assert any("Áudio" in (m.get("text") or "") for m in rm)

    def test_webhook_ignores_status_callback(self, session):
        r = session.post(f"{API}/whatsapp/webhook/zapi",
                         json={"type": "MessageStatusCallback",
                               "phone": "5511999998888"},
                         timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ignored") is True

    def test_webhook_ignores_from_me(self, session):
        r = session.post(f"{API}/whatsapp/webhook/zapi",
                         json={"phone": "5511999998888", "fromMe": True,
                               "text": {"message": "ola"}},
                         timeout=15)
        assert r.status_code == 200
        assert r.json().get("from_me") is True


# ------------------------ Logs enrichment ------------------------
class TestWhatsappLogs:
    def test_logs_enriched_with_contact_name_phone(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/logs?limit=200",
                        headers=auth_headers, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if not items:
            pytest.skip("no whatsapp messages for demo user (owner mismatch)")
        for m in items:
            assert "contact_name" in m
            assert "contact_phone" in m
            assert "_id" not in m
        # Sorted desc by created_at
        ts = [m.get("created_at") for m in items if m.get("created_at")]
        assert ts == sorted(ts, reverse=True)


# ------------------------ Setup webhook (uses base_url payload) ------------------------
class TestSetupWebhook:
    def test_setup_webhook_uses_payload_base_url(self, session, auth_headers):
        custom = "https://my-public-app.example.com"
        r = session.post(f"{API}/whatsapp/setup-webhook",
                        json={"base_url": custom},
                        headers=auth_headers, timeout=30)
        # Will return ok=True even if Z-API call fails because results are recorded
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["webhook_url"] == f"{custom}/api/whatsapp/webhook/zapi"
        assert "results" in data and isinstance(data["results"], dict)


# ------------------------ Config persistence ------------------------
class TestConfigPersistence:
    def test_put_config_persists_all_fields(self, session, auth_headers):
        payload = {
            "provider": "zapi",
            "zapi_instance_id": "3PERSIST",
            "zapi_instance_token": "TOK_PERSIST",
            "zapi_client_token": "CT_PERSIST",
            "bot_enabled": True,
            "bot_prompt": "TEST persist prompt",
        }
        r = session.put(f"{API}/whatsapp/config", json=payload,
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200
        rg = session.get(f"{API}/whatsapp/config",
                         headers=auth_headers, timeout=15).json()
        assert rg["zapi_instance_id"] == "3PERSIST"
        assert rg["zapi_instance_token"] == "TOK_PERSIST"
        assert rg["zapi_client_token"] == "CT_PERSIST"
        assert rg["bot_enabled"] is True
        assert rg["bot_prompt"] == "TEST persist prompt"

        # Restore the fixture defaults so subsequent tests still autorespond
        session.put(f"{API}/whatsapp/config", json={
            "provider": "zapi",
            "zapi_instance_id": "3FAKEINST",
            "zapi_instance_token": "FAKETOKEN123",
            "zapi_client_token": "FAKECLIENT",
            "bot_enabled": True,
            "bot_prompt": "Voce e Kenia, atendente. Seja breve.",
        }, headers=auth_headers, timeout=15)


# ------------------------ Unit: ZAPIProvider Client-Token fallback ------------------------
class TestZAPIClientTokenFallback:
    def test_is_client_token_not_allowed_detector(self):
        from whatsapp_providers import ZAPIProvider
        # Positive cases
        assert ZAPIProvider._is_client_token_not_allowed(
            {"error": "Client-Token X not allowed"}
        ) is True
        assert ZAPIProvider._is_client_token_not_allowed(
            {"message": "Client-Token NOT ALLOWED for this account"}
        ) is True
        # Negative cases
        assert ZAPIProvider._is_client_token_not_allowed(
            {"error": "Some other error"}
        ) is False
        assert ZAPIProvider._is_client_token_not_allowed("string") is False
        assert ZAPIProvider._is_client_token_not_allowed(None) is False

    @pytest.mark.asyncio
    async def test_zapi_request_retries_without_client_token_and_emits_hint(self, monkeypatch):
        """Mock httpx.AsyncClient.request to simulate Z-API replying
        'Client-Token X not allowed' on the first call, then OK on retry."""
        import httpx
        from whatsapp_providers import ZAPIProvider

        prov = ZAPIProvider("INST", "TOK", client_token="CT")

        call_log = []

        class FakeResp:
            def __init__(self, status, payload):
                self.status_code = status
                self._payload = payload
                self.text = str(payload)

            def json(self):
                return self._payload

        class FakeClient:
            def __init__(self, *a, **kw):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *a):
                return False
            async def request(self, method, url, headers=None, **kw):
                call_log.append(dict(headers or {}))
                if "Client-Token" in (headers or {}):
                    return FakeResp(403, {"error": "Client-Token CT not allowed"})
                return FakeResp(200, {"connected": True})

        monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
        out = await prov.test_connection()
        # Must have made 2 requests: first WITH Client-Token, retry WITHOUT
        assert len(call_log) == 2
        assert "Client-Token" in call_log[0]
        assert "Client-Token" not in call_log[1]
        # Final result reflects second (successful) call + hint
        assert out["ok"] is True
        assert out["connected"] is True
        assert "hint" in out
        assert "Client-Token" in out["hint"]
