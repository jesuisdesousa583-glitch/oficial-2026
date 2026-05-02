import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, KanbanSquare, Scale, Wallet, Sparkles,
  BarChart3, LogOut, MessageSquare, Wrench, Radio,
  CalendarDays, Settings as SettingsIcon, Combine,
  ShieldCheck, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const LOGO_IMG = "https://customer-assets.emergentagent.com/job_nude-gold-dashboard/artifacts/ckw9kwam_IMG-20241228-WA0003.jpg";

const NAV = [
  { to: "/app", label: "Atendimento", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/app/chat-ia", label: "Chat IA · Análise", icon: Bot, testid: "nav-chat-ia" },
  { to: "/app/admin", label: "Painel Admin · Casos", icon: ShieldCheck, testid: "nav-admin" },
  { to: "/app/crm", label: "CRM Pipeline", icon: KanbanSquare, testid: "nav-crm" },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays, testid: "nav-agenda" },
  { to: "/app/processes", label: "Processos", icon: Scale, testid: "nav-processes" },
  { to: "/app/finance", label: "Financeiro", icon: Wallet, testid: "nav-finance" },
  { to: "/app/creatives", label: "Criativos", icon: Sparkles, testid: "nav-creatives" },
  { to: "/app/image-fusion", label: "Fusão de Imagens", icon: Combine, testid: "nav-image-fusion" },
  { to: "/app/analytics", label: "Métricas", icon: BarChart3, testid: "nav-analytics" },
  { to: "/app/whatsapp", label: "WhatsApp", icon: MessageSquare, testid: "nav-whatsapp" },
  { to: "/app/whatsapp-logs", label: "Logs WhatsApp", icon: Radio, testid: "nav-whatsapp-logs" },
  { to: "/app/settings", label: "Configurações", icon: SettingsIcon, testid: "nav-settings" },
  { to: "/app/debug", label: "Debug Tool", icon: Wrench, testid: "nav-debug" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = (user?.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background flex" data-testid="app-layout">
      {/* Sidebar — nude/gold executive */}
      <aside
        className="w-64 bg-card border-r border-nude-200 flex flex-col relative"
        data-testid="app-sidebar"
      >
        <div className="px-6 py-6 border-b border-nude-200">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_IMG}
              alt="Kênia Garcia Advocacia"
              className="w-11 h-11 rounded-md object-cover shadow-sm shadow-gold-700/20 ring-1 ring-gold-300/40"
              data-testid="sidebar-logo"
            />
            <div>
              <div className="font-serif text-xl leading-none text-nude-900 tracking-tight">
                Kênia Garcia
              </div>
              <div className="overline mt-1.5 text-gold-600">Advocacia · IA</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testid}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-all duration-200 ${
                  isActive
                    ? "bg-gold-50 text-gold-700 font-medium nav-active-accent"
                    : "text-nude-600 hover:bg-nude-100 hover:text-nude-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`w-4 h-4 ${isActive ? "text-gold-500" : "text-nude-500"}`}
                    strokeWidth={1.6}
                  />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-nude-200">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="w-9 h-9 ring-1 ring-gold-300/60">
              <AvatarFallback className="bg-gold-100 text-gold-700 text-xs font-semibold font-sans">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-nude-900 truncate" data-testid="user-name">
                {user?.name}
              </div>
              <div className="text-xs text-nude-500 truncate">{user?.email}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-nude-600 hover:text-nude-900 hover:bg-nude-100 mt-1"
            onClick={handleLogout}
            data-testid="logout-btn"
          >
            <LogOut className="w-4 h-4 mr-2" strokeWidth={1.6} />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
