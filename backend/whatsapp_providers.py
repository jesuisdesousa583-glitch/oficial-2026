"""WhatsApp Providers - Z-API, Evolution API, Meta Cloud API, Baileys
Unified interface for sending/receiving WhatsApp messages.
"""
import os
import httpx
import logging
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod

log = logging.getLogger(__name__)


class WhatsAppProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def send_text(self, phone: str, text: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        ...


def normalize_phone(phone: str) -> str:
    """Remove non-digits and ensure country code."""
    p = "".join(ch for ch in phone if ch.isdigit())
    if not p:
        return ""
    # If 10-11 digits and no country code, assume Brazil (55)
    if len(p) <= 11:
        p = "55" + p
    return p


class ZAPIProvider(WhatsAppProvider):
    name = "zapi"

    def __init__(self, instance_id: str, instance_token: str, client_token: Optional[str] = None):
        self.instance_id = instance_id
        self.instance_token = instance_token
        self.client_token = client_token or ""
        self.base = f"https://api.z-api.io/instances/{instance_id}/token/{instance_token}"

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.client_token:
            h["Client-Token"] = self.client_token
        return h

    async def send_text(self, phone: str, text: str) -> Dict[str, Any]:
        phone_norm = normalize_phone(phone)
        url = f"{self.base}/send-text"
        payload = {"phone": phone_norm, "message": text}
        res = await self._request("POST", url, json=payload, timeout=30.0)
        data = res["data"]
        out = {
            "ok": res["status"] < 400 and (isinstance(data, dict) and not data.get("error")),
            "status": res["status"],
            "provider": self.name,
            "response": data,
        }
        if res.get("hint"):
            out["hint"] = res["hint"]
        return out

    @staticmethod
    def _is_client_token_not_allowed(data: Any) -> bool:
        """Detecta o erro especifico do Z-API quando o Account Security Token
        nao esta ativado no painel mas o Client-Token foi enviado."""
        if not isinstance(data, dict):
            return False
        err = str(data.get("error") or data.get("message") or "").lower()
        return "not allowed" in err and "client-token" in err

    async def _request(self, method: str, url: str, **kw) -> Dict[str, Any]:
        """Faz a requisicao HTTP e retorna {status, data}.
        Se Z-API responder 'Client-Token not allowed', refaz sem o header
        Client-Token e marca um hint na resposta para a UI."""
        async with httpx.AsyncClient(timeout=kw.pop("timeout", 30.0)) as client:
            r = await client.request(method, url, headers=self._headers(), **kw)
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text}
            hint = None
            if self.client_token and self._is_client_token_not_allowed(data):
                # retry sem Client-Token
                hdr = {"Content-Type": "application/json"}
                r = await client.request(method, url, headers=hdr, **kw)
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                hint = (
                    "Client-Token salvo nao esta ativado no painel da Z-API. "
                    "A conexao foi testada SEM o token; para usar o token, "
                    "ative em Painel Z-API > Seguranca > Account Security Token."
                )
            return {"status": r.status_code, "data": data, "hint": hint}

    async def test_connection(self) -> Dict[str, Any]:
        url = f"{self.base}/status"
        try:
            res = await self._request("GET", url, timeout=15.0)
            data = res["data"]
            connected = False
            if isinstance(data, dict):
                connected = bool(data.get("connected") or data.get("smartphoneConnected"))
            out = {
                "ok": res["status"] < 400,
                "connected": connected,
                "status": res["status"],
                "data": data,
            }
            if res.get("hint"):
                out["hint"] = res["hint"]
            return out
        except Exception as e:
            log.exception("zapi status error")
            return {"ok": False, "connected": False, "error": str(e)}

    async def get_qr(self) -> Dict[str, Any]:
        url = f"{self.base}/qr-code/image"
        try:
            res = await self._request("GET", url, timeout=30.0)
            out = {"ok": res["status"] < 400, "data": res["data"]}
            if res.get("hint"):
                out["hint"] = res["hint"]
            return out
        except Exception as e:
            return {"ok": False, "error": str(e)}


class EvolutionProvider(WhatsAppProvider):
    name = "evolution"

    def __init__(self, base_url: str, api_key: str, instance: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.instance = instance

    def _headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json", "apikey": self.api_key}

    async def send_text(self, phone: str, text: str) -> Dict[str, Any]:
        phone_norm = normalize_phone(phone)
        url = f"{self.base_url}/message/sendText/{self.instance}"
        payload = {
            "number": phone_norm,
            "options": {"delay": 1200, "presence": "composing"},
            "textMessage": {"text": text},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers=self._headers())
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text}
            return {"ok": r.status_code < 400, "status": r.status_code, "provider": self.name, "response": data}

    async def test_connection(self) -> Dict[str, Any]:
        url = f"{self.base_url}/instance/connectionState/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(url, headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                state = ""
                if isinstance(data, dict):
                    state = (data.get("instance", {}) or {}).get("state") or data.get("state") or ""
                return {"ok": r.status_code < 400, "connected": state == "open", "state": state, "data": data}
        except Exception as e:
            return {"ok": False, "connected": False, "error": str(e)}


