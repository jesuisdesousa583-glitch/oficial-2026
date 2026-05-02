import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import CRM from "@/pages/CRM";
import Processes from "@/pages/Processes";
import Finance from "@/pages/Finance";
import Creatives from "@/pages/Creatives";
import ImageFusion from "@/pages/ImageFusion";
import Analytics from "@/pages/Analytics";
import WhatsAppSettings from "@/pages/WhatsAppSettings";
import WhatsAppLogs from "@/pages/WhatsAppLogs";
import Agenda from "@/pages/Agenda";
import Onboarding from "@/pages/Onboarding";
import Consulta from "@/pages/Consulta";
import Settings from "@/pages/Settings";
import DebugTool from "@/pages/DebugTool";
import ChatIA from "@/pages/ChatIA";
import AdminCases from "@/pages/AdminCases";
import AppLayout from "@/components/AppLayout";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/consulta" element={<Consulta />} />
            <Route
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/chat-ia" element={<ChatIA />} />
              <Route path="/app/admin" element={<AdminCases />} />
              <Route path="/app/onboarding" element={<Onboarding />} />
              <Route path="/app/agenda" element={<Agenda />} />
              <Route path="/app/crm" element={<CRM />} />
              <Route path="/app/processes" element={<Processes />} />
              <Route path="/app/finance" element={<Finance />} />
              <Route path="/app/creatives" element={<Creatives />} />
              <Route path="/app/image-fusion" element={<ImageFusion />} />
              <Route path="/app/analytics" element={<Analytics />} />
              <Route path="/app/whatsapp" element={<WhatsAppSettings />} />
              <Route path="/app/whatsapp-logs" element={<WhatsAppLogs />} />
              <Route path="/app/settings" element={<Settings />} />
              <Route path="/app/debug" element={<DebugTool />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
