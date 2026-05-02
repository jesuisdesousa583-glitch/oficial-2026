import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Gem, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const HERO_IMG =
  "https://customer-assets.emergentagent.com/job_nude-gold-dashboard/artifacts/3q8ey4x2_5.IMG_8848.jpg";
const LOGO_IMG =
  "https://customer-assets.emergentagent.com/job_nude-gold-dashboard/artifacts/ckw9kwam_IMG-20241228-WA0003.jpg";

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState({
    email: "demo@espirito-santo.com.br",
    password: "demo123",
  });
  const [regData, setRegData] = useState({ name: "", email: "", password: "", oab: "" });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginData.email, loginData.password);
      try { await api.post("/seed/demo"); } catch {}
      toast.success("Bem-vinda de volta");
      const done = localStorage.getItem("onboarding_done");
      navigate(done ? "/app" : "/app/onboarding");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao entrar");
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.name || !regData.email || regData.password.length < 6) {
      toast.error("Preencha nome, e-mail e senha (mín. 6 caracteres)"); return;
    }
    setLoading(true);
    try {
      await register(regData);
      toast.success("Conta criada. Vamos configurar seu escritório.");
      navigate("/app/onboarding");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro no cadastro");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="login-page">
      {/* Hero — editorial split */}
      <div
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        data-testid="login-hero"
      >
        <img
          src={HERO_IMG}
          alt="Escritório de advocacia"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-nude-900/80 via-nude-900/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-nude-900 via-transparent to-transparent" />

        <div className="relative z-10 w-full p-12 flex flex-col justify-between text-nude-50">
          <Link to="/" className="flex items-center gap-4" data-testid="login-logo-desktop">
            <img
              src={LOGO_IMG}
              alt="Kênia Garcia Advocacia"
              className="w-14 h-14 rounded-md object-cover shadow-md shadow-gold-900/30 ring-1 ring-gold-300/40"
            />
            <div>
              <div className="font-serif text-2xl leading-none tracking-tight">
                Kênia Garcia
              </div>
              <div className="overline text-gold-300 mt-1.5">Advocacia · IA</div>
            </div>
          </Link>

          <div className="max-w-lg animate-fade-up">
            <div className="overline text-gold-300 mb-5">Estúdio Jurídico Inteligente</div>
            <h2 className="font-serif text-5xl leading-[1.05] tracking-tight text-nude-50">
              Onde a <em className="text-gold-300 not-italic">tradição</em> encontra a
              <br />
              <span className="italic text-gold-200">inteligência</span>.
            </h2>
            <div className="gold-divider my-8" />
            <p className="font-serif italic text-lg text-nude-100/90 leading-relaxed">
              "Mas recebereis poder, ao descer sobre vós o Espírito Santo."
            </p>
            <p className="overline text-gold-300 mt-3">Atos 1:8</p>
          </div>

          <div className="overline text-nude-200/60">© 2026 Kênia Garcia Advocacia</div>
        </div>
      </div>

      {/* Form side — cream paper */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 paper-grain">
        <div className="w-full max-w-md animate-fade-up">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <img
              src={LOGO_IMG}
              alt="Kênia Garcia Advocacia"
              className="w-12 h-12 rounded-md object-cover ring-1 ring-gold-300/40"
              data-testid="login-logo-mobile"
            />
            <span className="font-serif text-2xl text-nude-900">Kênia Garcia</span>
          </div>

          <div className="mb-8">
            <div className="overline text-gold-600 mb-3">Acesso ao painel</div>
            <h1 className="font-serif text-4xl text-nude-900 leading-tight">
              Boa volta<span className="text-gold-500">.</span>
            </h1>
            <p className="text-sm text-nude-500 mt-2 font-sans-body">
              Seu estúdio jurídico inteligente te aguarda.
            </p>
          </div>

          <Card className="p-8 border-nude-200 shadow-sm shadow-nude-900/5 bg-card">
            <Tabs defaultValue="login">
              <TabsList
                className="grid w-full grid-cols-2 bg-nude-100 border border-nude-200"
                data-testid="auth-tabs"
              >
                <TabsTrigger
                  value="login"
                  data-testid="tab-login"
                  className="data-[state=active]:bg-card data-[state=active]:text-gold-600 data-[state=active]:shadow-sm text-nude-600 font-medium"
                >
                  Entrar
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  data-testid="tab-register"
                  className="data-[state=active]:bg-card data-[state=active]:text-gold-600 data-[state=active]:shadow-sm text-nude-600 font-medium"
                >
                  Criar conta
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      E-mail
                    </Label>
                    <Input
                      type="email"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      data-testid="login-email"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      Senha
                    </Label>
                    <Input
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      data-testid="login-password"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-medium shadow-sm shadow-gold-900/10 transition-all"
                    data-testid="login-submit"
                  >
                    {loading ? "Entrando..." : "Acessar painel"}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                  <p className="text-xs text-nude-500 text-center font-sans-body">
                    Conta demo: <span className="text-gold-700 font-medium">demo@espirito-santo.com.br</span>
                    {" / "}
                    <span className="text-gold-700 font-medium">demo123</span>
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-6">
                <form onSubmit={handleRegister} className="space-y-5" data-testid="register-form">
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      Nome completo
                    </Label>
                    <Input
                      value={regData.name}
                      onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                      data-testid="register-name"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      E-mail
                    </Label>
                    <Input
                      type="email"
                      value={regData.email}
                      onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                      data-testid="register-email"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      OAB (opcional)
                    </Label>
                    <Input
                      placeholder="Ex: 123456/SP"
                      value={regData.oab}
                      onChange={(e) => setRegData({ ...regData, oab: e.target.value })}
                      data-testid="register-oab"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <div>
                    <Label className="text-nude-700 font-medium text-xs tracking-wider uppercase">
                      Senha
                    </Label>
                    <Input
                      type="password"
                      value={regData.password}
                      onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                      data-testid="register-password"
                      className="mt-1.5 h-11 bg-card border-nude-200 focus-visible:ring-gold-400"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-medium shadow-sm transition-all"
                    data-testid="register-submit"
                  >
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
