import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Search, Send, Phone, MoreVertical, Bot, Sparkles, Paperclip, Mail, MessageSquare, FileText, Flame, Tag, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const URG_COLORS = {
  baixa: "bg-nude-100 text-nude-700",
  media: "bg-blue-100 text-blue-700",
  alta: "bg-gold-100 text-gold-800",
  critica: "bg-rose-100 text-rose-700",
};

export default function Dashboard() {
  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [leadForContact, setLeadForContact] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [draft, setDraft] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiSession, setAiSession] = useState(null);
  const [aiMessages, setAiMessages] = useState([
    { role: "assistant", content: "Olá! Sou o copiloto jurídico. Posso te ajudar a redigir uma resposta para o cliente, sugerir próximos passos do caso ou pesquisar precedentes. Como posso ajudar?" }
  ]);
  const [aiThinking, setAiThinking] = useState(false);
  const [search, setSearch] = useState("");
  const aiBoxRef = useRef(null);

  useEffect(() => {
    loadContacts();
    loadMetrics();
  }, []);

  useEffect(() => {
    if (activeContact) {
      loadMessages(activeContact.id);
      loadLeadForContact(activeContact.phone);
    }
  }, [activeContact]);

  useEffect(() => {
    if (aiBoxRef.current) aiBoxRef.current.scrollTop = aiBoxRef.current.scrollHeight;
  }, [aiMessages]);

  // Auto-refresh every 3s — fast enough to feel real-time
  useEffect(() => {
    const t = setInterval(() => {
      loadContacts();
      if (activeContact) loadMessages(activeContact.id);
    }, 3000);
    return () => clearInterval(t);
  }, [activeContact]);

  const loadContacts = async () => {
    try {
      const { data } = await api.get("/whatsapp/contacts");
      // Sort by last_message_at DESC so newest conversations bubble up
      const sorted = [...data].sort((a, b) => {
        const ta = a.last_message_at || "";
        const tb = b.last_message_at || "";
        return tb.localeCompare(ta);
      });
      setContacts(sorted);
      if (sorted.length > 0 && !activeContact) setActiveContact(sorted[0]);
    } catch {
      // silenciar erro no refresh automatico para nao spam toast
    }
  };

  const loadMessages = async (cid) => {
    try {
      const { data } = await api.get(`/whatsapp/messages/${cid}`);
      setMessages(data);
    } catch {}
  };

  const loadMetrics = async () => {
    try {
      const { data } = await api.get("/dashboard/metrics");
      setMetrics(data);
    } catch {}
  };

  const loadLeadForContact = async (phone) => {
    try {
      const { data } = await api.get("/leads");
      const digits = (phone || "").replace(/\D/g, "");
      const match = data.find((l) => (l.phone || "").replace(/\D/g, "").includes(digits.slice(-8)));
      setLeadForContact(match || null);
    } catch {
      setLeadForContact(null);
    }
  };

  const sendWhatsApp = async () => {
    if (!draft.trim() || !activeContact) return;
    try {
      const { data } = await api.post("/whatsapp/send", { contact_id: activeContact.id, text: draft });
      // Backend retorna {message, provider_result} — extrai a mensagem pura
      const msg = data?.message || data;
      setMessages((prev) => [...prev, msg]);
      setDraft("");
      loadContacts();
      // Recarrega mensagens do servidor em 1s para pegar resposta do bot
      setTimeout(() => activeContact && loadMessages(activeContact.id), 1200);
    } catch {
      toast.error("Erro ao enviar");
    }
  };

  const askAI = async () => {
    if (!aiPrompt.trim()) return;
    const userMsg = { role: "user", content: aiPrompt };
    setAiMessages((m) => [...m, userMsg]);
    setAiThinking(true);
    const prompt = aiPrompt;
    setAiPrompt("");
    try {
      const contextual = activeContact
        ? `Cliente: ${activeContact.name}. Última mensagem: "${activeContact.last_message}". Pergunta do advogado: ${prompt}`
        : prompt;
      const { data } = await api.post("/chat/message", {
        message: contextual,
        session_id: aiSession,
        visitor_name: activeContact?.name || null,
        visitor_phone: activeContact?.phone || null,
        want_audio: true,
        return_analysis: true,
      });
      setAiSession(data.session_id);
      setAiMessages((m) => [...m, {
        role: "assistant",
        content: data.response,
        audio_base64: data.audio_base64,
        analysis: data.analysis,
      }]);
      // Auto-play audio
      if (data.audio_base64) {
        try {
          const a = new Audio(`data:audio/mpeg;base64,${data.audio_base64}`);
          a.play().catch(() => {});
        } catch {}
      }
    } catch {
      setAiMessages((m) => [...m, { role: "assistant", content: "Desculpe, não consegui processar agora." }]);
    } finally {
      setAiThinking(false);
    }
  };

  const playMessageAudio = (b64) => {
    if (!b64) return;
    try {
      const a = new Audio(`data:audio/mpeg;base64,${b64}`);
      a.play().catch(() => {});
    } catch {}
  };

  const applyAIReply = (text) => {
    setDraft(text);
    toast.success("Resposta copiada para o WhatsApp");
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const initials = (name) => name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="dashboard-page">
      {/* Header */}
      <div className="px-8 py-5 bg-card border-b border-nude-200 flex items-center justify-between shrink-0">
        <div>
          <div className="overline text-gold-600">Atendimento</div>
          <h1 className="font-serif text-3xl text-nude-900 mt-1 tracking-tight">Central de Mensagens</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-gold-50 text-gold-700 hover:bg-gold-50 border border-gold-200 gap-1.5 px-3 py-1.5 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse-soft" /> WhatsApp conectado
          </Badge>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* LEFT - WhatsApp Contacts */}
        <Card className="col-span-3 flex flex-col overflow-hidden border-nude-200" data-testid="whatsapp-panel">
          <div className="p-4 border-b border-nude-200">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-gold-600" />
              <h2 className="font-display font-semibold text-sm">WhatsApp</h2>
              <Badge variant="secondary" className="ml-auto text-xs">{contacts.length}</Badge>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-nude-400" />
              <Input
                placeholder="Buscar contato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                data-testid="contact-search"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveContact(c)}
                data-testid={`whatsapp-contact-item-${c.id}`}
                className={`w-full text-left px-4 py-3 border-b border-nude-100 hover:bg-nude-50 transition-colors flex items-start gap-3 ${
                  activeContact?.id === c.id ? "bg-gold-50" : ""
                }`}
              >
                <Avatar className={`w-10 h-10 ${c.avatar_color || "bg-nude-500"}`}>
                  <AvatarFallback className="bg-transparent text-white text-xs font-semibold">
                    {initials(c.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-nude-900 truncate">{c.name}</div>
                    {c.unread > 0 && (
                      <Badge className="bg-gold-600 hover:bg-gold-600 text-white h-5 min-w-[20px] px-1.5 text-[10px]">
                        {c.unread}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-nude-500 truncate mt-0.5">{c.last_message}</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-nude-500">Nenhum contato encontrado</div>
            )}
          </ScrollArea>
        </Card>

        {/* CENTER - Active Chat + AI */}
        <Card className="col-span-6 flex flex-col overflow-hidden border-nude-200" data-testid="chat-panel">
          {activeContact ? (
            <>
              <div className="px-5 py-3 border-b border-nude-200 flex items-center gap-3">
                <Avatar className={`w-9 h-9 ${activeContact.avatar_color}`}>
                  <AvatarFallback className="bg-transparent text-white text-xs font-semibold">
                    {initials(activeContact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{activeContact.name}</div>
                  <div className="text-xs text-nude-500">{activeContact.phone}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
              </div>

              {/* WhatsApp messages */}
              <ScrollArea className="flex-1 px-5 py-4 bg-nude-50/50">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-3.5 py-2 ${m.from_me ? "bubble-out" : "bubble-in"}`}>
                        <div className="text-sm">{m.text}</div>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="text-center text-xs text-nude-400 py-8">Nenhuma mensagem ainda</div>
                  )}
                </div>
              </ScrollArea>

              {/* WhatsApp input */}
              <div className="p-3 border-t border-nude-200 bg-white">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-9 w-9"><Paperclip className="w-4 h-4" /></Button>
                  <Input
                    placeholder="Mensagem..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendWhatsApp()}
                    data-testid="whatsapp-input"
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={sendWhatsApp}
                    className="h-9 w-9 bg-gold-600 hover:bg-gold-700"
                    data-testid="whatsapp-send-btn"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              {/* AI Copilot */}
              <div className="bg-nude-50 p-4 max-h-72 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-nude-900 grid place-items-center">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="font-display font-semibold text-sm">Copiloto Jurídico IA</h3>
                  <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                </div>
                <ScrollArea className="flex-1 mb-2" ref={aiBoxRef}>
                  <div className="space-y-2 pr-3">
                    {aiMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-md text-sm ${
                          m.role === "user" ? "bg-nude-900 text-white" : "bg-white border border-nude-200"
                        }`}>
                          <div className="whitespace-pre-wrap">{m.content}</div>
                          {m.role === "assistant" && i > 0 && (
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <button
                                onClick={() => applyAIReply(m.content)}
                                className="text-xs text-gold-600 hover:text-gold-700 font-medium"
                                data-testid={`use-ai-reply-${i}`}
                              >
                                ↗ Usar resposta
                              </button>
                              {m.audio_base64 && (
                                <button
                                  onClick={() => playMessageAudio(m.audio_base64)}
                                  className="text-xs text-nude-700 hover:text-nude-900 font-medium inline-flex items-center gap-1"
                                  data-testid={`play-ai-audio-${i}`}
                                >
                                  🔊 Ouvir
                                </button>
                              )}
                              {m.analysis && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold-100 text-gold-800 font-semibold">
                                  Acertividade {m.analysis.acertividade}% · {m.analysis.qualificacao === "qualificado" ? "✓ Qualificado" : m.analysis.qualificacao === "nao_qualificado" ? "✗ Não Qualif." : "+ info"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {aiThinking && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-nude-200 rounded-md px-3 py-2 text-sm text-nude-500">
                          <span className="animate-pulse-soft">Pensando...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    placeholder="Pergunte ao copiloto..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && askAI()}
                    className="h-9"
                    data-testid="ai-prompt-input"
                  />
                  <Button
                    size="sm"
                    onClick={askAI}
                    disabled={aiThinking}
                    className="bg-nude-900 hover:bg-nude-800"
                    data-testid="ai-send-btn"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Pedir
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-nude-400 text-sm">Selecione um contato</div>
          )}
        </Card>

        {/* RIGHT - Client Data */}
        <Card className="col-span-3 flex flex-col overflow-hidden border-nude-200" data-testid="client-panel">
          <div className="p-4 border-b border-nude-200">
            <h2 className="font-display font-semibold text-sm">Dados do Cliente</h2>
          </div>
          {activeContact ? (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">
                <div className="text-center">
                  <Avatar className={`w-16 h-16 mx-auto ${activeContact.avatar_color}`}>
                    <AvatarFallback className="bg-transparent text-white text-lg font-semibold">
                      {initials(activeContact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="font-display font-semibold text-base mt-3">{activeContact.name}</div>
                  <div className="text-xs text-nude-500 mt-0.5">{activeContact.phone}</div>
                </div>

                {metrics?.alerts?.upcoming_hearings?.length > 0 && (
                  <div>
                    <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-gold-600" /> Prazos próximos
                    </div>
                    <div className="space-y-1.5">
                      {metrics.alerts.upcoming_hearings.slice(0, 3).map((h) => (
                        <div key={h.process_id} className="p-2 bg-gold-50 border border-gold-200 rounded-md text-xs">
                          <div className="font-medium text-nude-900 truncate">{h.client_name}</div>
                          <div className="text-nude-600 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" /> {h.days_left === 0 ? "Hoje" : `${h.days_left}d`} • {h.case_type}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  {activeContact.sinestesic_style && (
                    <div>
                      <div className="text-xs text-nude-500 mb-1">Estilo do cliente (IA)</div>
                      <Badge className={
                        activeContact.sinestesic_style === "visual" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                        activeContact.sinestesic_style === "auditivo" ? "bg-purple-100 text-purple-800 hover:bg-purple-100" :
                        "bg-gold-100 text-gold-800 hover:bg-gold-100"
                      }>
                        {activeContact.sinestesic_style}
                      </Badge>
                      {activeContact.prefers_audio && (
                        <div className="text-[10px] text-nude-500 mt-1">🎙️ Prefere comunicação por áudio</div>
                      )}
                    </div>
                  )}
                  {leadForContact ? (
                    <>
                      <Field label="Status CRM" value={stageName(leadForContact.stage)} badge="amber" />
                      <Field label="Área do Direito" value={leadForContact.case_type || "—"} />
                      <div>
                        <div className="text-xs text-nude-500 mb-1">Urgência</div>
                        <Badge className={`${URG_COLORS[leadForContact.urgency || "media"]} hover:${URG_COLORS[leadForContact.urgency || "media"]} gap-1`}>
                          <Flame className="w-3 h-3" /> {leadForContact.urgency || "media"}
                        </Badge>
                      </div>
                      <Field label="Score IA" value={`${leadForContact.score || 50}/100`} />
                      <Field label="Origem" value={leadForContact.source || "WhatsApp"} />
                      {leadForContact.tags?.length > 0 && (
                        <div>
                          <div className="text-xs text-nude-500 mb-1.5">Tags</div>
                          <div className="flex flex-wrap gap-1">
                            {leadForContact.tags.map((t, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded inline-flex items-center gap-1">
                                <Tag className="w-2.5 h-2.5" />{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {leadForContact.description && (
                        <div>
                          <div className="text-xs text-nude-500 mb-1">Resumo IA</div>
                          <div className="text-xs text-nude-700 bg-nude-50 border border-nude-200 rounded-md p-2">
                            {leadForContact.description}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-nude-400 text-center py-4">
                      Contato ainda sem lead qualificado.<br/>A IA irá classificar na próxima mensagem recebida.
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="open-process-btn">
                    <FileText className="w-3.5 h-3.5" /> Abrir processo
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2" data-testid="send-email-btn">
                    <Mail className="w-3.5 h-3.5" /> Enviar e-mail
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 grid place-items-center text-nude-400 text-sm">—</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, badge }) {
  const colors = {
    amber: "bg-gold-100 text-gold-800",
    info: "bg-blue-100 text-blue-800",
    emerald: "bg-gold-100 text-gold-800",
  };
  return (
    <div>
      <div className="text-xs text-nude-500 mb-1">{label}</div>
      {badge ? (
        <Badge className={`${colors[badge]} hover:${colors[badge]}`}>{value}</Badge>
      ) : (
        <div className="text-sm font-medium text-nude-900">{value}</div>
      )}
    </div>
  );
}

function stageName(stage) {
  const map = {
    novos_leads: "Novos Leads", em_contato: "Em Contato", interessado: "Interessado",
    qualificado: "Qualificado", em_negociacao: "Em Negociação",
    convertido: "Convertido", nao_interessado: "Não Interessado",
  };
  return map[stage] || stage || "—";
}
