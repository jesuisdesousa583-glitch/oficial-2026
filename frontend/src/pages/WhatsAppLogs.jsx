import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowDownLeft, ArrowUpRight, Bot, RefreshCw, CheckCheck,
  AlertCircle, Search, Radio,
} from "lucide-react";

export default function WhatsAppLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [filter, setFilter] = useState("");
  const [stats, setStats] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data }, { data: st }] = await Promise.all([
        api.get("/whatsapp/logs?limit=200"),
        api.get("/whatsapp/bot-delivery-stats").catch(() => ({ data: null })),
      ]);
      setLogs(data);
      if (st) setStats(st);
    } catch {
      toast.error("Erro ao carregar logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auto]);

  const filtered = logs.filter((l) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (l.text || "").toLowerCase().includes(q) ||
      (l.contact_name || "").toLowerCase().includes(q) ||
      (l.contact_phone || "").includes(q)
    );
  });

  const totalIn = logs.filter((l) => !l.from_me).length;
  const totalBot = logs.filter((l) => l.bot).length;
  const totalOut = logs.filter((l) => l.from_me && !l.bot).length;

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold flex items-center gap-1.5">
            <Radio className="w-3 h-3" /> Monitor em tempo real
          </div>
          <h1 className="font-display font-bold text-2xl">Logs WhatsApp</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={auto ? "default" : "outline"} size="sm" onClick={() => setAuto(!auto)} data-testid="auto-toggle">
            <Radio className={`w-4 h-4 mr-2 ${auto ? "animate-pulse-soft" : ""}`} />
            {auto ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard label="Total de mensagens" value={logs.length} color="slate" />
          <StatCard label="Recebidas" value={totalIn} color="blue" Icon={ArrowDownLeft} />
          <StatCard label="Enviadas (manual)" value={totalOut} color="emerald" Icon={ArrowUpRight} />
          <StatCard label="Robô IA" value={totalBot} color="amber" Icon={Bot} />
        </div>

        {stats && stats.tracked_total > 0 && (
          <Card className="p-4 border-nude-200" data-testid="bot-delivery-card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-gold-600 font-semibold">
                  Entrega do Robô IA (Emergent LLM → Z-API)
                </div>
                <div className="text-sm text-nude-600 mt-0.5">
                  Status real das respostas automáticas enviadas ao WhatsApp.
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-3xl text-gold-700">
                  {stats.delivery_rate}%
                </div>
                <div className="text-[11px] text-nude-500 uppercase tracking-wider">Taxa de entrega</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-2 bg-nude-50 rounded">
                <div className="font-bold text-lg">{stats.total_bot_replies}</div>
                <div className="text-[10px] uppercase tracking-wider text-nude-500">Total respostas</div>
              </div>
              <div className="p-2 bg-gold-50 rounded" data-testid="bot-delivered-count">
                <div className="font-bold text-lg text-gold-700">{stats.delivered}</div>
                <div className="text-[10px] uppercase tracking-wider text-gold-700">Enviadas (Z-API aceitou)</div>
              </div>
              <div className="p-2 bg-blue-50 rounded" data-testid="bot-read-count">
                <div className="font-bold text-lg text-blue-700">{stats.whatsapp_read || 0}</div>
                <div className="text-[10px] uppercase tracking-wider text-blue-700">Lidas no WhatsApp</div>
              </div>
              <div className="p-2 bg-rose-50 rounded">
                <div className="font-bold text-lg text-rose-700">{stats.failed}</div>
                <div className="text-[10px] uppercase tracking-wider text-rose-700">Falharam</div>
              </div>
            </div>
            {stats.recent_failures?.length > 0 && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded text-xs">
                <div className="font-medium text-rose-900 mb-1.5">⚠️ Últimas falhas de entrega:</div>
                <ul className="space-y-1 list-disc pl-5 text-rose-800">
                  {stats.recent_failures.slice(0, 3).map((f, i) => (
                    <li key={i} className="break-words">
                      <span className="font-mono">{f.text?.slice(0, 60)}…</span>
                      {f.send_error && <span className="ml-1 text-rose-600"> — {f.send_error.slice(0, 80)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card className="p-4 border-nude-200">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-nude-400" />
            <Input
              placeholder="Filtrar por nome, telefone ou mensagem..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1"
              data-testid="log-filter"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-360px)]">
            <div className="space-y-2 pr-3">
              {filtered.length === 0 ? (
                <div className="text-center text-nude-400 py-12">
                  {logs.length === 0 ? "Aguardando mensagens..." : "Nenhuma mensagem com esse filtro"}
                </div>
              ) : (
                filtered.map((m) => (
                  <LogRow key={m.id} msg={m} />
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "slate", Icon }) {
  const colors = {
    slate: "bg-nude-100 text-nude-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-gold-100 text-gold-700",
    amber: "bg-gold-100 text-gold-700",
  };
  return (
    <Card className="p-4 border-nude-200">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-nude-500">{label}</div>
          <div className="font-display font-bold text-3xl mt-1 text-nude-900">{value}</div>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-md ${colors[color]} grid place-items-center`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

function LogRow({ msg }) {
  const isIn = !msg.from_me;
  const isBot = !!msg.bot;
  const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(msg.created_at).toLocaleDateString("pt-BR");
  const tagColor = isIn
    ? "bg-blue-100 text-blue-800"
    : isBot
      ? "bg-gold-100 text-gold-800"
      : "bg-gold-100 text-gold-800";
  const tagLabel = isIn ? "Recebida" : isBot ? "Robô IA" : "Enviada";
  const Icon = isIn ? ArrowDownLeft : isBot ? Bot : ArrowUpRight;
  return (
    <div className="flex gap-3 p-3 rounded-md border border-nude-200 bg-white hover:border-nude-300 transition-colors">
      <div className={`w-8 h-8 rounded-md ${tagColor} grid place-items-center shrink-0`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${tagColor} hover:${tagColor} text-[10px]`}>{tagLabel}</Badge>
          <span className="font-medium text-sm">{msg.contact_name || "—"}</span>
          <span className="text-xs text-nude-500 font-mono">{msg.contact_phone}</span>
          <span className="text-xs text-nude-400 ml-auto">{date} • {time}</span>
        </div>
        <div className="text-sm text-nude-700 mt-1 whitespace-pre-wrap break-words">
          {msg.text}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {msg.provider && (
            <span className="text-[10px] text-nude-400 uppercase tracking-wider">via {msg.provider}</span>
          )}
          {msg.from_me && (
            msg.delivered === false ? (
              <span className="text-[10px] text-rose-600 flex items-center gap-1" title={msg.send_error || ''}>
                <AlertCircle className="w-3 h-3" /> Não enviado {msg.send_error ? `— ${msg.send_error.slice(0,40)}` : ''}
              </span>
            ) : msg.wa_status === "read" ? (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Lida
              </span>
            ) : msg.wa_status === "received" ? (
              <span className="text-[10px] text-gold-600 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Recebida
              </span>
            ) : msg.delivered ? (
              <span className="text-[10px] text-gold-600 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Entregue
              </span>
            ) : (
              <span className="text-[10px] text-nude-500 flex items-center gap-1">
                Enviando...
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
