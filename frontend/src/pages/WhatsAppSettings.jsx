import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Zap, Server, Building2, Smartphone, CheckCircle2, XCircle,
  Loader2, Bot, Send, QrCode, Copy, Activity, AlertTriangle, RefreshCw,
  LogOut, AlertCircle, Volume2,
} from "lucide-react";

export default function WhatsAppSettings() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [qrImg, setQrImg] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [sendTest, setSendTest] = useState({ phone: "", text: "Olá! Mensagem de teste LegalFlow." });
  const [sendingTest, setSendingTest] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState(null);
  const [diag, setDiag] = useState(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  // Baileys-specific
  const [baileysStatus, setBaileysStatus] = useState(null);
  const [baileysQr, setBaileysQr] = useState(null);
  const [baileysLoggingOut, setBaileysLoggingOut] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const webhookBase = `${backendUrl}/api/whatsapp/webhook`;

  useEffect(() => { load(); runDiagnostics(); }, []);

  // Auto-poll Baileys status/QR when provider is baileys
  useEffect(() => {
    if (cfg?.provider !== "baileys") return;
    pollBaileys();
    const t = setInterval(pollBaileys, 3000);
    return () => clearInterval(t);
  }, [cfg?.provider]);

  const load = async () => {
    try {
      const { data } = await api.get("/whatsapp/config");
      setCfg(data);
    } catch {
      toast.error("Erro ao carregar configuração");
    }
  };

  const pollBaileys = async () => {
    try {
      const { data: st } = await api.get("/whatsapp/baileys/status");
      setBaileysStatus(st);
      if (!st.connected) {
        const { data: qr } = await api.get("/whatsapp/baileys/qr");
        setBaileysQr(qr);
      } else {
        setBaileysQr(null);
      }
    } catch (e) {
      // Sidecar morreu / nao responde. Tenta reconectar automaticamente.
      setBaileysStatus({ ok: false, connected: false, state: "offline" });
      try {
        await api.post("/whatsapp/baileys/reconnect");
      } catch {}
    }
  };

  const baileysLogout = async () => {
    setBaileysLoggingOut(true);
    try {
      await api.post("/whatsapp/baileys/logout");
      toast.success("Sessão Baileys encerrada — gerando novo QR...");
      setBaileysStatus(null);
      setTimeout(pollBaileys, 1500);
    } catch {
      toast.error("Erro ao desconectar Baileys");
    } finally {
      setBaileysLoggingOut(false);
    }
  };

  const baileysReconnect = async () => {
    setBaileysLoggingOut(true);
    try {
      const { data } = await api.post("/whatsapp/baileys/reconnect");
      if (data?.connected) {
        toast.success("Baileys reconectado!");
      } else {
        toast.info("Sidecar reiniciado — aguardando QR...");
      }
      setBaileysStatus(data);
      setTimeout(pollBaileys, 1500);
    } catch {
      toast.error("Erro ao reconectar — verifique logs do backend");
    } finally {
      setBaileysLoggingOut(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...cfg };
      delete payload.owner_id;
      delete payload.updated_at;
      await api.put("/whatsapp/config", payload);
      toast.success("Configuração salva");
    } catch (e) {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await save();
      const { data } = await api.post("/whatsapp/test-connection");
      setTestResult(data);
      if (data.connected) {
        toast.success("WhatsApp conectado!");
      } else if (data.hint) {
        toast.warning(data.hint, { duration: 8000 });
      } else {
        toast.warning(data.error || "Não conectado — verifique o QR Code ou credenciais");
      }
    } catch (e) {
      toast.error("Erro no teste de conexão");
    } finally {
      setTesting(false);
    }
  };

  const fetchQr = async () => {
    setLoadingQr(true);
    setQrImg(null);
    try {
      const { data } = await api.get("/whatsapp/qr");
      if (data?.data?.value) {
        setQrImg(data.data.value);
      } else if (data?.data?.qrcode) {
        setQrImg(data.data.qrcode);
      } else if (data?.qr) {
        setQrImg(data.qr);
      } else {
        toast.info("Se o WhatsApp já está conectado, QR não é necessário.");
      }
    } catch {
      toast.error("Erro ao obter QR code");
    } finally {
      setLoadingQr(false);
    }
  };

  const doSendTest = async () => {
    if (!sendTest.phone || !sendTest.text) {
      toast.error("Preencha telefone e mensagem");
      return;
    }
    setSendingTest(true);
    try {
      const { data } = await api.post("/whatsapp/send-direct", sendTest);
      if (data.delivered) toast.success("Mensagem enviada!");
      else toast.warning(`Não entregue: ${JSON.stringify(data.provider_result).slice(0,120)}`);
    } catch (e) {
      toast.error("Erro ao enviar teste");
    } finally {
      setSendingTest(false);
    }
  };

  const copyHook = (path) => {
    navigator.clipboard.writeText(`${webhookBase}/${path}`);
    toast.success("Webhook copiado");
  };

  const autoSetupWebhook = async () => {
    setSettingWebhook(true);
    setWebhookResult(null);
    try {
      const publicUrl = (backendUrl || window.location.origin).replace(/\/$/, "");
      const { data } = await api.post("/whatsapp/setup-webhook", { base_url: publicUrl });
      setWebhookResult(data);
      if (data.verified) {
        toast.success("Webhook configurado e verificado na Z-API!");
      } else if (data.ok) {
        toast.success("Webhook configurado (não verificado — re-checando)");
      } else {
        toast.warning(data.error_summary || "Falha ao configurar webhook — veja detalhes abaixo");
      }
      runDiagnostics();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao configurar");
    } finally {
      setSettingWebhook(false);
    }
  };

  const runDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const publicUrl = (backendUrl || window.location.origin).replace(/\/$/, "");
      const { data } = await api.get(`/whatsapp/diagnostics?public_url=${encodeURIComponent(publicUrl)}`);
      setDiag(data);
    } catch {
      // silencia
    } finally {
      setLoadingDiag(false);
    }
  };

  if (!cfg) return <div className="p-12 text-nude-400">Carregando configuração...</div>;

  const up = (k, v) => setCfg({ ...cfg, [k]: v });
  const isBaileys = cfg.provider === "baileys";

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Integrações</div>
          <h1 className="font-display font-bold text-2xl">WhatsApp</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={test} disabled={testing} data-testid="wa-test-btn">
            {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</> : "Testar conexão"}
          </Button>
          <Button onClick={save} disabled={saving} className="bg-nude-900 hover:bg-nude-800" data-testid="wa-save-btn">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <Card className="border-nude-200 p-5" data-testid="wa-diagnostics-panel">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-gold-600" />
                Diagnóstico — Por que não estou recebendo mensagens?
              </h3>
              <p className="text-sm text-nude-500 mt-0.5">
                Checklist automático de tudo que precisa estar OK para o robô responder.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runDiagnostics} disabled={loadingDiag} data-testid="wa-diag-refresh">
              {loadingDiag ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-checar</>}
            </Button>
          </div>
          {!diag ? (
            <div className="text-sm text-nude-400 py-2">Carregando diagnóstico…</div>
          ) : (
            <div className="space-y-2">
              {diag.checks.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-start gap-3 p-3 rounded-md border ${
                    c.ok ? "bg-gold-50 border-gold-200" : "bg-gold-50 border-gold-200"
                  }`}
                  data-testid={`wa-diag-${c.id}`}
                >
                  {c.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-gold-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-gold-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-nude-900">{c.label}</div>
                    <div className="text-xs text-nude-700 mt-0.5">{c.msg}</div>
                    {c.hint && (
                      <div className="text-[11px] text-gold-800 mt-1.5 italic">💡 {c.hint}</div>
                    )}
                  </div>
                </div>
              ))}
              {!diag.ok && cfg?.provider === "zapi" && (
                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={autoSetupWebhook}
                    disabled={settingWebhook}
                    size="sm"
                    className="bg-gold-600 hover:bg-gold-700"
                    data-testid="wa-diag-fix-webhook"
                  >
                    {settingWebhook ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    Configurar webhook automaticamente
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {webhookResult && (
          <Card
            className={`p-4 border-2 ${webhookResult.verified ? "border-gold-200 bg-gold-50" : "border-gold-200 bg-gold-50"}`}
            data-testid="wa-webhook-result"
          >
            <div className="flex items-start gap-3">
              {webhookResult.verified ? (
                <CheckCircle2 className="w-6 h-6 text-gold-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-gold-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {webhookResult.verified ? "Webhook verificado na Z-API" : "Webhook precisa de atenção"}
                </div>
                <div className="text-xs text-nude-700 mt-1">
                  Esperado: <code className="bg-white px-1.5 py-0.5 rounded">{webhookResult.webhook_url}</code>
                </div>
                {webhookResult.verified_url && (
                  <div className="text-xs text-nude-700 mt-1">
                    Configurado: <code className="bg-white px-1.5 py-0.5 rounded break-all">{webhookResult.verified_url}</code>
                  </div>
                )}
                {webhookResult.error_summary && (
                  <div className="text-xs text-gold-900 mt-2">{webhookResult.error_summary}</div>
                )}
                {webhookResult.errors?.length > 0 && (
                  <ul className="text-xs text-rose-800 mt-2 list-disc pl-5 space-y-0.5">
                    {webhookResult.errors.map((e, i) => <li key={i} className="font-mono break-all">{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}

        {testResult && (
          <Card className={`p-4 border-2 ${testResult.connected ? "border-gold-200 bg-gold-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-start gap-3">
              {testResult.connected ? <CheckCircle2 className="w-6 h-6 text-gold-600 shrink-0" /> : <XCircle className="w-6 h-6 text-rose-600 shrink-0" />}
              <div className="flex-1">
                <div className="font-medium">{testResult.connected ? "Conectado" : "Não conectado"} — provedor: {testResult.provider}</div>
                {testResult.hint && (
                  <div className="mt-2 p-2.5 bg-gold-50 border border-gold-200 rounded text-xs text-gold-900" data-testid="wa-test-hint">
                    <strong>Dica:</strong> {testResult.hint}
                  </div>
                )}
                <div className="text-xs text-nude-600 font-mono mt-1.5 max-w-3xl break-all">
                  {JSON.stringify(testResult.data || testResult.response || testResult.error || {}).slice(0, 220)}
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="border-nude-200">
          <div className="p-5">
            <Tabs value={cfg.provider} onValueChange={(v) => up("provider", v)}>
              <TabsList className="grid grid-cols-4 w-full max-w-2xl">
                <TabsTrigger value="zapi" data-testid="tab-zapi"><Zap className="w-3.5 h-3.5 mr-1.5" />Z-API</TabsTrigger>
                <TabsTrigger value="baileys" data-testid="tab-baileys"><Smartphone className="w-3.5 h-3.5 mr-1.5" />Baileys</TabsTrigger>
                <TabsTrigger value="evolution" data-testid="tab-evolution"><Server className="w-3.5 h-3.5 mr-1.5" />Evolution</TabsTrigger>
                <TabsTrigger value="meta" data-testid="tab-meta"><Building2 className="w-3.5 h-3.5 mr-1.5" />Meta Cloud</TabsTrigger>
              </TabsList>

              <TabsContent value="zapi" className="mt-5 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-gold-100 text-gold-800 hover:bg-gold-100">Recomendado</Badge>
                  <span className="text-sm text-nude-600">Conecta via QR Code, fácil e rápido.</span>
                </div>
                <div><Label>Instance ID</Label><Input value={cfg.zapi_instance_id || ""} onChange={(e) => up("zapi_instance_id", e.target.value)} data-testid="zapi-instance" className="font-mono text-xs" /></div>
                <div><Label>Instance Token</Label><Input value={cfg.zapi_instance_token || ""} onChange={(e) => up("zapi_instance_token", e.target.value)} data-testid="zapi-token" className="font-mono text-xs" /></div>
                <div>
                  <Label>Client-Token (Account Security Token)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={cfg.zapi_client_token || ""}
                      onChange={(e) => up("zapi_client_token", e.target.value)}
                      data-testid="zapi-client-token"
                      className="font-mono text-xs"
                      placeholder="Deixe vazio se não usar"
                    />
                    {cfg.zapi_client_token && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => up("zapi_client_token", "")}
                        data-testid="zapi-clear-client-token"
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-nude-500 mt-1.5 leading-relaxed">
                    Preencha somente se a opção <strong>Account Security Token</strong> estiver
                    <strong> ativada </strong>
                    no painel Z-API (menu <em>Segurança</em>). Se preencher errado, a Z-API rejeita
                    a configuração do webhook.
                  </p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">QR Code de conexão</div>
                    <div className="text-xs text-nude-500">Escaneie com o WhatsApp → Aparelhos Conectados</div>
                  </div>
                  <Button onClick={fetchQr} variant="outline" size="sm" disabled={loadingQr} data-testid="zapi-qr-btn">
                    {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <><QrCode className="w-4 h-4 mr-2" />Obter QR</>}
                  </Button>
                </div>
                {qrImg && (
                  <div className="mt-3 p-4 bg-white border border-nude-200 rounded-md inline-block">
                    <img src={qrImg} alt="QR Code" className="w-52 h-52" />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="baileys" className="mt-5 space-y-4" data-testid="baileys-panel">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">Sem mensalidade</Badge>
                  <span className="text-sm text-nude-600">
                    Conexão direta via QR Code (Baileys). Auto-hospedado, sem custo por mensagem.
                  </span>
                </div>
                <div className="text-xs text-nude-500 max-w-2xl leading-relaxed">
                  O Baileys roda como serviço local no servidor. Ao escanear o QR Code abaixo com
                  seu WhatsApp (Aparelhos conectados), as mensagens recebidas vão direto para o
                  dashboard e o robô IA (Emergent LLM) responde automaticamente. Não precisa
                  configurar webhook — tudo interno.
                </div>

                {!baileysStatus?.connected && (
                  <div className="p-3 bg-gold-50 border border-gold-200 rounded text-xs text-gold-900" data-testid="baileys-howto">
                    <div className="font-semibold mb-1">⚠️ Conectando ao WhatsApp…</div>
                    <div>
                      Se o QR não aparecer em 10s, clique em <strong>"Reconectar serviço"</strong> (direita).
                      O sidecar reinicia sozinho se o servidor ficou ocioso. Depois que conectar,
                      clique em <strong>"Usar Baileys como provedor principal"</strong> para o robô IA responder aqui.
                    </div>
                  </div>
                )}

                <Card className="bg-nude-50 border-nude-200 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-nude-500 mb-1">Status</div>
                      {baileysStatus?.connected ? (
                        <div className="flex items-center gap-2 text-gold-700 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Conectado{baileysStatus.me?.id ? ` — ${baileysStatus.me.id.split("@")[0]}` : ""}
                        </div>
                      ) : baileysStatus?.state === "conflicted" ? (
                        <div className="flex items-center gap-2 text-rose-700 font-medium">
                          <AlertCircle className="w-4 h-4" />
                          Conflito de sessão
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gold-700 font-medium">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {baileysStatus?.state === "connecting" ? "Aguardando leitura do QR..." : "Inicializando..."}
                        </div>
                      )}
                      <div className="text-xs text-nude-500 mt-1">
                        Estado: <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">{baileysStatus?.state || "—"}</code>
                      </div>
                      {baileysStatus?.last_error && baileysStatus?.state === "conflicted" && (
                        <div className="text-xs text-rose-700 mt-2 p-2 bg-rose-50 border border-rose-200 rounded" data-testid="baileys-conflict-msg">
                          ⚠️ {baileysStatus.last_error}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={pollBaileys} data-testid="baileys-refresh">
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
                      </Button>
                      {!baileysStatus?.connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={baileysReconnect}
                          disabled={baileysLoggingOut}
                          className="text-gold-700 hover:text-gold-800 hover:bg-gold-50 border-gold-300"
                          data-testid="baileys-reconnect"
                        >
                          {baileysLoggingOut ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Reconectar serviço
                        </Button>
                      )}
                      {baileysStatus?.connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={baileysLogout}
                          disabled={baileysLoggingOut}
                          className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                          data-testid="baileys-logout"
                        >
                          {baileysLoggingOut ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <LogOut className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Desconectar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>

                {baileysStatus?.connected && (
                  <Card className="p-4 border-gold-200 bg-gold-50" data-testid="baileys-ready">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-gold-600 shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-gold-900">Baileys conectado — pronto para atender!</div>
                        <div className="text-xs text-gold-800 mt-1">
                          Para ativar como provedor principal e fazer o robô IA responder por esta
                          conexão, clique abaixo:
                        </div>
                        <Button
                          size="sm"
                          className="mt-3 bg-violet-600 hover:bg-violet-700"
                          onClick={() => {
                            up("provider", "baileys");
                            up("bot_enabled", true);
                            setTimeout(() => {
                              save();
                              toast.success("Baileys ativado como provedor. O robô IA já responde por aqui.");
                            }, 100);
                          }}
                          data-testid="baileys-activate-provider"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Usar Baileys como provedor principal (com Robô IA)
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {!baileysStatus?.connected && baileysQr?.qr && (
                  <Card className="p-5 border-nude-200 flex flex-col md:flex-row gap-5 items-center md:items-start">
                    <div className="p-3 bg-white border border-nude-200 rounded-md shrink-0">
                      <img src={baileysQr.qr} alt="QR Code" className="w-56 h-56" data-testid="baileys-qr-image" />
                    </div>
                    <div className="flex-1 text-sm text-nude-700 space-y-3">
                      <div className="font-medium text-nude-900">Como conectar:</div>
                      <ol className="space-y-1.5 list-decimal pl-5 text-nude-600">
                        <li>Abra o WhatsApp no seu celular</li>
                        <li>Toque em <strong>Configurações → Aparelhos conectados</strong></li>
                        <li>Toque em <strong>Conectar um aparelho</strong></li>
                        <li>Aponte para o QR Code ao lado</li>
                        <li>Depois de conectar, clique em "Usar Baileys como provedor principal"</li>
                      </ol>
                      <div className="text-[11px] text-gold-700 bg-gold-50 border border-gold-200 p-2 rounded">
                        ⚠️ Esta conexão é não-oficial (uso pessoal). Para alto volume comercial,
                        considere usar Z-API ou Meta Cloud API.
                      </div>
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="evolution" className="mt-5 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Custo-benefício</Badge>
                  <span className="text-sm text-nude-600">Gratuita, você roda a instância em Render/Railway.</span>
                </div>
                <div><Label>URL Base</Label><Input placeholder="https://sua-evolution.up.railway.app" value={cfg.evo_base_url || ""} onChange={(e) => up("evo_base_url", e.target.value)} data-testid="evo-url" /></div>
                <div><Label>API Key</Label><Input value={cfg.evo_api_key || ""} onChange={(e) => up("evo_api_key", e.target.value)} data-testid="evo-key" className="font-mono text-xs" /></div>
                <div><Label>Nome da Instância</Label><Input placeholder="meu-escritorio" value={cfg.evo_instance || ""} onChange={(e) => up("evo_instance", e.target.value)} data-testid="evo-instance" /></div>
              </TabsContent>

              <TabsContent value="meta" className="mt-5 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-gold-100 text-gold-800 hover:bg-gold-100">Oficial Meta</Badge>
                  <span className="text-sm text-nude-600">Gratuita até 1.000 conversas/mês. Requer Meta Business.</span>
                </div>
                <div><Label>Access Token</Label><Input value={cfg.meta_access_token || ""} onChange={(e) => up("meta_access_token", e.target.value)} data-testid="meta-token" className="font-mono text-xs" /></div>
                <div><Label>Phone Number ID</Label><Input value={cfg.meta_phone_number_id || ""} onChange={(e) => up("meta_phone_number_id", e.target.value)} data-testid="meta-phone-id" className="font-mono text-xs" /></div>
              </TabsContent>
            </Tabs>
          </div>
        </Card>

        <Card className="border-nude-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-gold-600" />
                <h3 className="font-display font-semibold text-base">Robô Atendente IA</h3>
                {cfg.bot_enabled && (
                  <Badge className="bg-gold-100 text-gold-800 hover:bg-gold-100 text-[10px]">
                    Ativo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-nude-500 mt-1">
                Responde automaticamente as mensagens recebidas usando GPT-4o Mini (Emergent LLM).
              </p>
              <p className="text-xs text-nude-400 mt-1">
                Para ativar: clique no switch ao lado → o botão fica laranja → clique em <strong>Salvar</strong> no topo.
              </p>
            </div>
            <Switch
              checked={!!cfg.bot_enabled}
              onCheckedChange={(v) => up("bot_enabled", v)}
              data-testid="bot-toggle"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Prompt do robô (personalidade/instruções)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-gold-700 hover:text-gold-800 hover:bg-gold-50"
                data-testid="bot-reset-prompt"
                onClick={async () => {
                  try {
                    const { data } = await api.get("/whatsapp/default-prompt");
                    if (data?.prompt) {
                      up("bot_prompt", data.prompt);
                      toast.success("Prompt assertivo (Kênia Garcia) carregado. Clique em Salvar.");
                    }
                  } catch {
                    toast.error("Erro ao carregar prompt padrão");
                  }
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Carregar prompt assertivo (padrão)
              </Button>
            </div>
            <Textarea
              rows={5}
              value={cfg.bot_prompt || ""}
              onChange={(e) => up("bot_prompt", e.target.value)}
              data-testid="bot-prompt"
              className="font-mono text-xs"
            />
          </div>

          {/* === MODO DE VOZ DA RESPOSTA AUTOMATICA === */}
          <div className="mt-5 pt-5 border-t border-nude-200">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-gold-600" />
              <h4 className="font-display font-semibold text-sm">Modo de voz da resposta</h4>
            </div>
            <p className="text-xs text-nude-500 mb-3 leading-relaxed">
              Como o robô deve responder no WhatsApp do cliente. <strong>Texto + Áudio</strong> é o
              padrão recomendado. Quando o cliente envia áudio (ou mostra sinais de baixo letramento),
              o sistema <strong>detecta automaticamente</strong> e passa a responder em voz —
              <em> mesmo no modo padrão</em>.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Modo</Label>
                <select
                  value={cfg.bot_voice_mode || "text_and_audio"}
                  onChange={(e) => up("bot_voice_mode", e.target.value)}
                  className="w-full h-9 px-2 rounded-md border border-nude-200 bg-white text-sm"
                  data-testid="bot-voice-mode"
                >
                  <option value="text_and_audio">Texto + Áudio (recomendado · padrão)</option>
                  <option value="audio_only">Apenas Áudio (toda resposta vira voz)</option>
                  <option value="auto">Automático (texto p/ quem digita, áudio p/ quem fala)</option>
                  <option value="text_only">Apenas Texto (legado · sem voz)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Voz da OpenAI TTS</Label>
                <select
                  value={cfg.bot_voice || "nova"}
                  onChange={(e) => up("bot_voice", e.target.value)}
                  className="w-full h-9 px-2 rounded-md border border-nude-200 bg-white text-sm"
                  data-testid="bot-voice"
                >
                  <option value="nova">Nova (jovem feminina · padrão)</option>
                  <option value="shimmer">Shimmer (alegre)</option>
                  <option value="coral">Coral (acolhedora)</option>
                  <option value="fable">Fable (narrativa)</option>
                  <option value="alloy">Alloy (neutra)</option>
                  <option value="onyx">Onyx (grave masculina)</option>
                  <option value="echo">Echo (calma)</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-nude-400 mt-2 leading-relaxed">
              💡 A voz selecionada é usada nas respostas enviadas pelo bot pelo WhatsApp.
              Para escutar o timbre antes, use o player na tela <strong>Chat IA · Análise</strong>.
            </p>
          </div>
        </Card>

        <Card className="border-nude-200 p-5">
          <h3 className="font-display font-semibold text-base mb-1 flex items-center gap-2">
            <Send className="w-4 h-4 text-gold-600" /> Envio de teste
          </h3>
          <p className="text-sm text-nude-500 mb-4">
            Use para validar o provedor selecionado.
          </p>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <Label>Telefone (com DDD)</Label>
              <Input placeholder="11988887777" value={sendTest.phone} onChange={(e) => setSendTest({ ...sendTest, phone: e.target.value })} data-testid="test-phone" />
            </div>
            <div className="md:col-span-2">
              <Label>Mensagem</Label>
              <Input value={sendTest.text} onChange={(e) => setSendTest({ ...sendTest, text: e.target.value })} data-testid="test-text" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={doSendTest} disabled={sendingTest} className="bg-gold-600 hover:bg-gold-700" data-testid="test-send">
              {sendingTest ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar teste</>}
            </Button>
          </div>
        </Card>

        {!isBaileys && (
          <Card className="border-nude-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-base mb-1">Webhooks (recebimento)</h3>
                <p className="text-sm text-nude-500">Configure a URL correspondente no painel do provedor para receber mensagens e ativar o robô.</p>
              </div>
              {cfg.provider === "zapi" && (
                <Button onClick={autoSetupWebhook} disabled={settingWebhook} className="bg-gold-600 hover:bg-gold-700" data-testid="wa-auto-webhook">
                  {settingWebhook ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Configurando...</> : <><Zap className="w-4 h-4 mr-2" />Configurar Z-API automaticamente</>}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {[
                { p: "zapi", label: "Z-API" },
                { p: "evolution", label: "Evolution" },
                { p: "meta", label: "Meta" },
              ].map((w) => (
                <div key={w.p} className="flex items-center gap-2">
                  <Badge variant="outline" className="w-24 justify-center">{w.label}</Badge>
                  <code className="flex-1 text-xs bg-nude-100 px-3 py-1.5 rounded-md font-mono truncate">{`${webhookBase}/${w.p}`}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyHook(w.p)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
