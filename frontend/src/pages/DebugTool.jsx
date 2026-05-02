import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ImagePlus, Wand2, Send, Trash2, X, Download } from "lucide-react";

export default function DebugTool() {
  const [endpoint, setEndpoint] = useState(
    localStorage.getItem("debug_endpoint") || "https://vlnlvfcckjlclzbwjiia.supabase.co/functions/v1/merge-images"
  );
  const [instruction, setInstruction] = useState("");
  const [history, setHistory] = useState([]);
  const [img1, setImg1] = useState(null);
  const [img2, setImg2] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const { data } = await api.get("/debug/instructions");
      setHistory(data);
    } catch {}
  };

  const sendInstruction = async () => {
    const txt = instruction.trim();
    if (!txt) { toast.error("Digite uma instrução"); return; }
    try {
      await api.post("/debug/instruction", { instruction: txt });
      toast.success("Instrução registrada");
      setInstruction("");
      loadHistory();
      // also mimic Lovable error dispatch
      window.dispatchEvent(new CustomEvent("lovable-debug-error", { detail: txt }));
    } catch {
      toast.error("Erro ao registrar");
    }
  };

  const toDataUrl = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

  const onFile = async (which, file) => {
    if (!file) return;
    const url = await toDataUrl(file);
    if (which === 1) setImg1(url); else setImg2(url);
  };

  const clearAll = () => {
    setImg1(null); setImg2(null); setPrompt(""); setErr(""); setResult(null);
  };

  const runMerge = async () => {
    setErr(""); setResult(null);
    if (!img1 || !img2) { setErr("Envie as duas imagens."); return; }
    setLoading(true);
    try {
      localStorage.setItem("debug_endpoint", endpoint);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image1: img1, image2: img2, prompt }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      if (!data.image) throw new Error("Sem imagem retornada");
      setResult(data.image);
    } catch (e) {
      setErr(e.message || "Falha ao gerar");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `merged-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200">
        <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Ferramenta Interna</div>
        <h1 className="font-display font-bold text-2xl">Debug Tool</h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card className="max-w-3xl mx-auto p-6 border-nude-200">
          <Tabs defaultValue="instruction">
            <TabsList className="grid grid-cols-2 w-full max-w-sm">
              <TabsTrigger value="instruction" data-testid="dbg-tab-instr">Instrução</TabsTrigger>
              <TabsTrigger value="merge" data-testid="dbg-tab-merge">Mesclar Imagens</TabsTrigger>
            </TabsList>

            <TabsContent value="instruction" className="mt-6">
              <div className="text-sm text-nude-500 mb-3">
                Registra uma instrução técnica (apenas referência interna).
              </div>
              <Label>Instrução</Label>
              <Textarea
                rows={6}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Descreva a instrução técnica..."
                data-testid="dbg-instruction"
              />
              <div className="flex justify-end mt-3">
                <Button onClick={sendInstruction} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="dbg-fire">
                  <AlertTriangle className="w-4 h-4 mr-2" /> Registrar Instrução
                </Button>
              </div>

              {history.length > 0 && (
                <div className="mt-6 pt-4 border-t border-nude-200">
                  <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-2">Histórico</div>
                  <div className="space-y-2">
                    {history.slice(0, 8).map((h) => (
                      <div key={h.id} className="text-sm bg-nude-50 border border-nude-200 rounded-md px-3 py-2">
                        <div className="text-xs text-nude-400">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                        <div className="mt-1 whitespace-pre-wrap">{h.instruction}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="merge" className="mt-6">
              <div className="text-sm text-nude-500 mb-3">
                Envie 2 imagens + prompt opcional. A IA gera uma 3ª imagem combinada.
              </div>
              <div>
                <Label>Endpoint</Label>
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="font-mono text-xs" data-testid="dbg-endpoint" />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[1, 2].map((n) => (
                  <label key={n} className="aspect-video border-2 border-dashed border-nude-300 rounded-md flex items-center justify-center cursor-pointer bg-white hover:bg-nude-50 transition-colors overflow-hidden">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(n, e.target.files?.[0])} data-testid={`dbg-file-${n}`} />
                    {(n === 1 ? img1 : img2) ? (
                      <img src={n === 1 ? img1 : img2} alt={`Imagem ${n}`} className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-nude-400 flex flex-col items-center gap-1">
                        <ImagePlus className="w-5 h-5" />
                        <span className="text-xs">Imagem {n}</span>
                      </div>
                    )}
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <Label>Prompt (opcional)</Label>
                <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="dbg-prompt" />
              </div>
              {err && <div className="mt-2 text-sm text-rose-600">{err}</div>}
              <div className="flex justify-between mt-3">
                <Button variant="outline" onClick={clearAll}>
                  <X className="w-4 h-4 mr-2" /> Limpar
                </Button>
                <Button onClick={runMerge} disabled={loading} className="bg-gold-600 hover:bg-gold-700" data-testid="dbg-go">
                  <Wand2 className="w-4 h-4 mr-2" /> {loading ? "Gerando..." : "Gerar imagem"}
                </Button>
              </div>
              {result && (
                <div className="mt-4 border border-nude-200 rounded-md p-3 bg-white">
                  <img src={result} alt="Resultado" className="w-full rounded-md" />
                  <div className="flex justify-end mt-3">
                    <Button variant="outline" size="sm" onClick={download}>
                      <Download className="w-4 h-4 mr-2" /> Baixar PNG
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
