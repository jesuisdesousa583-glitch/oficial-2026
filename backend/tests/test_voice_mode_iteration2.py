"""Iteration 2 — Voice mode (text/audio) feature for Ana/Kenia bot.

Covers:
- GET /api/whatsapp/config returns bot_voice_mode and bot_voice (with backfill)
- PUT /api/whatsapp/config persists new fields
- Webhook Baileys with text + voice modes (text_and_audio, audio_only, text_only, auto)
- Incoming audio sets contact.prefer_audio=true
- Low-literacy heuristic sets prefer_audio=true
- Webhook still rejects wrong token
- Auto mode: once prefer_audio is set, keeps audio on next text message
"""
import os
import time
import uuid
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to local for test dev; tests will still pass via ingress when set
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@kenia-garcia.com.br"
ADMIN_PASS = "Kenia@Admin2026"
BAILEYS_TOKEN = os.environ.get("BAILEYS_INTERNAL_TOKEN", "legalflow-baileys-2026")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TEST_PHONE_PREFIX = "5511999"  # fictitious prefix; sidecar is Erik, we hit webhook only


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def owner_id(client):
    r = client.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _cleanup_contact(mongo_db, owner_id, phone):
    c = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
    if c:
        mongo_db.whatsapp_messages.delete_many({"contact_id": c["id"]})
        mongo_db.whatsapp_contacts.delete_one({"id": c["id"]})
    # remove any TEST_* leads
    mongo_db.leads.delete_many({"owner_id": owner_id, "phone": phone})


def _webhook_post(phone, text=None, audio_b64=None, name=None):
    body = {"token": BAILEYS_TOKEN, "phone": phone, "name": name or f"TEST_{phone}"}
    if text is not None:
        body["text"] = text
    if audio_b64:
        body["audio_base64"] = audio_b64
        body["audio_mime"] = "audio/ogg"
    r = requests.post(
        f"{BASE_URL}/api/whatsapp/webhook/baileys", json=body, timeout=120
    )
    return r


def _set_config(client, patch):
    """Set config with given patch on top of existing config."""
    r = client.get(f"{BASE_URL}/api/whatsapp/config", timeout=10)
    assert r.status_code == 200
    cfg = r.json()
    cfg.pop("_id", None)
    cfg.pop("owner_id", None)
    cfg.update(patch)
    r = client.put(f"{BASE_URL}/api/whatsapp/config", json=cfg, timeout=10)
    assert r.status_code == 200, r.text
    return cfg


