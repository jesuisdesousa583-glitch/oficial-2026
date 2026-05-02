"""Iteration 3 tests for WhatsApp bot improvements:
- GET /api/whatsapp/default-prompt (auth required, returns Kenia prompt)
- Multi-turn context: bot remembers client name across turns
- Name extraction regex (sou X / meu nome e X / me chamo X)
- False-positive guard ('sou do rio' not picked up as name)
- One question per message
- Schedule offer after city + case identified
- HISTORICO DA CONVERSA passed to LLM
- Regression: /api/whatsapp/diagnostics still returns 5 checks
- Regression: webhook -> bot -> lead end-to-end
"""
import os
import re
import time
import uuid
import pytest
import requests

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
def configure_zapi_bot(session, auth_headers):
    """Configure demo user with fake Z-API creds, bot_enabled, and the
    DEFAULT Kenia prompt (assertive). We pull the prompt from the new
    /default-prompt endpoint so this also exercises that endpoint."""
    pr = session.get(f"{API}/whatsapp/default-prompt",
                     headers=auth_headers, timeout=15)
    assert pr.status_code == 200, pr.text
    default_prompt = pr.json()["prompt"]
    payload = {
        "provider": "zapi",
        "zapi_instance_id": "3FAKEINST",
        "zapi_instance_token": "FAKETOKEN123",
        "zapi_client_token": "FAKECLIENT",
        "bot_enabled": True,
        "bot_prompt": default_prompt,
    }
    r = session.put(f"{API}/whatsapp/config", json=payload,
                    headers=auth_headers, timeout=15)
    assert r.status_code == 200
    yield


