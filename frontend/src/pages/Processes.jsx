import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar, Trash2, Scale, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function Processes() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_name: "", process_number: "", case_type: "", court: "",
    status: "Em Andamento", description: "", next_hearing: "",
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await api.get("/processes");
    setItems(data);
  };

  const create = async () => {
    if (!form.client_name || !form.process_number || !form.case_type) {
      toast.error("Cliente, número e tipo são obrigatórios");
      return;
    }
    try {
      await api.post("/processes", form);
      toast.success("Processo cadastrado");
      setOpen(false);
      setForm({ client_name: "", process_number: "", case_type: "", court: "", status: "Em Andamento", description: "", next_hearing: "" });
      load();
    } catch { toast.error("Erro"); }
  };

  const remove = async (id) => {
    if (!confirm("Excluir processo?")) return;
    await api.delete(`/processes/${id}`);
    load();
  };

  const statusColor = (s) => {
    if (s === "Em Andamento") return "bg-blue-100 text-blue-800";
    if (s === "Aguardando Sentença") return "bg-gold-100 text-gold-800";
    if (s === "Concluído") return "bg-gold-100 text-gold-800";
    return "bg-nude-100 text-nude-700";
  };

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Jurídico</div>
          <h1 className="font-display font-bold text-2xl">Gestão de Processos</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-nude-900 hover:bg-nude-800" data-testid="new-process-btn">
              <Plus className="w-4 h-4 mr-2" /> Novo Processo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Cadastrar Processo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Cliente</Label><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} data-testid="proc-client" /></div>
              <div><Label>Número do Processo</Label><Input placeholder="0000000-00.0000.0.00.0000" value={form.process_number} onChange={e => setForm({ ...form, process_number: e.target.value })} data-testid="proc-number" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo</Label><Input value={form.case_type} onChange={e => setForm({ ...form, case_type: e.target.value })} data-testid="proc-type" /></div>
                <div><Label>Vara/Tribunal</Label><Input value={form.court} onChange={e => setForm({ ...form, court: e.target.value })} data-testid="proc-court" /></div>
              </div>
              <div><Label>Próxima Audiência</Label><Input type="date" value={form.next_hearing} onChange={e => setForm({ ...form, next_hearing: e.target.value })} data-testid="proc-hearing" /></div>
              <div><Label>Descrição</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="proc-desc" /></div>
            </div>
            <DialogFooter>
              <Button onClick={create} className="bg-nude-900 hover:bg-nude-800" data-testid="proc-submit">Cadastrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <Card className="p-4 border-nude-200">
            <div className="text-xs text-nude-500">Total de Processos</div>
            <div className="font-display font-bold text-3xl mt-1">{items.length}</div>
          </Card>
          <Card className="p-4 border-nude-200">
            <div className="text-xs text-nude-500">Em Andamento</div>
            <div className="font-display font-bold text-3xl mt-1 text-blue-600">
              {items.filter(p => p.status === "Em Andamento").length}
            </div>
          </Card>
          <Card className="p-4 border-nude-200">
            <div className="text-xs text-nude-500">Concluídos</div>
            <div className="font-display font-bold text-3xl mt-1 text-gold-600">
              {items.filter(p => p.status === "Concluído").length}
            </div>
          </Card>
        </div>

        <Card className="border-nude-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-nude-50">
                <TableHead>Cliente</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tribunal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próx. Audiência</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(p => (
                <TableRow key={p.id} data-testid={`process-row-${p.id}`}>
                  <TableCell className="font-medium">{p.client_name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.process_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Scale className="w-3 h-3 text-nude-400" />
                      {p.case_type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-nude-600">
                      <Building2 className="w-3 h-3" />
                      {p.court || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColor(p.status)} hover:${statusColor(p.status)}`}>{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {p.next_hearing ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="w-3 h-3 text-gold-600" />
                        {new Date(p.next_hearing).toLocaleDateString("pt-BR")}
                      </div>
                    ) : <span className="text-nude-400 text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => remove(p.id)} data-testid={`delete-process-${p.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-nude-400 py-12">Nenhum processo cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
