import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { StatsPanel } from "@/components/admin/StatsPanel";
import { BillboardsPanel } from "@/components/admin/BillboardsPanel";
import { ResidentsPanel } from "@/components/admin/ResidentsPanel";
import { PaperPanel } from "@/components/admin/PaperPanel";
import { LimitsPanel } from "@/components/admin/LimitsPanel";

const TABS = [["stats", "Live stats"], ["billboards", "Billboards"], ["residents", "Residents"], ["paper", "The Ledger"], ["limits", "City limits"]];

export default function AdminPage() {
  const [state, setState] = useState("checking");
  const check = useCallback(() => api("/admin/me").then(() => setState("in")).catch(() => setState("out")), []);
  useEffect(() => { check(); }, [check]);
  const logout = () => api("/admin/logout", { method: "POST" }).finally(() => setState("out"));

  return (
    <div className="relative z-10 min-h-screen bg-slate-50/95 font-body text-ink" data-testid="admin-page">
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="/" className="flex items-center gap-2" data-testid="admin-home-link">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-xl font-bold tracking-tight">XFIELD <span className="text-slate-400">admin</span></span>
          </a>
          {state === "in" && (
            <button type="button" onClick={logout} data-testid="admin-logout-button"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-slate-200">Log out</button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        {state === "checking" && <div className="text-slate-500" data-testid="admin-checking">Checking…</div>}
        {state === "out" && <AdminLogin onIn={() => setState("in")} />}
        {state === "in" && (
          <Tabs defaultValue="stats">
            <TabsList className="mb-6 h-auto flex-wrap justify-start gap-1 bg-white p-1 shadow-sm" data-testid="admin-tabs">
              {TABS.map(([id, label]) => (
                <TabsTrigger key={id} value={id} data-testid={`admin-tab-${id}`}
                  className="rounded-md px-4 py-2 font-semibold data-[state=active]:bg-ink data-[state=active]:text-white">{label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="stats"><StatsPanel /></TabsContent>
            <TabsContent value="billboards"><BillboardsPanel /></TabsContent>
            <TabsContent value="residents"><ResidentsPanel /></TabsContent>
            <TabsContent value="paper"><PaperPanel /></TabsContent>
            <TabsContent value="limits"><LimitsPanel /></TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
