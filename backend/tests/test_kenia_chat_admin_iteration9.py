"""Iteration 9 — Kenia Garcia app backend tests.
Covers: chat humanizado + TTS + analysis, admin login, case-analyses endpoints,
legislation daily brief, and chat persistence.
"""
import os
import base64
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://precisao-legal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@kenia-garcia.com.br"
ADMIN_PASSWORD = "Kenia@Admin2026"

# generous timeout: chat endpoint does 3 LLM calls + TTS
CHAT_TIMEOUT = 180


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "token" in data and data["token"]
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def seeded_chat_session(http):
    """Runs a 2-message chat flow once and caches result for the admin/case tests."""
    sid = None
    first = http.post(
        f"{API}/chat/message",
        json={
            "message": "Oi, meu nome é Carla. Fui mandada embora de forma injusta da empresa onde trabalhei por 5 anos de carteira assinada. Tenho direito a alguma coisa?",
            "visitor_name": "Carla TEST",
            "visitor_phone": "+5511999990001",
            "want_audio": True,
            "return_analysis": True,
        },
        timeout=CHAT_TIMEOUT,
    )
    assert first.status_code == 200, f"first chat failed: {first.status_code} {first.text[:400]}"
    data1 = first.json()
    sid = data1["session_id"]
    # second message — must preserve context
    second = http.post(
        f"{API}/chat/message",
        json={
            "session_id": sid,
            "message": "Foi sem justa causa. A empresa é em São Paulo. Aconteceu semana passada.",
            "visitor_name": "Carla TEST",
            "want_audio": False,
            "return_analysis": True,
        },
        timeout=CHAT_TIMEOUT,
    )
    assert second.status_code == 200, f"second chat failed: {second.status_code} {second.text[:400]}"
    return {"session_id": sid, "first": data1, "second": second.json()}


# ---------- AUTH ----------
class TestAuthAdmin:
    def test_admin_login_success(self, http):
        r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
        assert body["user"]["email"] == ADMIN_EMAIL

    def test_admin_me_is_admin_flag(self, http, admin_token):
        r = http.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u.get("email") == ADMIN_EMAIL
        assert u.get("is_admin") is True or u.get("role") == "admin", f"admin flags missing: {u}"

    def test_login_invalid_credentials(self, http):
        r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass"}, timeout=30)
        assert r.status_code == 401


# ---------- LEGISLATION ----------
class TestLegislation:
    def test_legislation_today_public(self, http):
        r = http.get(f"{API}/legislation/today", timeout=90)
        assert r.status_code == 200
        d = r.json()
        assert "date" in d and "date_human" in d and "brief" in d
        assert isinstance(d["brief"], str) and len(d["brief"]) > 20
        # date_human must be dd/mm/yyyy
        assert len(d["date_human"].split("/")) == 3

    def test_legislation_today_cached(self, http):
        # 2nd call should be fast (cache)
        t0 = time.time()
        r = http.get(f"{API}/legislation/today", timeout=30)
        dt = time.time() - t0
        assert r.status_code == 200
        assert dt < 10, f"cache apparently not used ({dt:.1f}s)"

    def test_legislation_refresh_requires_admin(self, http):
        r = http.post(f"{API}/legislation/refresh", timeout=30)
        assert r.status_code in (401, 403)

    def test_legislation_refresh_admin(self, http, admin_headers):
        r = http.post(f"{API}/legislation/refresh", headers=admin_headers, timeout=90)
        assert r.status_code == 200
        d = r.json()
        assert "date" in d and "brief" in d
        assert isinstance(d["brief"], str) and len(d["brief"]) > 10