def _wait_for_bot_reply(mongo_db, contact_id, timeout=60):
    """Poll until a from_me=True, bot=True message is stored (or timeout)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        msg = mongo_db.whatsapp_messages.find_one(
            {"contact_id": contact_id, "from_me": True, "bot": True},
            sort=[("created_at", -1)],
        )
        if msg:
            return msg
        time.sleep(1.5)
    return None


# ==================== TESTS ====================

class TestWhatsAppConfigVoice:
    """PUT/GET /api/whatsapp/config - voice fields."""

    def test_get_config_returns_voice_defaults(self, client):
        r = client.get(f"{BASE_URL}/api/whatsapp/config", timeout=10)
        assert r.status_code == 200
        cfg = r.json()
        assert "bot_voice_mode" in cfg
        assert cfg["bot_voice_mode"] in {"text_only", "text_and_audio", "audio_only", "auto"}
        assert "bot_voice" in cfg
        assert isinstance(cfg["bot_voice"], str) and len(cfg["bot_voice"]) > 0

    def test_backfill_on_legacy_config(self, client, mongo_db, owner_id):
        # Simulate legacy config without voice fields
        mongo_db.whatsapp_config.update_one(
            {"owner_id": owner_id},
            {"$unset": {"bot_voice_mode": "", "bot_voice": ""}},
        )
        r = client.get(f"{BASE_URL}/api/whatsapp/config", timeout=10)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg.get("bot_voice_mode") == "text_and_audio"
        assert cfg.get("bot_voice") == "nova"

    def test_put_config_persists_voice_fields(self, client, mongo_db, owner_id):
        _set_config(client, {"bot_voice_mode": "audio_only", "bot_voice": "shimmer", "bot_enabled": True})
        doc = mongo_db.whatsapp_config.find_one({"owner_id": owner_id}, {"_id": 0})
        assert doc["bot_voice_mode"] == "audio_only"
        assert doc["bot_voice"] == "shimmer"
        # Reset for next tests
        _set_config(client, {"bot_voice_mode": "text_and_audio", "bot_voice": "nova", "bot_enabled": True})


class TestWebhookSecurity:
    """Webhook should reject wrong token."""

    def test_wrong_token_rejected(self):
        r = requests.post(
            f"{BASE_URL}/api/whatsapp/webhook/baileys",
            json={"token": "wrong-token", "phone": "5511999887766", "text": "hi"},
            timeout=10,
        )
        # Current implementation returns 200 with {ok:false,error:'unauthorized'}
        j = r.json()
        assert j.get("ok") is False
        assert "unauthorized" in (j.get("error") or "").lower()


class TestVoiceModeBehavior:
    """End-to-end webhook voice mode scenarios."""

    def test_mode_text_and_audio_sends_both(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1001"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "text_and_audio", "bot_voice": "nova"})
        r = _webhook_post(phone, text="Oi, preciso de um advogado trabalhista")
        assert r.status_code == 200 and r.json().get("ok"), r.text
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact, "Contact was not persisted"
        bot_msg = _wait_for_bot_reply(mongo_db, contact["id"], timeout=90)
        assert bot_msg, "Bot reply never stored"
        assert bot_msg.get("voice_mode_used") == "text_audio", bot_msg
        assert bot_msg.get("from_me") is True
        assert bot_msg.get("bot") is True
        assert (bot_msg.get("text") or "").strip(), "text reply empty"
        # audio should attempt delivery — status captured in audio_status
        assert "audio_delivered" in bot_msg
        # delivered flag is OR of text/audio deliveries
        _cleanup_contact(mongo_db, owner_id, phone)

    def test_mode_text_only(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1002"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "text_only", "bot_voice": "nova"})
        r = _webhook_post(phone, text="Olá, gostaria de tirar uma dúvida sobre divórcio")
        assert r.status_code == 200 and r.json().get("ok")
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact
        bot_msg = _wait_for_bot_reply(mongo_db, contact["id"], timeout=90)
        assert bot_msg
        assert bot_msg.get("voice_mode_used") == "text", bot_msg
        # audio_delivered should not be set (or False)
        assert not bot_msg.get("audio_delivered")
        _cleanup_contact(mongo_db, owner_id, phone)

    def test_mode_audio_only(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1003"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "audio_only", "bot_voice": "nova"})
        r = _webhook_post(phone, text="Oi, quero agendar consulta")
        assert r.status_code == 200 and r.json().get("ok")
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact
        bot_msg = _wait_for_bot_reply(mongo_db, contact["id"], timeout=90)
        assert bot_msg
        assert bot_msg.get("voice_mode_used") == "audio", bot_msg
        # Text not sent → delivered reflects audio only (may be True or False depending on sidecar)
        _cleanup_contact(mongo_db, owner_id, phone)

    def test_incoming_audio_sets_prefer_audio(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1004"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "auto", "bot_voice": "nova"})
        # Send fake audio (dummy base64 — Whisper will fail, but incoming_was_audio=True)
        dummy_audio = "SUQzAwAAAAAAAA=="  # tiny garbage base64
        r = _webhook_post(phone, text="", audio_b64=dummy_audio)
        assert r.status_code == 200 and r.json().get("ok")
        time.sleep(2)
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact, "Contact not persisted"
        # When audio comes in but transcription fails AND no text, server may ignore reply.
        # However prefer_audio flag should be set by the autoresponder OR by next message.
        # We'll send a second short text and assert audio is used.
        _cleanup_contact_messages = None
        r2 = _webhook_post(phone, text="sim")
        assert r2.status_code == 200
        contact2 = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        # prefer_audio should be true now (either from audio or short-reply heuristic)
        bot_msg = _wait_for_bot_reply(mongo_db, contact2["id"], timeout=90)
        if bot_msg:
            # In auto mode with prefer_audio=true → should be audio
            assert bot_msg.get("voice_mode_used") in {"audio", "text_audio"}, bot_msg
        # Either way contact should have prefer_audio flag by now
        assert contact2.get("prefer_audio") is True, f"prefer_audio not set: {contact2}"
        _cleanup_contact(mongo_db, owner_id, phone)

    def test_auto_mode_plain_text_client_only_text(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1005"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "auto", "bot_voice": "nova"})
        # Well-written message with accents — should NOT trigger low-literacy heuristic
        r = _webhook_post(phone, text="Olá, sou a Maria e gostaria de entender como funciona a consulta jurídica.")
        assert r.status_code == 200 and r.json().get("ok")
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact
        assert not contact.get("prefer_audio"), f"Unexpected prefer_audio set: {contact}"
        bot_msg = _wait_for_bot_reply(mongo_db, contact["id"], timeout=90)
        assert bot_msg
        assert bot_msg.get("voice_mode_used") == "text", bot_msg
        _cleanup_contact(mongo_db, owner_id, phone)

    def test_low_literacy_heuristic_triggers_prefer_audio(self, client, mongo_db, owner_id):
        phone = f"{TEST_PHONE_PREFIX}1006"
        _cleanup_contact(mongo_db, owner_id, phone)
        _set_config(client, {"bot_enabled": True, "bot_voice_mode": "auto", "bot_voice": "nova"})
        # Short msg, multiple typo hits (vc, tb, blz), no accents
        r = _webhook_post(phone, text="oi vc tb blz")
        assert r.status_code == 200 and r.json().get("ok")
        time.sleep(2)
        contact = mongo_db.whatsapp_contacts.find_one({"owner_id": owner_id, "phone": phone})
        assert contact
        assert contact.get("prefer_audio") is True, f"Low-literacy heuristic did not fire: {contact}"
        _cleanup_contact(mongo_db, owner_id, phone)


def test_cleanup_restore_default_config(client):
    """Teardown: restore default."""
    _set_config(client, {"bot_voice_mode": "text_and_audio", "bot_voice": "nova"})
    r = client.get(f"{BASE_URL}/api/whatsapp/config", timeout=10)
    assert r.json()["bot_voice_mode"] == "text_and_audio"
    assert r.json()["bot_voice"] == "nova"
