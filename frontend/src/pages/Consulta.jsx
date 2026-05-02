import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Scale, Search, Calendar, Building2, FileText, ArrowRight,
  CheckCircle2, AlertCircle, Clock, Info, MessageCircle,
} from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function Consulta() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);

  const consult = async (e) => {
    e?.preventDefault();
    if (!phone) { toast.error("Informe seu telefone"); return; }
    setLoading(true);
    setResult(null);
    setSelected(null);
    try {
      const { data } = await axios.post(`${BACKEND}/api/public/consulta`, { phone });
      setResult(data);
      if (data.processes?.length === 1) setSelected(data.processes[0]);
      if (!data.found) toast.info("Nenhum processo encontrado para esse número");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao consultar");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s) => {
    if (s === "Em Andamento") return "bg-blue-100 text-blue-800";
    if (s === "Aguardando Sentença") return "bg-gold-100 text-gold-800";
    if (s === "Concluído") return "bg-gold-100 text-gold-800";
    return "bg-nude-100 text-nude-700";
  };

  const timelineIcon = (type) => {
    if (type === "success") return <CheckCircle2 className="w-4 h-4 text-gold-600" />;
    if (type === "warning") return <AlertCircle className="w-4 h-4 text-gold-600" />;
    if (type === "critical") return <AlertCircle className="w-4 h-4 text-rose-600" />;
    return <Info className="w-4 h-4 text-blue-600" />;
  };

  return (
    <div className="min-h-screen bg-nude-50">
      <header className="border-b border-nude-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-nude-900 grid place-items-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <div className="font-display font-bold text-lg">LegalFlow<span className="text-gold-600">.ai</span></div>
          </Link>
          <Link to="/" className="text-sm text-nude-500 hover:text-nude-900">← Voltar para o site</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 text-gold-900 text-xs font-medium mb-4">
            <FileText className="w-3.5 h-3.5" /> Portal do Cliente
          </div>
          <h1 className="font-display font-bold text-4xl lg:text-5xl tracking-tight leading-tight">
            Consulte o andamento<br/>do seu processo
          </h1>
          <p className="text-nude-600 mt-4 max-w-xl mx-auto">
            Digite seu WhatsApp cadastrado no escritório para ver a timeline completa do seu processo jurídico.
          </p>
        </div>

        <Card className="max-w-xl mx-auto p-6 mb-8 border-nude-200">
          <form onSubmit={consult} className="space-y-3">
            <div>
              <Label>Telefone com DDD</Label>
              <Input
                placeholder="Ex: 11 98765-4321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="consulta-phone"
                className="h-12 text-base"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-nude-900 hover:bg-nude-800 h-12"
              data-testid="consulta-submit"
            >
              {loading ? "Consultando..." : <>Consultar processo <ArrowRight className="ml-2 w-4 h-4" /></>}
            </Button>
          </form>
        </Card>

        {result && !result.found && (
          <Card className="max-w-xl mx-auto p-8 border-gold-200 bg-gold-50 text-center">
            <AlertCircle className="w-10 h-10 text-gold-600 mx-auto mb-3" />
            <h2 className="font-display font-semibold text-xl mb-1">Nenhum processo encontrado</h2>
            <p className="text-sm text-nude-600">
              Não encontramos processos vinculados a esse telefone. Entre em contato com o escritório para verificação.
            </p>
          </Card>
        )}

        {result?.found && (
          <div className="max-w-4xl mx-auto">
            <Card className="p-5 bg-gold-50 border-gold-200 mb-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-gold-600" />
                <div>
                  <div className="font-display font-semibold text-base">
                    Olá, {result.client_name || "cliente"}!
                  </div>
                  <div className="text-sm text-nude-600">
                    Encontramos {result.processes.length} processo(s) vinculado(s) ao seu telefone.
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-12 gap-6">
              <div className="md:col-span-5 space-y-3">
                {result.processes.map((p) => (
                  <Card
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`p-4 cursor-pointer transition-all ${
                      selected?.id === p.id ? "border-nude-900 shadow-md" : "border-nude-200 hover:border-nude-400"
                    }`}
                    data-testid={`proc-card-${p.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm leading-tight">{p.case_type}</div>
                      <Badge className={`${statusColor(p.status)} hover:${statusColor(p.status)} text-[10px]`}>
                        {p.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-nude-500 font-mono mt-1.5">{p.process_number}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-nude-500">
                      {p.court && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {p.court}
                        </span>
                      )}
                      {p.next_hearing && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(p.next_hearing).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="md:col-span-7">
                {selected ? (
                  <Card className="p-6 border-nude-200 bg-white">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="text-xs tracking-widest uppercase font-semibold text-gold-600 mb-1">Processo</div>
                        <h2 className="font-display font-bold text-xl">{selected.case_type}</h2>
                        <div className="text-xs text-nude-500 font-mono mt-1">{selected.process_number}</div>
                      </div>
                      <Badge className={`${statusColor(selected.status)} hover:${statusColor(selected.status)}`}>
                        {selected.status}
                      </Badge>
                    </div>

                    {selected.description && (
                      <p className="text-sm text-nude-600 mb-4">{selected.description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
                      {selected.court && (
                        <div>
                          <div className="text-xs text-nude-500">Vara/Tribunal</div>
                          <div className="font-medium">{selected.court}</div>
                        </div>
                      )}
                      {selected.next_hearing && (
                        <div>
                          <div className="text-xs text-nude-500">Próxima audiência</div>
                          <div className="font-medium text-gold-700">
                            {new Date(selected.next_hearing).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator className="my-5" />

                    <div className="mb-3">
                      <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-2">Timeline</div>
                    </div>

                    <div className="relative pl-4">
                      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-nude-200" />
                      <div className="space-y-5">
                        {(selected.timeline || []).map((e, i) => (
                          <div key={i} className="relative" data-testid={`timeline-event-${i}`}>
                            <div className="absolute -left-4 top-0 w-5 h-5 rounded-full bg-white border-2 border-nude-200 grid place-items-center">
                              {timelineIcon(e.type)}
                            </div>
                            <div className="ml-4">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-nude-400" />
                                <span className="text-xs text-nude-500">
                                  {new Date(e.date).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="font-medium text-sm text-nude-900 mt-0.5">{e.event}</div>
                              {e.description && (
                                <div className="text-sm text-nude-600 mt-0.5">{e.description}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!selected.timeline || selected.timeline.length === 0) && (
                          <div className="text-sm text-nude-400">Sem eventos registrados</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 p-3 bg-nude-50 rounded-md border border-nude-200 flex items-start gap-3">
                      <MessageCircle className="w-4 h-4 text-nude-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-nude-600">
                        Para esclarecimentos ou novas informações, entre em contato diretamente com o escritório via WhatsApp.
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-10 border-dashed border-nude-300 text-center text-nude-400">
                    Selecione um processo à esquerda para ver detalhes
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
