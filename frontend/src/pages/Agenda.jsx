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
import { toast } from "sonner";
import {
  Plus, Calendar, Clock, Video, User, Link2, Trash2,
  CheckCircle2, AlertCircle, XCircle, ChevronLeft, ChevronRight, Copy,
} from "lucide-react";

const STATUS_COLORS = {
  confirmado: "bg-gold-100 text-gold-800",
  pendente: "bg-gold-100 text-gold-800",
  cancelado: "bg-rose-100 text-rose-800",
};

export default function Agenda() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list");
  const [cursor, setCursor] = useState(new Date());
  const [form, setForm] = useState({
    title: "", client_name: "", starts_at: "", duration_min: 60,
    location: "Google Meet", notes: "", status: "confirmado",
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await api.get("/appointments");
    setItems(data);
  };

  const create = async () => {
    if (!form.title || !form.starts_at) { toast.error("Título e data obrigatórios"); return; }
    try {
      await api.post("/appointments", { ...form, starts_at: new Date(form.starts_at).toISOString() });
      toast.success("Reunião agendada");
      setOpen(false);
      setForm({ title: "", client_name: "", starts_at: "", duration_min: 60, location: "Google Meet", notes: "", status: "confirmado" });
      load();
    } catch { toast.error("Erro"); }
  };

  const remove = async (id) => {
    if (!confirm("Excluir reunião?")) return;
    await api.delete(`/appointments/${id}`);
    load();
  };

  const toggleStatus = async (item, status) => {
    await api.patch(`/appointments/${item.id}`, { status });
    load();
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const today = new Date();
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const firstDayOfWeek = monthStart.getDay();

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const itemsByDay = {};
  items.forEach(i => {
    const d = new Date(i.starts_at);
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) return;
    const key = d.getDate();
    itemsByDay[key] = itemsByDay[key] || [];
    itemsByDay[key].push(i);
  });

  const upcoming = items
    .filter(i => new Date(i.starts_at) >= new Date(today.setHours(0, 0, 0, 0)))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, 20);

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Calendário</div>
          <h1 className="font-display font-bold text-2xl">Agenda de Reuniões</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-nude-200 rounded-md p-0.5 bg-white">
            <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} className="h-7" onClick={() => setView("calendar")}>Mês</Button>
            <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="h-7" onClick={() => setView("list")}>Lista</Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-nude-900 hover:bg-nude-800" data-testid="new-appt-btn">
                <Plus className="w-4 h-4 mr-2" /> Nova reunião
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Reunião</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Título</Label><Input placeholder="Ex: Consulta inicial - Divorcio" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="appt-title" /></div>
                <div><Label>Cliente</Label><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} data-testid="appt-client" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data e hora</Label><Input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} data-testid="appt-starts" /></div>
                  <div>
                    <Label>Duração (min)</Label>
                    <Select value={String(form.duration_min)} onValueChange={v => setForm({ ...form, duration_min: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[15, 30, 45, 60, 90, 120].map(m => <SelectItem key={m} value={String(m)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Local</Label>
                  <Select value={form.location} onValueChange={v => setForm({ ...form, location: v })}>
                    <SelectTrigger data-testid="appt-location"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Google Meet">Google Meet (link automático)</SelectItem>
                      <SelectItem value="Zoom">Zoom</SelectItem>
                      <SelectItem value="Presencial">Presencial no escritório</SelectItem>
                      <SelectItem value="Telefone">Ligação telefônica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="appt-notes" /></div>
              </div>
              <DialogFooter>
                <Button onClick={create} className="bg-nude-900 hover:bg-nude-800" data-testid="appt-submit">Agendar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {view === "calendar" && (
          <Card className="border-nude-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="font-display font-semibold text-lg capitalize">{monthLabel}</div>
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-px bg-nude-200 rounded-md overflow-hidden text-xs">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map(d => (
                <div key={d} className="bg-nude-50 py-2 text-center font-semibold text-nude-600">{d}</div>
              ))}
              {Array(firstDayOfWeek).fill(0).map((_, i) => (
                <div key={`e${i}`} className="bg-white min-h-[90px]" />
              ))}
              {Array(daysInMonth).fill(0).map((_, i) => {
                const day = i + 1;
                const isToday = day === new Date().getDate() && cursor.getMonth() === new Date().getMonth() && cursor.getFullYear() === new Date().getFullYear();
                const dayItems = itemsByDay[day] || [];
                return (
                  <div key={day} className={`bg-white min-h-[90px] p-1.5 ${isToday ? "ring-2 ring-gold-400 ring-inset" : ""}`}>
                    <div className={`text-right font-semibold text-xs ${isToday ? "text-gold-600" : "text-nude-700"}`}>{day}</div>
                    <div className="mt-1 space-y-0.5">
                      {dayItems.slice(0, 3).map(it => (
                        <div key={it.id} className="truncate text-[10px] bg-nude-900 text-white px-1 py-0.5 rounded">
                          {new Date(it.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {it.title}
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <div className="text-[10px] text-nude-500">+{dayItems.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {view === "list" && (
          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <Card className="p-10 border-dashed border-nude-300 text-center text-nude-400">
                Nenhuma reunião agendada. Clique em "Nova reunião" para começar.
              </Card>
            ) : upcoming.map(it => {
              const d = new Date(it.starts_at);
              const dateLabel = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
              const timeLabel = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <Card key={it.id} className="p-4 border-nude-200 hover:shadow-sm transition-shadow" data-testid={`appt-${it.id}`}>
                  <div className="flex items-start gap-4">
                    <div className="text-center min-w-[70px] border-r border-nude-200 pr-4">
                      <div className="text-[10px] text-nude-500 uppercase tracking-widest">{dateLabel.split(" ")[0]}</div>
                      <div className="font-display font-bold text-2xl text-nude-900">{d.getDate()}</div>
                      <div className="text-xs text-nude-500 capitalize">{dateLabel.split(" ")[2]}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-nude-900">{it.title}</div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-nude-600">
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeLabel} · {it.duration_min}min</span>
                            {it.client_name && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{it.client_name}</span>}
                            <span className="flex items-center gap-1"><Video className="w-3.5 h-3.5" />{it.location}</span>
                          </div>
                          {it.notes && <div className="text-xs text-nude-500 mt-1.5 line-clamp-2">{it.notes}</div>}
                          {it.meeting_link && (
                            <div className="flex items-center gap-2 mt-2">
                              <Link2 className="w-3.5 h-3.5 text-gold-600" />
                              <a href={it.meeting_link} target="_blank" rel="noreferrer" className="text-xs text-gold-700 hover:underline truncate max-w-md">
                                {it.meeting_link}
                              </a>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyLink(it.meeting_link)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <Badge className={`${STATUS_COLORS[it.status]} hover:${STATUS_COLORS[it.status]} shrink-0`}>
                          {it.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1.5 mt-3 pt-3 border-t border-nude-100">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleStatus(it, "confirmado")}>
                          <CheckCircle2 className="w-3 h-3 mr-1 text-gold-600" /> Confirmar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleStatus(it, "pendente")}>
                          <AlertCircle className="w-3 h-3 mr-1 text-gold-600" /> Pendente
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleStatus(it, "cancelado")}>
                          <XCircle className="w-3 h-3 mr-1 text-rose-500" /> Cancelar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto text-rose-500 hover:text-rose-600" onClick={() => remove(it.id)}>
                          <Trash2 className="w-3 h-3 mr-1" /> Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
