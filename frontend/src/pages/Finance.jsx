import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, TrendingUp, TrendingDown, Wallet, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Finance() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_name: "", description: "", amount: "", type: "receita",
    status: "pendente", due_date: "",
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await api.get("/finance/transactions");
    setItems(data);
  };

  const create = async () => {
    if (!form.description || !form.amount) {
      toast.error("Descrição e valor obrigatórios");
      return;
    }
    try {
      await api.post("/finance/transactions", { ...form, amount: parseFloat(form.amount) });
      toast.success("Lançamento criado");
      setOpen(false);
      setForm({ client_name: "", description: "", amount: "", type: "receita", status: "pendente", due_date: "" });
      load();
    } catch { toast.error("Erro"); }
  };

  const togglePaid = async (item) => {
    const newStatus = item.status === "pago" ? "pendente" : "pago";
    await api.patch(`/finance/transactions/${item.id}`, { status: newStatus });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Excluir lançamento?")) return;
    await api.delete(`/finance/transactions/${id}`);
    load();
  };

  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const receitaPaga = items.filter(t => t.type === "receita" && t.status === "pago").reduce((s, t) => s + t.amount, 0);
  const receitaPendente = items.filter(t => t.type === "receita" && t.status === "pendente").reduce((s, t) => s + t.amount, 0);
  const despesaPaga = items.filter(t => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + t.amount, 0);
  const lucro = receitaPaga - despesaPaga;

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Financeiro</div>
          <h1 className="font-display font-bold text-2xl">Honorários & Pagamentos</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-nude-900 hover:bg-nude-800" data-testid="new-tx-btn">
              <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger data-testid="tx-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="tx-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="atrasado">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Cliente</Label><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} data-testid="tx-client" /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="tx-desc" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="tx-amount" /></div>
                <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} data-testid="tx-due" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create} className="bg-nude-900 hover:bg-nude-800" data-testid="tx-submit">Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <KPICard label="Receita Paga" value={fmt(receitaPaga)} color="emerald" Icon={TrendingUp} />
          <KPICard label="A Receber" value={fmt(receitaPendente)} color="amber" Icon={Wallet} />
          <KPICard label="Despesas" value={fmt(despesaPaga)} color="rose" Icon={TrendingDown} />
          <KPICard label="Lucro Líquido" value={fmt(lucro)} color={lucro >= 0 ? "slate" : "rose"} Icon={Wallet} />
        </div>

        <Card className="border-nude-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-nude-50">
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(t => (
                <TableRow key={t.id} data-testid={`tx-row-${t.id}`}>
                  <TableCell>
                    <Badge variant="outline" className={t.type === "receita" ? "border-gold-300 text-gold-700" : "border-rose-300 text-rose-700"}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{t.client_name}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-xs">
                    {t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {t.type === "receita" ? "+" : "-"} {fmt(t.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      t.status === "pago" ? "bg-gold-100 text-gold-800 hover:bg-gold-100" :
                      t.status === "atrasado" ? "bg-rose-100 text-rose-800 hover:bg-rose-100" :
                      "bg-gold-100 text-gold-800 hover:bg-gold-100"
                    }>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePaid(t)} data-testid={`toggle-paid-${t.id}`}>
                        <CheckCircle2 className={`w-3.5 h-3.5 ${t.status === "pago" ? "text-gold-600" : "text-nude-400"}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => remove(t.id)} data-testid={`delete-tx-${t.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-nude-400 py-12">Nenhum lançamento</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ label, value, color, Icon }) {
  const colors = {
    emerald: { bg: "bg-gold-50", icon: "text-gold-600", border: "border-gold-200" },
    amber: { bg: "bg-gold-50", icon: "text-gold-600", border: "border-gold-200" },
    rose: { bg: "bg-rose-50", icon: "text-rose-600", border: "border-rose-200" },
    slate: { bg: "bg-nude-50", icon: "text-nude-700", border: "border-nude-200" },
  };
  const c = colors[color] || colors.slate;
  return (
    <Card className={`p-4 border-nude-200`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-nude-500">{label}</div>
          <div className="font-display font-bold text-2xl mt-1 text-nude-900">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded-md ${c.bg} grid place-items-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
    </Card>
  );
}
