"""Iteration 6 tests: bot autoresponse delivery tracking + bot_prompt fallback.

Validates the fixes:
  (a) `_maybe_autorespond` now stores `delivered`/`provider_response`/`provider_status`
      on the bot reply message (server.py ~L1035).
  (b) `bot_prompt` validation: empty/'keep'/'default'/<50chars falls back to
      KENIA_DEFAULT_PROMPT (server.py ~L984).
  (c) New endpoint GET /api/whatsapp/bot-delivery-stats (server.py ~L1676).

The Z-API instance is REAL but accepts any phone number (returns 200 + zaapId
even for fake numbers), so we can use TEST_-prefixed names/phones.
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


# ---------- fixtures ----------
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
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _put_config(session, auth_headers, **overrides):
    cfg = {
        "provider": "zapi",
        "zapi_instance_id": ZAPI_INSTANCE,
        "zapi_instance_token": ZAPI_TOKEN,
        "zapi_client_token": ZAPI_CLIENT_TOKEN,
        "bot_enabled": True,
        "bot_auto_reply": True,
    }
    cfg.update(overrides)
    r = session.put(f"{API}/whatsapp/config", headers=auth_headers, json=cfg, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


# ---------- bot delivery stats endpoint ----------
class TestBotDeliveryStatsEndpoint:
    def test_endpoint_shape(self, session, auth_headers):
        r = session.get(
            f"{API}/whatsapp/bot-delivery-stats", headers=auth_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in (
            "total_bot_replies",
            "delivered",
            "failed",
            "unknown",
            "delivery_rate",
            "recent_failures",
        ):
            assert k in data, f"missing field {k} in {data}"
        assert isinstance(data["total_bot_replies"], int)
        assert isinstance(data["delivered"], int)
        assert isinstance(data["failed"], int)
        assert isinstance(data["recent_failures"], list)
        # delivery_rate is a number 0..100
        assert 0 <= float(data["delivery_rate"]) <= 100


# ---------- bot autoresponse triggers + delivered flag ----------
class TestBotAutorespondDelivered:
    def test_webhook_triggers_bot_with_delivered_flag(self, session, auth_headers):
        # 1. Configure with bot_enabled=True + valid bot_prompt
        _put_config(
            session, auth_headers,
            bot_prompt=(
                "Voce e Kenia, atendente do escritorio de advocacia. "
                "Seja empatica, profissional e responda em portugues do Brasil. "
                "Pergunte o nome do cliente e sobre o caso."
            ),
        )

        # 2. Snapshot stats BEFORE
        r0 = session.get(
            f"{API}/whatsapp/bot-delivery-stats", headers=auth_headers, timeout=15
        )
        assert r0.status_code == 200
        before = r0.json()
        delivered_before = before["delivered"]
        total_before = before["total_bot_replies"]

        # 3. Send webhook
        test_phone = f"5511{int(time.time())%100000000:08d}"
        text_marker = f"TEST_BOT_DELIVERY_{uuid.uuid4().hex[:6]}"
        payload = {
            "phone": test_phone,
            "senderName": "TEST_BOT_DELIVERY",
            "text": {"message": f"oi quero saber sobre divorcio {text_marker}"},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "type": "ReceivedCallback",
        }
        r1 = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert body.get("ok") is True
        assert not body.get("ignored"), body

        # 4. wait for LLM + send_text (~3-6s)
        time.sleep(10)

        # 5. Stats AFTER must show +1 reply (delivered or failed)
        r2 = session.get(
            f"{API}/whatsapp/bot-delivery-stats", headers=auth_headers, timeout=15
        )
        assert r2.status_code == 200
        after = r2.json()
        # at least one new reply tracked
        assert after["total_bot_replies"] >= total_before + 1, (
            f"bot reply not tracked: before={total_before} after={after['total_bot_replies']}"
        )
        # delivered should bump (Z-API accepts any number)
        assert after["delivered"] >= delivered_before + 1, (
            f"delivered did not increment. before={delivered_before} after={after['delivered']} "
            f"recent_failures={after.get('recent_failures')[:2]}"
        )

    def test_bot_prompt_keep_falls_back_to_kenia(self, session, auth_headers):
        """If bot_prompt is the literal 'keep', the bot must still reply
        using KENIA_DEFAULT_PROMPT (empathetic, Brazilian, legal-themed)."""
        _put_config(session, auth_headers, bot_prompt="keep")

        # send webhook
        test_phone = f"5521{int(time.time())%100000000:08d}"
        marker = f"TEST_KEEP_{uuid.uuid4().hex[:6]}"
        payload = {
            "phone": test_phone,
            "senderName": "TEST_KEEP_FALLBACK",
            "text": {"message": f"ola, preciso de ajuda com pensao {marker}"},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "type": "ReceivedCallback",
        }
        r = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        time.sleep(10)

        # fetch logs and find the bot reply text
        rl = session.get(
            f"{API}/whatsapp/logs", headers=auth_headers, params={"limit": 30}, timeout=15
        )
        assert rl.status_code == 200, rl.text
        logs = rl.json()
        # find bot reply (from_me=true, bot=true) for our phone
        bot_replies = [
            m for m in logs
            if m.get("bot") is True
            and m.get("from_me") is True
            and (m.get("contact_phone") or "").endswith(test_phone[-8:])
        ]
        assert bot_replies, (
            f"No bot reply found for {test_phone}. "
            f"recent={[(m.get('text','')[:60], m.get('contact_phone')) for m in logs[:5]]}"
        )
        reply_text = (bot_replies[0].get("text") or "").lower()
        # MUST NOT be the literal 'keep' or treat 'keep' as instruction
        assert reply_text.strip() != "keep", "bot returned literal 'keep'"
        assert "keep" not in reply_text or len(reply_text) > 50, (
            f"reply seems to follow 'keep' literally: {reply_text[:200]}"
        )
        # signs of Portuguese/Kenia style (case-insensitive)
        kenia_indicators = [
            "ola", "olá", "tudo bem", "kenia", "kênia", "boa", "bom",
            "ajud", "escritor", "advog", "voce", "você", "nome",
            "obrigad", "claro", "entendo", "compreend", "case", "caso",
            "certament", "podemos",
        ]
        assert any(ind in reply_text for ind in kenia_indicators), (
            f"reply does not look like Kenia (Portuguese/empathetic): {reply_text[:200]}"
        )

        # delivered should be true on the bot message
        assert bot_replies[0].get("delivered") is True, (
            f"bot reply not delivered: {bot_replies[0]}"
        )

    def test_bot_prompt_empty_falls_back(self, session, auth_headers):
        _put_config(session, auth_headers, bot_prompt="")
        # Just confirm config saved (validation happens at autorespond time)
        r = session.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        # bot_prompt may be stored as empty string -> still valid PUT
        assert body.get("bot_enabled") is True


# ---------- regressions ----------
class TestRegressions:
    def test_test_connection(self, session, auth_headers):
        _put_config(session, auth_headers)
        r = session.post(f"{API}/whatsapp/test-connection", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("connected") is True

    def test_setup_webhook(self, session, auth_headers):
        _put_config(session, auth_headers)
        r = session.post(
            f"{API}/whatsapp/setup-webhook", headers=auth_headers,
            json={"base_url": BASE_URL}, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("verified") is True

    def test_baileys_status(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/baileys/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_baileys_qr(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/baileys/qr", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert ("qr" in data) or (data.get("connected") is True)

    def test_zapi_webhook_group_ignored(self):
        payload = {
            "phone": "120363423160081802",
            "senderName": "TEST_GROUP",
            "text": {"message": "ignore me"},
            "instanceId": ZAPI_INSTANCE,
            "fromMe": False,
            "isGroup": True,
            "type": "ReceivedCallback",
        }
        r = requests.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("ignored") is True
        assert body.get("reason") == "group-or-newsletter"