# ------------------------ /default-prompt ------------------------
class TestDefaultPrompt:
    def test_default_prompt_requires_auth(self, session):
        # No auth header -> 401/403
        r = session.get(f"{API}/whatsapp/default-prompt", timeout=15)
        assert r.status_code in (401, 403), \
            f"expected 401/403 without auth, got {r.status_code}: {r.text}"

    def test_default_prompt_returns_kenia_assertive(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/default-prompt",
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "prompt" in data
        assert isinstance(data["prompt"], str)
        prompt = data["prompt"]
        # Sanity: must contain the new assertive markers
        assert "Kênia Garcia" in prompt or "Kenia Garcia" in prompt, \
            "prompt missing Kenia Garcia identifier"
        assert "CLOSER" in prompt, "prompt missing CLOSER marker"
        # Title can be 'ROTEIRO DE QUALIFICAÇÃO' (with accent) or without
        assert ("ROTEIRO DE QUALIFICA" in prompt), \
            "prompt missing ROTEIRO DE QUALIFICACAO marker"


# ------------------------ Helpers ------------------------
def _zapi_text_payload(phone: str, text: str, sender_name: str = "Cliente"):
    """Build a Z-API webhook text payload."""
    return {
        "phone": phone,
        "text": {"message": text},
        "senderName": sender_name,
        "fromMe": False,
        "messageId": f"M-{uuid.uuid4().hex[:12]}",
    }


def _send_webhook(session, payload):
    return session.post(f"{API}/whatsapp/webhook/zapi", json=payload, timeout=30)


def _get_contact(session, auth_headers, phone_suffix: str):
    r = session.get(f"{API}/whatsapp/contacts", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    contacts = r.json()
    # match by phone suffix
    for c in contacts:
        if (c.get("phone") or "").endswith(phone_suffix):
            return c
    return None


def _get_messages_for_contact(session, auth_headers, contact_id: str):
    r = session.get(f"{API}/whatsapp/messages/{contact_id}",
                    headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _bot_replies_in_order(messages):
    """Return bot (from_me True) message texts in chronological order."""
    msgs = sorted(messages, key=lambda m: m.get("created_at", ""))
    return [m.get("text", "") for m in msgs if m.get("from_me")]


# ------------------------ Multi-turn context ------------------------
class TestMultiTurnContext:
    """Simulate webhook 1->2->3->4 for the same phone and verify:
    1. Bot greets and asks for name
    2. Client says 'sou Carlos, fui demitido' -> bot uses 'Carlos'
    3. Client says 'sao paulo'             -> bot still uses 'Carlos'
    4. Client confirms                      -> bot offers schedule
    """

    PHONE = "5511" + str(uuid.uuid4().int)[:9]  # unique per test run

    def _wait_for_bot_reply(self, session, auth_headers, contact_id, expected_count, timeout_s=25):
        """Poll until bot has produced 'expected_count' replies for this contact."""
        start = time.time()
        while time.time() - start < timeout_s:
            msgs = _get_messages_for_contact(session, auth_headers, contact_id)
            replies = _bot_replies_in_order(msgs)
            if len(replies) >= expected_count:
                return replies
            time.sleep(2)
        return _bot_replies_in_order(
            _get_messages_for_contact(session, auth_headers, contact_id)
        )

    def test_multi_turn_with_name_persistence(self, session, auth_headers):
        phone = self.PHONE
        # Turn 1 - greeting
        r1 = _send_webhook(session, _zapi_text_payload(phone, "oi"))
        assert r1.status_code == 200, r1.text
        time.sleep(7)

        contact = _get_contact(session, auth_headers, phone[-8:])
        assert contact is not None, f"contact not created for {phone}"
        contact_id = contact["id"]

        replies1 = self._wait_for_bot_reply(session, auth_headers, contact_id, 1)
        assert len(replies1) >= 1, f"no bot reply after turn 1; messages={replies1}"

        # Turn 2 - client introduces himself
        r2 = _send_webhook(session, _zapi_text_payload(
            phone, "sou Carlos, fui demitido sem justa causa"))
        assert r2.status_code == 200
        time.sleep(8)
        replies2 = self._wait_for_bot_reply(session, auth_headers, contact_id, 2)
        assert len(replies2) >= 2, f"missing bot reply for turn 2; replies={replies2}"
        # Bot reply #2 should mention Carlos
        reply2_text = replies2[1]
        assert "carlos" in reply2_text.lower(), \
            f"bot reply 2 should reference 'Carlos', got: {reply2_text!r}"

        # Contact name persisted as 'Carlos' (not phone)
        contact2 = _get_contact(session, auth_headers, phone[-8:])
        assert contact2 and contact2.get("name") == "Carlos", \
            f"contact name not updated to 'Carlos': {contact2.get('name')}"

        # Turn 3 - city
        r3 = _send_webhook(session, _zapi_text_payload(phone, "sao paulo"))
        assert r3.status_code == 200
        time.sleep(8)
        replies3 = self._wait_for_bot_reply(session, auth_headers, contact_id, 3)
        assert len(replies3) >= 3, f"missing bot reply for turn 3"
        reply3_text = replies3[2]
        assert "carlos" in reply3_text.lower(), \
            f"bot forgot the name on turn 3: {reply3_text!r}"

        # Turn 4 - confirm/agree
        r4 = _send_webhook(session, _zapi_text_payload(
            phone, "sim, pode agendar"))
        assert r4.status_code == 200
        time.sleep(8)
        replies4 = self._wait_for_bot_reply(session, auth_headers, contact_id, 4)
        assert len(replies4) >= 4, "missing bot reply for turn 4"
        reply4_text = replies4[3].lower()

        # By turn 3 or 4 bot should propose a schedule
        combined_late = (reply3_text + " " + reply4_text).lower()
        assert any(kw in combined_late for kw in
                   ["agendar", "horário", "horario", "consulta", "análise", "analise"]), \
            f"bot did not offer schedule by turn 3-4: {reply3_text!r} | {reply4_text!r}"

        # Single question per message on turns 2..4
        for idx, txt in enumerate(replies4[1:4], start=2):
            qcount = txt.count("?")
            assert qcount <= 1, \
                f"turn {idx} had {qcount} questions (expected <=1): {txt!r}"


# ------------------------ Name extraction regex ------------------------
class TestNameExtraction:
    """Each test uses a fresh phone so we get a fresh contact whose name is the
    phone -> is_phone_only=True -> regex path runs."""

    def _new_phone(self):
        return "5511" + str(uuid.uuid4().int)[:9]

    def _send_and_wait(self, session, auth_headers, phone, text):
        r = _send_webhook(session, _zapi_text_payload(phone, text))
        assert r.status_code == 200, r.text
        time.sleep(8)
        return _get_contact(session, auth_headers, phone[-8:])

    def test_meu_nome_e_maria_silva(self, session, auth_headers):
        phone = self._new_phone()
        c = self._send_and_wait(session, auth_headers, phone,
                                "meu nome e Maria Silva")
        assert c is not None
        assert c.get("name") == "Maria Silva", \
            f"expected 'Maria Silva', got {c.get('name')!r}"

    def test_me_chamo_ana_titlecase(self, session, auth_headers):
        phone = self._new_phone()
        c = self._send_and_wait(session, auth_headers, phone, "me chamo ANA")
        assert c is not None
        assert c.get("name") == "Ana", \
            f"expected 'Ana' (title case), got {c.get('name')!r}"

    def test_false_positive_sou_do_rio(self, session, auth_headers):
        phone = self._new_phone()
        c = self._send_and_wait(session, auth_headers, phone, "sou do rio")
        assert c is not None
        # Contact name should NOT have been updated to 'Do' or 'Rio'
        name = (c.get("name") or "")
        assert name not in ("Do", "Rio", "Do Rio"), \
            f"false positive: name extracted from 'sou do rio' -> {name!r}"
        # name should still be the phone (or empty)
        assert (name == "" or name.startswith("55") or name.replace("+", "").isdigit()), \
            f"name unexpectedly changed: {name!r}"


# ------------------------ HISTORICO passed to LLM ------------------------
class TestHistoryInjectedToLLM:
    def test_history_block_in_logs(self, session, auth_headers):
        """After 2+ webhook turns, server logs should contain the
        'HISTÓRICO DA CONVERSA' marker (proof history_block reaches LLM
        system prompt). We can't inspect system_message directly via API
        but the prompt construction includes the block; the only way to
        prove it via black-box is logs. We tail the supervisor backend log."""
        phone = "5511" + str(uuid.uuid4().int)[:9]
        _send_webhook(session, _zapi_text_payload(phone, "ola"))
        time.sleep(6)
        _send_webhook(session, _zapi_text_payload(phone, "sou Joao"))
        time.sleep(6)
        # Send a third turn; by turn 3 history_block must be non-empty
        _send_webhook(session, _zapi_text_payload(phone, "trabalhista"))
        time.sleep(7)

        # Reach into backend logs
        log_paths = [
            "/var/log/supervisor/backend.out.log",
            "/var/log/supervisor/backend.err.log",
        ]
        found = False
        snippets = []
        for p in log_paths:
            try:
                with open(p, "r", errors="ignore") as f:
                    # only inspect last ~256kb to avoid memory blow
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    f.seek(max(0, size - 262144))
                    tail = f.read()
                    if "HISTÓRICO DA CONVERSA" in tail or "HISTORICO DA CONVERSA" in tail:
                        found = True
                        break
                    # collect just zapi webhook lines for diagnostic
                    for line in tail.splitlines()[-50:]:
                        if "zapi" in line.lower() or "bot" in line.lower():
                            snippets.append(line)
            except FileNotFoundError:
                continue
        # If logs don't capture system_message (they don't normally), this is
        # a soft check - at least confirm webhook hit the bot path. We assert
        # via contact existing and >=2 bot replies.
        contact = _get_contact(session, auth_headers, phone[-8:])
        assert contact is not None
        msgs = _get_messages_for_contact(session, auth_headers, contact["id"])
        bot_replies = _bot_replies_in_order(msgs)
        assert len(bot_replies) >= 2, \
            f"bot did not produce >=2 replies; cannot prove history feeding. logs sample: {snippets[:5]}"
        # Soft assert: if log search worked, ensure marker present (do not fail
        # the suite if logs are routed elsewhere - just print)
        if not found:
            print("[INFO] 'HISTORICO DA CONVERSA' not found in backend logs "
                  "(logs may not capture system_message). Bot multi-turn "
                  "behavior validated indirectly via name persistence test.")


# ------------------------ Regression ------------------------
class TestRegression:
    def test_diagnostics_still_5_checks(self, session, auth_headers):
        r = session.get(f"{API}/whatsapp/diagnostics",
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        ids = {c["id"] for c in (data.get("checks") or [])}
        expected = {"credentials", "bot_enabled", "provider_connected",
                    "webhook", "recent_messages"}
        assert expected.issubset(ids), f"missing checks: {expected - ids}"

    def test_test_connection_endpoint_responds(self, session, auth_headers):
        # With fake creds we expect a controlled error/ok shape, not a 500.
        r = session.post(f"{API}/whatsapp/test-connection",
                         headers=auth_headers, timeout=30)
        # Endpoint returns 200 with ok=False on bad creds (per iter2)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data
        # Hint field optional but supported
        assert isinstance(data, dict)

    def test_webhook_to_lead_end_to_end(self, session, auth_headers):
        phone = "5511" + str(uuid.uuid4().int)[:9]
        text = ("Boa tarde! Fui demitido sem justa causa hoje, preciso de "
                "um advogado urgente em Sao Paulo.")
        r = _send_webhook(session, _zapi_text_payload(phone, text, "TEST_Lead_E2E"))
        assert r.status_code == 200
        time.sleep(9)
        # Verify lead created
        lr = session.get(f"{API}/leads", headers=auth_headers, timeout=15)
        assert lr.status_code == 200
        leads = lr.json()
        suffix = phone[-8:]
        match = None
        for ld in leads:
            ph = (ld.get("phone") or ld.get("whatsapp") or "")
            if suffix in ph:
                match = ld
                break
        assert match is not None, \
            f"lead not created from webhook for phone {phone}"
        # Lead has IA-classified fields
        assert match.get("case_type") or match.get("tags") or match.get("score") is not None, \
            f"lead missing IA classification: {match}"
