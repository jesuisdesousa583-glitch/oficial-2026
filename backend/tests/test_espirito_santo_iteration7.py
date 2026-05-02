"""
Backend tests for 'Espírito Santo AI' app - iteration 7.
Covers:
 - Auth (login demo + register + /auth/me)
 - Root endpoint (/api/)
 - Leads CRUD (/api/leads)
 - WhatsApp config (/api/whatsapp/config) default bot_prompt
 - Baileys status and QR endpoints
 - Voice endpoints /voice/tts, /voice/transcribe, /voice/command
 - Baileys webhook /whatsapp/webhook/baileys (auth+text+audio)
"""

import os
import base64
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://baileys-auto.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
BAILEYS_TOKEN = "espirito-santo-baileys-2026"
DEMO_EMAIL = "demo@espirito-santo.com.br"
DEMO_PASSWORD = "demo123"


# -------- Fixtures --------

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data
    assert data["user"]["email"] == DEMO_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# -------- Basic/root --------

def test_root_endpoint(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("message") == "Espírito Santo AI API"
    assert data.get("status") == "ok"


# -------- Auth --------

def test_login_demo_auto_create(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("token"), str) and len(data["token"]) > 10
    assert data["user"]["email"] == DEMO_EMAIL


def test_login_invalid_password(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_register_and_me(session):
    email = f"TEST_es_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={
        "name": "TEST User", "email": email, "password": "Pass@123",
    }, timeout=20)
    assert r.status_code == 200, r.text[:200]
    tok = r.json()["token"]
    r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r2.status_code == 200
    me = r2.json()
    assert me["email"] == email
    assert "password" not in me


def test_auth_me_no_token(session):
    r = session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401


# -------- Leads --------

def test_create_and_list_leads(auth_headers):
    payload = {
        "name": "TEST Lead ES",
        "phone": "+5511999990001",
        "email": "testlead@example.com",
        "case_type": "Trabalhista",
        "description": "Teste lead iteration 7",
        "source": "test",
    }
    r = requests.post(f"{API}/leads", headers=auth_headers, json=payload, timeout=20)
    assert r.status_code == 200, r.text[:200]
    created = r.json()
    assert created["name"] == payload["name"]
    assert created["phone"] == payload["phone"]
    assert created["stage"] == "novos_leads"
    assert "id" in created

    # GET to verify persistence
    r2 = requests.get(f"{API}/leads", headers=auth_headers, timeout=20)
    assert r2.status_code == 200
    leads = r2.json()
    assert any(l["id"] == created["id"] for l in leads)

    # cleanup
    requests.delete(f"{API}/leads/{created['id']}", headers=auth_headers, timeout=15)


# -------- WhatsApp config --------

def test_whatsapp_config_has_bot_prompt(auth_headers):
    r = requests.get(f"{API}/whatsapp/config", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    cfg = r.json()
    assert "bot_prompt" in cfg
    assert isinstance(cfg["bot_prompt"], str)
    assert len(cfg["bot_prompt"]) > 0


# -------- Baileys status / qr --------

def test_baileys_status(auth_headers):
    r = requests.get(f"{API}/whatsapp/baileys/status", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    # Should have state field, and maybe me
    assert "state" in data or "ok" in data


def test_baileys_qr(auth_headers):
    r = requests.get(f"{API}/whatsapp/baileys/qr", headers=auth_headers, timeout=30)
    # May return 200 with qr fields OR 200 with error if service is starting
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    # Ensure response is a dict; content varies by connection state
    assert isinstance(data, dict)


def test_baileys_status_requires_auth():
    r = requests.get(f"{API}/whatsapp/baileys/status", timeout=15)
    assert r.status_code == 401


# -------- Voice endpoints --------

@pytest.fixture(scope="session")
def tts_audio_bytes(auth_headers):
    """Generate a small MP3 via /voice/tts to reuse in transcribe and command tests."""
    r = requests.post(
        f"{API}/voice/tts",
        headers=auth_headers,
        json={"text": "Olá, este é um teste de transcrição.", "voice": "nova"},
        timeout=60,
    )
    assert r.status_code == 200, f"tts failed: {r.status_code} {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("audio/"), r.headers
    assert len(r.content) > 1000
    return r.content


def test_voice_tts(tts_audio_bytes):
    assert tts_audio_bytes[:3] in (b"ID3",) or len(tts_audio_bytes) > 1000  # MP3 begins with ID3 or raw frame


def test_voice_transcribe(tts_audio_bytes, auth_token):
    files = {"file": ("voice.mp3", tts_audio_bytes, "audio/mpeg")}
    headers = {"Authorization": f"Bearer {auth_token}"}
    r = requests.post(f"{API}/voice/transcribe", headers=headers, files=files, timeout=90)
    assert r.status_code == 200, f"transcribe failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("ok") is True
    assert isinstance(data.get("text"), str)
    assert len(data["text"]) > 0


def test_voice_command_roundtrip(tts_audio_bytes, auth_headers):
    b64 = base64.b64encode(tts_audio_bytes).decode("ascii")
    r = requests.post(
        f"{API}/voice/command",
        headers=auth_headers,
        json={"audio_base64": b64, "mime": "audio/mpeg", "voice": "nova"},
        timeout=120,
    )
    assert r.status_code == 200, f"voice/command failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("ok") is True
    assert isinstance(data.get("transcription"), str) and len(data["transcription"]) > 0
    assert isinstance(data.get("reply"), str) and len(data["reply"]) > 0
    assert isinstance(data.get("audio_base64"), str) and len(data["audio_base64"]) > 1000


# -------- Baileys webhook --------

def test_baileys_webhook_unauthorized(session):
    r = session.post(
        f"{API}/whatsapp/webhook/baileys",
        json={"token": "wrong-token", "phone": "+551199000001", "text": "oi"},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is False
    assert data.get("error") == "unauthorized"


def test_baileys_webhook_text(session):
    r = session.post(
        f"{API}/whatsapp/webhook/baileys",
        json={
            "token": BAILEYS_TOKEN,
            "phone": "+5511900000099",
            "name": "TEST ES Webhook",
            "text": "Ola, gostaria de informacoes sobre direito trabalhista",
        },
        timeout=60,
    )
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("ok") is True


def test_baileys_webhook_audio(session, tts_audio_bytes):
    b64 = base64.b64encode(tts_audio_bytes).decode("ascii")
    r = session.post(
        f"{API}/whatsapp/webhook/baileys",
        json={
            "token": BAILEYS_TOKEN,
            "phone": "+5511900000100",
            "name": "TEST ES Webhook Audio",
            "audio_base64": b64,
            "audio_mime": "audio/mpeg",
        },
        timeout=120,
    )
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("ok") is True
    # transcribed flag should be true for real audio input
    assert data.get("transcribed") is True
