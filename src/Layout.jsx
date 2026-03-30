import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import { LogOut, Home, MessageSquare, Users, BarChart3, HelpCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { WorkflowProvider } from "./components/WorkflowContext";
import { Toaster } from "@/components/ui/sonner";

const NAV_ITEMS = [
  { key: "Home", label: "Home", icon: Home },
  { key: "InteractionsReasoning", label: "Interactions", icon: BarChart3 },
  { key: "MaybeLeads", label: "Maybe", icon: HelpCircle },
  { key: "SendMessage", label: "Leads", icon: MessageSquare },
  { key: "ClientDatabase", label: "Database", icon: Users },
];

export default function Layout({ children, currentPageName }) {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <WorkflowProvider>
      <div className="min-h-screen premium-gradient relative">
        {/* Ambient background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[30%] -right-[15%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-emerald-50/50 to-transparent blur-3xl" />
          <div className="absolute -bottom-[20%] -left-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-amber-50/40 to-transparent blur-3xl" />
        </div>

        {/* Top bar */}
        <header className="sticky top-0 z-50 w-full">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_68f11e15150826cffc22f69c/d719759d4_Actuals.png"
                alt="Actuals"
                className="h-7 object-contain"
              />

              {/* Logout */}
              <button
                onClick={logout}
                className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors duration-200 px-3 py-1.5 rounded-lg hover:bg-black/[0.04]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Uitloggen</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="relative z-10 pb-28">
          {children}
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 inset-x-0 z-50">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-[env(safe-area-inset-bottom)]">
            <div className="mb-4 glass-card-elevated rounded-2xl px-2 py-1.5">
              <div className="flex items-center justify-around">
                {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
                  const href = createPageUrl(key);
                  const isActive = location.pathname === href || (key === "Home" && location.pathname === "/");

                  return (
                    <Link
                      key={key}
                      to={href}
                      className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all duration-200 min-w-[64px] ${
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.04]"
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        <Toaster position="top-center" />
      </div>
    </WorkflowProvider>
  );
}
