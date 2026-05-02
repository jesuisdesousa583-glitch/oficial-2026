import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, AlertTriangle, Gauge, Search, BookOpen,
  Sparkles, ChevronRight, RefreshCcw, Filter, FileText,
} from "lucide-react";
import { toast } from "sonner";

const QUAL_META = {
  qualificado: { label: "Qualificado", cls: "bg-gold-600 text-white", icon: ShieldCheck },
  nao_qualificado: { label: "Não qualificado", cls: "bg-rose-600 text-white", icon: AlertTriangle },
  necessita_mais_info: { label: "Mais info", cls: "bg-nude-700 text-white", icon: Gauge },
};

export default function AdminCases() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/admin/case-analyses" : `/admin/case-analyses?qualificacao=${filter}`;
      const { data } = await api.get(url);
      setData(data);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error("Acesso restrito ao administrador");
      } else {
        toast.error("Erro ao carregar análises");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [filter]);

  const openDetail = async (item) => {
    setSelected(item);
    setAdminNotes(item.admin_notes || "");
    try {
      const { data } = await api.get(`/admin/case-analyses/${item.id}`);
      setDetail(data);
    } catch {
      toast.error("Erro ao abrir detalhe");
    }
  };

  const updateQual = async (q) => {
    if (!selected) return;
    try {
      await api.patch(`/admin/case-analyses/${selected.id}`, {
        qualificacao: q,
        notes: adminNotes,
      });
      toast.success("Qualificação atualizada");
      await load();
      // refresh detail
      const { data } = await api.get(`/admin/case-analyses/${selected.id}`);
      setDetail(data);
      setSelected(data.analysis);
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  const refreshLegislation = async () => {
    try {
      await api.post("/legislation/refresh");
      toast.success("Brief de legislação atualizado");
    } catch {
      toast.error("Erro ao atualizar legislação");
    }
  };

  const items = (data?.items || []).filter((it) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (it.visitor_name || "").toLowerCase().includes(s) ||
      (it.area || "").toLowerCase().includes(s) ||
      (it.resumo || "").toLowerCase().includes(s) ||
      (it.visitor_phone || "").includes(search)
    );
  });

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="admin-cases-page">
      <div className="px-8 py-5 bg-card border-b border-nude-200 flex items-center justify-between shrink-0">
        <div>
          <div className="overline text-gold-600">Painel Administrativo</div>
          <h1 className="font-serif text-3xl text-nude-900 mt-1 tracking-tight">
            Casos analisados pela IA
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshLegislation}
            className="gap-1.5"
            data-testid="refresh-leg-btn"
          >
            <BookOpen className="w-3.5 h-3.5" /> Atualizar legislação do dia
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="gap-1.5"
            data-testid="refresh-btn"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-8 pt-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4 border-nude-200" data-testid="kpi-total">
          <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold">Total</div>
          <div className="font-serif text-3xl text-nude-900 mt-1">{data?.total ?? 0}</div>
        </Card>
        <Card className="p-4 border-gold-200 bg-gold-50/40" data-testid="kpi-qualificados">
          <div className="text-xs tracking-widest uppercase text-gold-700 font-semibold">Qualificados</div>
          <div className="font-serif text-3xl text-gold-800 mt-1">{data?.qualificados ?? 0}</div>
        </Card>
        <Card className="p-4 border-rose-200 bg-rose-50/40" data-testid="kpi-nao-qualif">
          <div className="text-xs tracking-widest uppercase text-rose-700 font-semibold">Não qualificados</div>
          <div className="font-serif text-3xl text-rose-800 mt-1">{data?.nao_qualificados ?? 0}</div>
        </Card>
        <Card className="p-4 border-nude-200 bg-nude-100/30" data-testid="kpi-mais-info">
          <div className="text-xs tracking-widest uppercase text-nude-700 font-semibold">+ Info</div>
          <div className="font-serif text-3xl text-nude-900 mt-1">{data?.necessita_mais_info ?? 0}</div>
        </Card>
        <Card className="p-4 border-nude-200" data-testid="kpi-acert-medio">
          <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold">Acertividade média</div>
          <div className="font-serif text-3xl text-nude-900 mt-1">{data?.avg_acertividade ?? 0}%</div>
          <Progress value={data?.avg_acertividade ?? 0} className="h-1.5 mt-2 bg-nude-100" />
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 p-5 overflow-hidden">
        {/* LIST */}
        <Card className="col-span-12 lg:col-span-5 flex flex-col overflow-hidden border-nude-200" data-testid="cases-list">
          <div className="p-3 border-b border-nude-200 flex flex-wrap gap-2 items-center bg-nude-50/60">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-nude-400" />
              <Input
                placeholder="Buscar nome, área, telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                data-testid="search-input"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 px-2 rounded-md border border-nude-200 bg-white text-xs"
              data-testid="qualif-filter"
            >
              <option value="all">Todos</option>
              <option value="qualificado">Qualificados</option>
              <option value="nao_qualificado">Não qualificados</option>
              <option value="necessita_mais_info">+ Info</option>
            </select>
            <Filter className="w-4 h-4 text-nude-400" />
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-8 text-sm text-nude-500 text-center">Carregando…</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-sm text-nude-500 text-center">
                Nenhum caso analisado ainda.
                <br />
                Use a página <strong>Chat IA · Análise</strong> para gerar análises.
              </div>
            ) : (
              items.map((it) => {
                const QM = QUAL_META[it.qualificacao] || QUAL_META.necessita_mais_info;
                return (
                  <button
                    key={it.id}
                    onClick={() => openDetail(it)}
                    className={`w-full text-left px-4 py-3 border-b border-nude-100 hover:bg-nude-50 transition-colors flex items-start gap-3 ${
                      selected?.id === it.id ? "bg-gold-50/60" : ""
                    }`}
                    data-testid={`case-item-${it.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-medium text-sm text-nude-900 truncate">
                          {it.visitor_name || "Cliente anônimo"}
                        </div>
                        <Badge className={`${QM.cls} hover:${QM.cls} gap-1 text-[10px] px-2`}>
                          <QM.icon className="w-2.5 h-2.5" /> {QM.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-nude-500 truncate mb-1.5">
                        {it.area || "—"} · {it.visitor_phone || "sem telefone"}
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-gold-700 font-semibold">
                          {it.acertividade}% acertividade
                        </span>
                        <span className="text-nude-700">
                          {it.chance_exito}% êxito
                        </span>
                      </div>
                      {it.resumo && (
                        <div className="text-xs text-nude-600 mt-1 line-clamp-2">{it.resumo}</div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-nude-400 mt-1" />
                  </button>
                );
              })
            )}
          </ScrollArea>
        </Card>

        {/* DETAIL */}
        <Card className="col-span-12 lg:col-span-7 flex flex-col overflow-hidden border-nude-200" data-testid="case-detail">
          {!selected || !detail ? (
            <div className="flex-1 grid place-items-center text-nude-400 text-sm">
              Selecione um caso para ver os detalhes
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-nude-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="overline text-gold-600">Análise detalhada</div>
                    <h2 className="font-serif text-2xl text-nude-900 mt-1">
                      {selected.visitor_name || "Cliente anônimo"}
                    </h2>
                    <div className="text-sm text-nude-500 mt-1">
                      {selected.visitor_phone || "—"} · {selected.area || "Em análise"}
                    </div>
                  </div>
                  {(() => {
                    const QM = QUAL_META[selected.qualificacao] || QUAL_META.necessita_mais_info;
                    return (
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${QM.cls}`}>
                        <QM.icon className="w-3.5 h-3.5" />{" "}
                        <span className="text-xs font-medium">{QM.label}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-5 space-y-5">
                  {/* gauges */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4 bg-gold-50/40 border-gold-200">
                      <div className="text-xs tracking-widest uppercase text-gold-700 font-semibold">
                        Acertividade
                      </div>
                      <div className="font-serif text-3xl text-gold-800 mt-1">
                        {selected.acertividade}%
                      </div>
                      <Progress value={selected.acertividade} className="h-1.5 mt-2 bg-gold-100" />
                    </Card>
                    <Card className="p-4 border-nude-200">
                      <div className="text-xs tracking-widest uppercase text-nude-700 font-semibold">
                        Chance de êxito
                      </div>
                      <div className="font-serif text-3xl text-nude-900 mt-1">
                        {selected.chance_exito}%
                      </div>
                      <Progress value={selected.chance_exito} className="h-1.5 mt-2 bg-nude-100" />
                    </Card>
                  </div>

                  {selected.resumo && (
                    <div>
                      <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold mb-1.5">
                        Resumo técnico
                      </div>
                      <p className="text-sm text-nude-700 bg-nude-50 border border-nude-200 rounded-md p-3 leading-relaxed">
                        {selected.resumo}
                      </p>
                    </div>
                  )}
                  {selected.motivo && (
                    <div>
                      <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold mb-1.5">
                        Justificativa da IA
                      </div>
                      <p className="text-sm text-nude-700 leading-relaxed">{selected.motivo}</p>
                    </div>
                  )}
                  {selected.fundamentos?.length > 0 && (
                    <div>
                      <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold mb-2">
                        Fundamentos
                      </div>
                      <ul className="space-y-1.5">
                        {selected.fundamentos.map((f, i) => (
                          <li
                            key={i}
                            className="text-xs text-nude-700 bg-nude-50 border border-nude-200 rounded-md px-2.5 py-1.5"
                          >
                            <span className="text-gold-700 font-semibold">§</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selected.proxima_pergunta && (
                    <div className="bg-gold-50 border border-gold-200 rounded-md p-3">
                      <div className="text-xs uppercase tracking-widest text-gold-700 font-semibold mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> Próxima pergunta sugerida
                      </div>
                      <p className="text-sm text-nude-900 font-medium">{selected.proxima_pergunta}</p>
                    </div>
                  )}

                  <Separator />

                  {/* admin override */}
                  <div>
                    <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold mb-2">
                      Decisão do administrador
                    </div>
                    <Textarea
                      placeholder="Anotações internas (opcional)…"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={2}
                      className="mb-3"
                      data-testid="admin-notes"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-gold-600 hover:bg-gold-700 text-white gap-1.5"
                        onClick={() => updateQual("qualificado")}
                        data-testid="set-qualif-btn"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Qualificar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => updateQual("necessita_mais_info")}
                        data-testid="set-mais-info-btn"
                      >
                        <Gauge className="w-3.5 h-3.5" /> Mais info
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                        onClick={() => updateQual("nao_qualificado")}
                        data-testid="set-nao-qualif-btn"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" /> Não qualificar
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* transcript */}
                  <div>
                    <div className="text-xs tracking-widest uppercase text-nude-500 font-semibold mb-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> Transcrição da conversa
                    </div>
                    <div className="space-y-2 bg-nude-50/40 border border-nude-200 rounded-md p-3 max-h-[420px] overflow-y-auto">
                      {(detail.messages || []).map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-md text-xs ${
                              m.role === "user"
                                ? "bg-nude-900 text-white"
                                : "bg-white border border-nude-200"
                            }`}
                          >
                            <div className="font-semibold text-[10px] uppercase tracking-widest mb-1 opacity-70">
                              {m.role === "user" ? "Cliente" : "Dra. Ana"}
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