class MetaCloudProvider(WhatsAppProvider):
    name = "meta"

    def __init__(self, access_token: str, phone_number_id: str, version: str = "v20.0"):
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.version = version
        self.base = f"https://graph.facebook.com/{version}/{phone_number_id}"

    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

    async def send_text(self, phone: str, text: str) -> Dict[str, Any]:
        phone_norm = normalize_phone(phone)
        url = f"{self.base}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": phone_norm,
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers=self._headers())
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text}
            return {"ok": r.status_code < 400, "status": r.status_code, "provider": self.name, "response": data}

    async def test_connection(self) -> Dict[str, Any]:
        url = f"https://graph.facebook.com/{self.version}/{self.phone_number_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(url, headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                return {"ok": r.status_code < 400, "connected": r.status_code < 400, "data": data}
        except Exception as e:
            return {"ok": False, "connected": False, "error": str(e)}


class BaileysProvider(WhatsAppProvider):
    """Talks to local Baileys Node.js sidecar (port 8002 by default)."""
    name = "baileys"

    def __init__(self, base_url: Optional[str] = None, internal_token: Optional[str] = None):
        self.base = (base_url or os.environ.get("BAILEYS_URL") or "http://localhost:8002").rstrip("/")
        self.token = internal_token or os.environ.get("BAILEYS_INTERNAL_TOKEN") or "legalflow-baileys-2026"

    def _headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json", "x-internal-token": self.token}

    async def send_text(self, phone: str, text: str, jid: Optional[str] = None) -> Dict[str, Any]:
        try:
            payload: Dict[str, Any] = {"phone": phone, "text": text}
            # When provided, jid routes reply to the exact original chat
            # (critical for @lid contacts — avoids creating phantom chats).
            if jid:
                payload["jid"] = jid
            async with httpx.AsyncClient(timeout=30.0) as c:
                r = await c.post(f"{self.base}/send-text",
                                 json=payload,
                                 headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                ok = r.status_code < 400 and bool(data.get("ok"))
                return {"ok": ok, "status": r.status_code, "provider": self.name, "response": data}
        except Exception as e:
            return {"ok": False, "provider": self.name, "error": str(e)}

    async def test_connection(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{self.base}/status", headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                connected = bool(data.get("connected"))
                return {
                    "ok": r.status_code < 400,
                    "connected": connected,
                    "state": data.get("state"),
                    "me": data.get("me"),
                    "data": data,
                }
        except Exception as e:
            return {"ok": False, "connected": False, "error": str(e)}

    async def get_qr(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{self.base}/qr", headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                return {"ok": r.status_code < 400, **data}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def logout(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(f"{self.base}/logout", headers=self._headers())
                try:
                    data = r.json()
                except Exception:
                    data = {"raw": r.text}
                return {"ok": r.status_code < 400, **data}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def build_provider_from_config(cfg: Dict[str, Any]) -> Optional[WhatsAppProvider]:
    """Build a provider from a config dict stored in DB."""
    provider = (cfg or {}).get("provider")
    if provider == "zapi":
        inst = cfg.get("zapi_instance_id") or os.environ.get("ZAPI_INSTANCE_ID")
        tok = cfg.get("zapi_instance_token") or os.environ.get("ZAPI_INSTANCE_TOKEN")
        ct = cfg.get("zapi_client_token") or os.environ.get("ZAPI_CLIENT_TOKEN")
        if inst and tok:
            return ZAPIProvider(inst, tok, ct)
    elif provider == "evolution":
        base = cfg.get("evo_base_url")
        key = cfg.get("evo_api_key")
        inst = cfg.get("evo_instance")
        if base and key and inst:
            return EvolutionProvider(base, key, inst)
    elif provider == "meta":
        tok = cfg.get("meta_access_token")
        pid = cfg.get("meta_phone_number_id")
        if tok and pid:
            return MetaCloudProvider(tok, pid)
    elif provider == "baileys":
        return BaileysProvider()
    return None


def default_zapi_from_env() -> Optional[ZAPIProvider]:
    inst = os.environ.get("ZAPI_INSTANCE_ID")
    tok = os.environ.get("ZAPI_INSTANCE_TOKEN")
    ct = os.environ.get("ZAPI_CLIENT_TOKEN")
    if inst and tok:
        return ZAPIProvider(inst, tok, ct)
    return None
