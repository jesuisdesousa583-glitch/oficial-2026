import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Phone, Mail, Trash2, Flame, Tag } from "lucide-react";
import { toast } from "sonner";

const URG_COLORS = {
  baixa: "bg-nude-100 text-nude-700",
  media: "bg-blue-100 text-blue-700",
  alta: "bg-gold-100 text-gold-800",
  critica: "bg-rose-100 text-rose-700",
};

const COLOR_MAP = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  yellow: { bg: "bg-gold-50", text: "text-gold-800", dot: "bg-gold-500" },
  green: { bg: "bg-gold-50", text: "text-gold-700", dot: "bg-gold-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  emerald: { bg: "bg-gold-50", text: "text-gold-800", dot: "bg-gold-600" },
  red: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
};

export default function CRM() {
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", case_type: "", description: "" });

  useEffect(() => {
    api.get("/crm/stages").then((r) => setStages(r.data)).catch(() => {});
    load();
  }, []);

  const load = async () => {
    const { data } = await api.get("/leads");
    setLeads(data);
  };

  const create = async () => {
    if (!form.name || !form.phone) {
      toast.error("Nome e telefone obrigatórios");
      return;
    }
    try {
      await api.post("/leads", form);
      toast.success("Lead criado");
      setOpen(false);
      setForm({ name: "", phone: "", email: "", case_type: "", description: "" });
      load();
    } catch {
      toast.error("Erro ao criar");
    }
  };

  const moveStage = async (id, stage) => {
    await api.patch(`/leads/${id}`, { stage });
    load();
  };

  const removeLead = async (id) => {
    if (!confirm("Excluir este lead?")) return;
    await api.delete(`/leads/${id}`);
    load();
  };

  return (
    <div className="h-screen flex flex-col bg-nude-50">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">CRM</div>
          <h1 className="font-display font-bold text-2xl">Pipeline Kanban</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-nude-900 hover:bg-nude-800" data-testid="new-lead-btn">
              <Plus className="w-4 h-4 mr-2" /> Novo Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="lead-name" /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} data-testid="lead-phone" /></div>
              <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="lead-email" /></div>
              <div>
                <Label>Área do Direito</Label>
                <Select value={form.case_type} onValueChange={v => setForm({ ...form, case_type: v })}>
                  <SelectTrigger data-testid="lead-case-type"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {["Família", "Trabalhista", "Previdenciário/INSS", "Bancário", "Cível", "Criminal", "Empresarial", "Tributário", "Consumidor"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Descrição</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="lead-desc" /></div>
            </div>
            <DialogFooter>
              <Button onClick={create} className="bg-nude-900 hover:bg-nude-800" data-testid="lead-submit">Criar Lead</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 min-w-max h-full">
          {stages.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.id);
            const c = COLOR_MAP[stage.color] || COLOR_MAP.blue;
            return (
              <div key={stage.id} className="w-80 shrink-0 flex flex-col" data-testid={`column-${stage.id}`}>
                <div className={`${c.bg} rounded-md border border-nude-200 px-3 py-2.5 flex items-center justify-between mb-2`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    <span className={`font-display font-semibold text-sm ${c.text}`}>{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs h-5 bg-white">{stageLeads.length}</Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto pb-4 pr-1">
                  {stageLeads.map(lead => (
                    <Card key={lead.id} className="p-3 border-nude-200 hover:shadow-sm hover:border-nude-300 transition-all" data-testid={`lead-card-${lead.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-medium text-sm leading-tight">{lead.name}</div>
                        <Badge className="bg-nude-900 hover:bg-nude-900 text-white text-[10px] shrink-0">
                          {lead.score}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {lead.case_type && (
                          <Badge variant="outline" className="text-[10px]">{lead.case_type}</Badge>
                        )}
                        {lead.urgency && lead.urgency !== "media" && (
                          <Badge className={`${URG_COLORS[lead.urgency]} hover:${URG_COLORS[lead.urgency]} text-[10px] gap-1`}>
                            <Flame className="w-2.5 h-2.5" />
                            {lead.urgency}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-nude-500">
                        <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {lead.phone}</div>
                        {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3" /> {lead.email}</div>}
                      </div>
                      {lead.description && <div className="text-xs text-nude-600 mt-2 line-clamp-2">{lead.description}</div>}
                      {lead.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {lead.tags.slice(0, 4).map((t, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-nude-100 text-nude-600 rounded inline-flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />{t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-3 pt-2 border-t border-nude-100">
                        <Select value={lead.stage} onValueChange={(v) => moveStage(lead.id, v)}>
                          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => removeLead(lead.id)} data-testid={`delete-lead-${lead.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-xs text-nude-400 text-center py-6">Sem leads</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
