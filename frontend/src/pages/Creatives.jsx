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
import { Sparkles, Instagram, Facebook, Linkedin, Trash2, Download, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function Creatives() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({
    title: "", network: "instagram", format: "post",
    topic: "", tone: "profissional", case_type: "",
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await api.get("/creatives");
    setItems(data);
  };

  const generate = async () => {
    if (!form.title || !form.topic) {
      toast.error("Título e tema são obrigatórios");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post("/creatives/generate", form);
      toast.success("Criativo gerado!");
      setPreview(data);
      setOpen(false);
      setForm({ title: "", network: "instagram", format: "post", topic: "", tone: "profissional", case_type: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Excluir criativo?")) return;
    await api.delete(`/creatives/${id}`);
    load();
  };

  const copyCaption = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Legenda copiada");
  };

  const download = (item) => {
    if (!item.image_b64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${item.image_b64}`;
    a.download = `legalflow-${item.id}.png`;
    a.click();
  };

  const NetIcon = ({ network, className }) => {
    if (network === "instagram") return <Instagram className={className} />;
    if (network === "facebook") return <Facebook className={className} />;
    return <Linkedin className={className} />;
  };

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Powered by IA
          </div>
          <h1 className="font-display font-bold text-2xl">Criativos para Redes Sociais</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-nude-900 hover:bg-nude-800" data-testid="ai-generate-post-btn">
              <Wand2 className="w-4 h-4 mr-2" /> Criar com IA
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Gerar Criativo com IA</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Título do Post</Label><Input placeholder="Ex: 5 direitos do trabalhador demitido" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="creative-title" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rede Social</Label>
                  <Select value={form.network} onValueChange={v => setForm({ ...form, network: v })}>
                    <SelectTrigger data-testid="creative-network"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Formato</Label>
                  <Select value={form.format} onValueChange={v => setForm({ ...form, format: v })}>
                    <SelectTrigger data-testid="creative-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post">Post</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="carousel">Carrossel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Caso</Label>
                  <Select value={form.case_type} onValueChange={v => setForm({ ...form, case_type: v })}>
                    <SelectTrigger data-testid="creative-case-type"><SelectValue placeholder="Geral" /></SelectTrigger>
                    <SelectContent>
                      {["Geral", "Família", "Trabalhista", "INSS", "Bancário", "Civil", "Empresarial", "Consumidor"].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tom</Label>
                  <Select value={form.tone} onValueChange={v => setForm({ ...form, tone: v })}>
                    <SelectTrigger data-testid="creative-tone"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="informativo">Informativo</SelectItem>
                      <SelectItem value="amigavel">Amigável</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Tema / Mensagem Principal</Label><Textarea rows={3} placeholder="Sobre o que é o post? Qual a mensagem chave?" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} data-testid="creative-topic" /></div>
            </div>
            <DialogFooter>
              <Button onClick={generate} disabled={generating} className="bg-nude-900 hover:bg-nude-800" data-testid="creative-generate">
                {generating ? <><span className="animate-pulse-soft">Gerando arte e legenda...</span></> : <><Sparkles className="w-4 h-4 mr-2" /> Gerar com IA</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {items.length === 0 ? (
          <Card className="p-12 border-dashed border-nude-300 text-center">
            <div className="w-12 h-12 rounded-md bg-gold-100 grid place-items-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-gold-700" />
            </div>
            <div className="font-display font-semibold text-lg mb-1">Nenhum criativo ainda</div>
            <div className="text-sm text-nude-500 mb-4 max-w-sm mx-auto">
              Gere posts profissionais para Instagram, Facebook e LinkedIn em segundos com IA.
            </div>
            <Button onClick={() => setOpen(true)} className="bg-nude-900 hover:bg-nude-800">
              <Wand2 className="w-4 h-4 mr-2" /> Criar primeiro post
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map(item => (
              <Card key={item.id} className="overflow-hidden border-nude-200 hover:shadow-md transition-shadow" data-testid={`creative-card-${item.id}`}>
                <div className="aspect-square bg-nude-100 relative overflow-hidden">
                  {item.image_b64 ? (
                    <img src={`data:image/png;base64,${item.image_b64}`} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-nude-300">
                      <Sparkles className="w-8 h-8" />
                    </div>
                  )}
                  <Badge className="absolute top-2 left-2 bg-white/90 text-nude-900 hover:bg-white/90 gap-1 backdrop-blur">
                    <NetIcon network={item.network} className="w-3 h-3" />
                    {item.network}
                  </Badge>
                </div>
                <div className="p-3">
                  <div className="font-medium text-sm line-clamp-1">{item.title}</div>
                  <div className="text-xs text-nude-500 line-clamp-3 mt-1.5 whitespace-pre-wrap min-h-[3rem]">{item.caption}</div>
                  <div className="flex gap-1 mt-3 pt-3 border-t border-nude-100">
                    <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => copyCaption(item.caption)} data-testid={`copy-caption-${item.id}`}>
                      <Copy className="w-3 h-3 mr-1" /> Legenda
                    </Button>
                    {item.image_b64 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => download(item)} data-testid={`download-creative-${item.id}`}>
                        <Download className="w-3 h-3 mr-1" /> PNG
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => remove(item.id)} data-testid={`delete-creative-${item.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview dialog */}
      {preview && (
        <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold-500" /> Criativo Gerado
              </DialogTitle>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="aspect-square bg-nude-100 rounded-md overflow-hidden">
                {preview.image_b64 ? (
                  <img src={`data:image/png;base64,${preview.image_b64}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-nude-400">Imagem não gerada</div>
                )}
              </div>
              <div className="flex flex-col">
                <div className="font-display font-semibold text-base mb-2">{preview.title}</div>
                <div className="text-sm text-nude-700 whitespace-pre-wrap flex-1">{preview.caption}</div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => copyCaption(preview.caption)} variant="outline" className="flex-1">
                    <Copy className="w-4 h-4 mr-2" /> Copiar legenda
                  </Button>
                  {preview.image_b64 && (
                    <Button onClick={() => download(preview)} className="flex-1 bg-nude-900 hover:bg-nude-800">
                      <Download className="w-4 h-4 mr-2" /> Baixar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