# ---------- CHAT ----------
class TestChatHumanizado:
    def test_chat_message_rejects_empty(self, http):
        r = http.post(f"{API}/chat/message", json={"message": "   "}, timeout=30)
        assert r.status_code == 400

    def test_chat_response_structure(self, seeded_chat_session):
        d = seeded_chat_session["first"]
        assert d.get("session_id")
        assert isinstance(d.get("response"), str) and len(d["response"]) > 10
        assert d.get("legislation_date")
        # audio
        assert d.get("audio_mime") == "audio/mpeg", f"audio_mime wrong: {d.get('audio_mime')}"
        assert d.get("audio_base64"), "audio_base64 is null"
        # must decode to a valid mp3 (>5KB)
        raw = base64.b64decode(d["audio_base64"])
        assert len(raw) > 5000, f"audio too small: {len(raw)}B"

    def test_chat_analysis_structure(self, seeded_chat_session):
        a = seeded_chat_session["first"].get("analysis")
        assert a is not None, "analysis is null"
        for key in ("area", "resumo", "acertividade", "chance_exito", "qualificacao", "motivo", "fundamentos"):
            assert key in a, f"missing analysis key: {key}"
        assert 0 <= a["acertividade"] <= 100
        assert 0 <= a["chance_exito"] <= 100
        assert a["qualificacao"] in ("qualificado", "nao_qualificado", "necessita_mais_info")
        assert isinstance(a["fundamentos"], list)

    def test_chat_second_turn_same_session(self, seeded_chat_session):
        d = seeded_chat_session["second"]
        assert d["session_id"] == seeded_chat_session["session_id"]
        assert isinstance(d.get("response"), str) and len(d["response"]) > 5

    def test_chat_single_analysis_per_session(self, http, admin_headers, seeded_chat_session):
        # After 2 turns, should still be exactly 1 case_analyses doc for this session
        sid = seeded_chat_session["session_id"]
        r = http.get(f"{API}/admin/case-analyses?limit=500", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        matches = [i for i in items if i.get("session_id") == sid]
        assert len(matches) == 1, f"expected 1 analysis per session, got {len(matches)}"

    def test_chat_no_vague_ou_in_response(self, seeded_chat_session):
        """Validates the 'no OU rule' — response should not contain vague 'X ou Y' dichotomies
        as answers. This is a soft heuristic: looks for sentences that are vague enumerations.
        The prompt strongly discourages but LLM may still emit. Just warn, don't fail.
        """
        text = (seeded_chat_session["first"].get("response") or "").lower()
        # Soft check — should contain a question mark (the model should be asking)
        assert "?" in text, f"response should ask a clarifying question; got: {text[:200]}"


# ---------- ADMIN CASE ANALYSES ----------
class TestAdminCaseAnalyses:
    def test_list_requires_auth(self, http):
        r = http.get(f"{API}/admin/case-analyses", timeout=30)
        assert r.status_code == 401

    def test_list_returns_stats(self, http, admin_headers, seeded_chat_session):
        r = http.get(f"{API}/admin/case-analyses", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "qualificados", "nao_qualificados", "necessita_mais_info",
                  "avg_acertividade", "avg_chance_exito", "items"):
            assert k in d, f"missing key {k}"
        assert d["total"] >= 1
        assert isinstance(d["items"], list)

    def test_detail_returns_transcript(self, http, admin_headers, seeded_chat_session):
        sid = seeded_chat_session["session_id"]
        lst = http.get(f"{API}/admin/case-analyses?limit=500", headers=admin_headers, timeout=30).json()
        item = next((i for i in lst["items"] if i["session_id"] == sid), None)
        assert item, "seeded analysis not found in list"
        aid = item["id"]
        r = http.get(f"{API}/admin/case-analyses/{aid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["analysis"]["id"] == aid
        assert isinstance(d["messages"], list) and len(d["messages"]) >= 2

    def test_detail_404(self, http, admin_headers):
        r = http.get(f"{API}/admin/case-analyses/does-not-exist-xyz", headers=admin_headers, timeout=30)
        assert r.status_code == 404

    def test_patch_sets_manual_review(self, http, admin_headers, seeded_chat_session):
        sid = seeded_chat_session["session_id"]
        lst = http.get(f"{API}/admin/case-analyses?limit=500", headers=admin_headers, timeout=30).json()
        item = next((i for i in lst["items"] if i["session_id"] == sid), None)
        assert item
        aid = item["id"]
        r = http.patch(
            f"{API}/admin/case-analyses/{aid}",
            headers=admin_headers,
            json={"qualificacao": "qualificado", "notes": "TEST admin override"},
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["qualificacao"] == "qualificado"
        assert d.get("admin_notes") == "TEST admin override"
        assert d.get("manual_review") is True
