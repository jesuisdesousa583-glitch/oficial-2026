import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Key, MessageSquare, Image, Loader2, CheckCircle2,
  XCircle, Sparkles, Save, Info, Eye, EyeOff,
} from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [textKey, setTextKey] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [showText, setShowText] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingText, setTestingText] = useState(false);
  const [testingImage, setTestingImage] = useState(false);
  const [textResult, setTextResult] = useState(null);
  const [imageResult, setImageResult] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const { data } = await api.get("/settings");
      setSettings(data);
    } catch {
      toast.error("Erro ao carregar configurações");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (textKey.trim()) payload.llm_text_key = textKey.trim();
      if (imageKey.trim()) payload.llm_image_key = imageKey.trim();
      await api.put("/settings", payload);
      toast.success("Chaves salvas");
      setTextKey("");
      setImageKey("");
      await load();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async (kind) => {
    try {
      const payload = kind === "text" ? { llm_text_key: "" } : { llm_image_key: "" };
      await api.put("/settings", payload);
      toast.success("Usando chave padrão (Emergent)");
      await load();
    } catch {
      toast.error("Erro");
    }
  };

  const testText = async () => {
    setTestingText(true);
    setTextResult(null);
    try {
      const { data } = await api.post("/settings/test-text");
      setTextResult(data);
      if (data.ok) toast.success("Chat funcionando");
      else toast.error("Chave não funcional");
    } catch {
      toast.error("Erro no teste");
    } finally {
      setTestingText(false);
    }
  };

  const testImage = async () => {
    setTestingImage(true);
    setImageResult(null);
    try {
      const { data } = await api.post("/settings/test-image");
      setImageResult(data);
      if (data.ok) toast.success("Geração de imagem funcionando");
      else toast.error("Chave não funcional");
    } catch {
      toast.error("Erro no teste");
    } finally {
      setTestingImage(false);
    }
  };

  if (!settings) return <div className="p-12 text-nude-400">Carregando...</div>;

  return (
    <div className="h-screen flex flex-col bg-nude-50 overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-nude-200 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-widest uppercase text-gold-600 font-semibold">Configurações</div>
          <h1 className="font-display font-bold text-2xl">API Keys & Integrações</h1>
        </div>
        <Button onClick={save} disabled={saving || (!textKey.trim() && !imageKey.trim())} className="bg-nude-900 hover:bg-nude-800" data-testid="settings-save">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-2" />Salvar chaves</>}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4 max-w-4xl">
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-nude-700">
              <div className="font-medium mb-1">Sobre as chaves</div>
              <div className="text-xs">
                Por padrão, usamos a <strong>Emergent Universal Key</strong> que já vem configurada e funciona para chat (GPT-4o-mini) e imagens (gpt-image-1). Se você tiver uma chave OpenAI própria, pode substituir aqui para usar créditos próprios.
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-nude-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-4 h-4 text-gold-600" />
                <h3 className="font-display font-semibold text-base">Chat & Robô Kênia</h3>
              </div>
              <p className="text-sm text-nude-500">
                Chave usada para: atendente Kênia Garcia no WhatsApp, copiloto jurídico, classificação automática de leads.
              </p>
            </div>
            <Badge className={settings.using_default_text ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-gold-100 text-gold-800 hover:bg-gold-100"}>
              {settings.using_default_text ? "Emergent padrão" : "Chave personalizada"}
            </Badge>
          </div>
          {!settings.using_default_text && (
            <div className="text-xs text-nude-500 mb-3 font-mono bg-nude-50 px-3 py-2 rounded-md inline-block">
              {settings.llm_text_key_masked}
              <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => resetToDefault("text")}>Voltar ao padrão</Button>
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={showText ? "text" : "password"}
                placeholder="Cole aqui sua chave Emergent ou OpenAI (sk-...)"
                value={textKey}
                onChange={(e) => setTextKey(e.target.value)}
                className="pr-10 font-mono text-xs h-10"
                data-testid="text-key-input"
              />
              <button type="button" onClick={() => setShowText(!showText)} className="absolute right-3 top-1/2 -translate-y-1/2 text-nude-400 hover:text-nude-600">
                {showText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button variant="outline" onClick={testText} disabled={testingText} data-testid="test-text-btn">
              {testingText ? <Loader2 className="w-4 h-4 animate-spin" /> : "Testar"}
            </Button>
          </div>
          {textResult && (
            <div className={`mt-3 text-sm flex items-center gap-2 ${textResult.ok ? "text-gold-700" : "text-rose-700"}`}>
              {textResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {textResult.ok ? (
                <>Funcionando! {textResult.using_custom_key ? "Chave personalizada" : "Emergent padrão"}.</>
              ) : (
                <>Erro: {textResult.error}</>
              )}
            </div>
          )}
        </Card>

        <Card className="border-nude-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Image className="w-4 h-4 text-purple-600" />
                <h3 className="font-display font-semibold text-base">Geração de Imagens (Criativos)</h3>
              </div>
              <p className="text-sm text-nude-500">
                Chave usada para gerar imagens no módulo <strong>Criativos</strong> usando OpenAI <code className="text-xs bg-nude-100 px-1 rounded">gpt-image-1</code>.
              </p>
            </div>
            <Badge className={settings.using_default_image ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-gold-100 text-gold-800 hover:bg-gold-100"}>
              {settings.using_default_image ? "Emergent padrão" : "Chave personalizada"}
            </Badge>
          </div>
          {!settings.using_default_image && (
            <div className="text-xs text-nude-500 mb-3 font-mono bg-nude-50 px-3 py-2 rounded-md inline-block">
              {settings.llm_image_key_masked}
              <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => resetToDefault("image")}>Voltar ao padrão</Button>
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={showImage ? "text" : "password"}
                placeholder="Cole aqui sua chave Emergent ou OpenAI (sk-...)"
                value={imageKey}
                onChange={(e) => setImageKey(e.target.value)}
                className="pr-10 font-mono text-xs h-10"
                data-testid="image-key-input"
              />
              <button type="button" onClick={() => setShowImage(!showImage)} className="absolute right-3 top-1/2 -translate-y-1/2 text-nude-400 hover:text-nude-600">
                {showImage ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button variant="outline" onClick={testImage} disabled={testingImage} data-testid="test-image-btn">
              {testingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Testar"}
            </Button>
          </div>
          {imageResult && (
            <div className={`mt-3 text-sm flex items-center gap-2 ${imageResult.ok ? "text-gold-700" : "text-rose-700"}`}>
              {imageResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {imageResult.ok ? (
                <>Funcionando! Modelo {imageResult.model}. {imageResult.using_custom_key ? "Chave personalizada" : "Emergent padrão"}.</>
              ) : (
                <>Erro: {imageResult.error}</>
              )}
            </div>
          )}
        </Card>

        <Separator />

        <Card className="border-nude-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-gold-600" />
            <h3 className="font-display font-semibold text-base">Persona do robô WhatsApp</h3>
          </div>
          <p className="text-sm text-nude-500 mb-3">
            O atendente virtual se apresenta como <strong>Kênia Garcia</strong> e nunca revela ser IA. Para editar o prompt, acesse <a href="/app/whatsapp" className="text-gold-600 hover:underline">WhatsApp → Robô Atendente IA</a>.
          </p>
          <div className="text-xs space-y-1 text-nude-600">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-gold-600" /> Se apresenta como Kênia Garcia</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-gold-600" /> Nunca diz que é robô/IA</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-gold-600" /> Detecta estilo do cliente (visual/auditivo/cinestésico)</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-gold-600" /> Adapta linguagem automaticamente</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-gold-600" /> Classifica área + urgência + score de cada lead</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
