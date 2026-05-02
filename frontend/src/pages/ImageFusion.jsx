import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Combine, Upload, Loader2, Download, X, Sparkles, ImageIcon } from "lucide-react";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function ImagePicker({ value, onChange, label, testidPrefix }) {
  const inputRef = useRef(null);
  return (
    <div className="space-y-2">
      <Label className="text-gold-200">{label}</Label>
      <div
        onClick={() => inputRef.current?.click()}
        className="relative aspect-square rounded-lg border-2 border-dashed border-gold-700/40 bg-nude-900/40 hover:border-gold-500/60 hover:bg-nude-900/60 transition-colors cursor-pointer overflow-hidden grid place-items-center"
        data-testid={`${testidPrefix}-dropzone`}
      >
        {value ? (
          <>
            <img src={value} alt="preview" className="w-full h-full object-cover" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-nude-950/80 grid place-items-center hover:bg-rose-600 transition-colors"
              data-testid={`${testidPrefix}-clear`}
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </>
        ) : (
          <div className="text-center px-6">
            <Upload className="w-8 h-8 text-gold-400/60 mx-auto mb-2" />
            <div className="text-sm text-gold-200/80 font-medium">Clique para enviar</div>
            <div className="text-xs text-nude-500 mt-1">PNG, JPG até 8 MB</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid={`${testidPrefix}-input`}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
              toast.error("Imagem deve ter até 8 MB");
              return;
            }
            const b64 = await fileToBase64(file);
            onChange(b64);
          }}
        />
      </div>
    </div>
  );
}

export default function ImageFusion() {
  const [img1, setImg1] = useState(null);
  const [img2, setImg2] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const fuse = async () => {
    if (!img1 || !img2) {
      toast.error("Envie as duas imagens antes de gerar");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post(
        "/creatives/fuse-images",
        { image1_base64: img1, image2_base64: img2, prompt },
        { timeout: 180000 }
      );
      if (data.ok && data.image) {
        setResult(data.image);
        toast.success("Imagem gerada!");
      } else {
        toast.error(data.error || "Não foi possível gerar a imagem");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar imagem");
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `fusao-espirito-santo-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="h-screen flex flex-col bg-nude-950 overflow-hidden text-gold-50">
      <div className="px-6 py-4 bg-nude-900/60 border-b border-gold-900/40">
        <div className="text-xs tracking-[0.2em] uppercase text-gold-400 font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Estúdio criativo
        </div>
        <h1 className="font-display font-bold text-2xl mt-1 text-gold-100 flex items-center gap-2">
          <Combine className="w-6 h-6 text-gold-400" />
          Fusão de Imagens com IA
        </h1>
        <p className="text-sm text-nude-400 mt-1">
          Envie duas imagens e a IA combina em uma só — usando Gemini Nano Banana.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1fr_1.2fr] gap-5">
          <Card className="p-4 bg-nude-900/60 border-gold-900/40">
            <ImagePicker
              value={img1}
              onChange={setImg1}
              label="Imagem 1"
              testidPrefix="img1"
            />
          </Card>

          <Card className="p-4 bg-nude-900/60 border-gold-900/40">
            <ImagePicker
              value={img2}
              onChange={setImg2}
              label="Imagem 2"
              testidPrefix="img2"
            />
          </Card>

          <Card className="p-4 bg-nude-900/60 border-gold-900/40 flex flex-col">
            <Label className="text-gold-200">Resultado</Label>
            <div className="mt-2 aspect-square rounded-lg bg-nude-950 border border-gold-900/40 grid place-items-center overflow-hidden">
              {loading ? (
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-2" />
                  <div className="text-sm text-gold-200">Gerando fusão... pode levar 20-40s</div>
                </div>
              ) : result ? (
                <img
                  src={result}
                  alt="resultado"
                  className="w-full h-full object-cover"
                  data-testid="fusion-result-img"
                />
              ) : (
                <div className="text-center text-nude-500">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <div className="text-xs">Resultado aparecerá aqui</div>
                </div>
              )}
            </div>
            {result && (
              <Button
                onClick={download}
                variant="outline"
                size="sm"
                className="mt-3 border-gold-700/50 text-gold-200 hover:bg-gold-500/10 hover:text-gold-100"
                data-testid="fusion-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar PNG
              </Button>
            )}
          </Card>
        </div>

        <Card className="max-w-5xl mx-auto p-5 bg-nude-900/60 border-gold-900/40 mt-5">
          <Label className="text-gold-200">Instrução adicional (opcional)</Label>
          <Textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Mescle as duas imagens em estilo dourado elegante, mantendo o rosto da pessoa e o ambiente da segunda imagem"
            data-testid="fusion-prompt"
            className="bg-nude-950 border-gold-900/40 text-gold-100 placeholder:text-nude-600 mt-1.5"
          />
          <div className="flex justify-end mt-4">
            <Button
              onClick={fuse}
              disabled={loading || !img1 || !img2}
              className="bg-gradient-to-r from-gold-500 to-gold-700 hover:from-gold-400 hover:to-gold-600 text-nude-950 font-semibold"
              data-testid="fusion-generate"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar fusão
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
