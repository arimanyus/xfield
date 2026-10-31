import { useState } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Panel, PrimaryButton } from "@/components/admin/kit";

export function AdminLogin({ onIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/login", { method: "POST", body: { password } });
      onIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="mx-auto mt-16 max-w-md">
      <form onSubmit={submit} className="space-y-4" data-testid="admin-login-form">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white"><Lock size={18} /></span>
          <div>
            <h1 className="font-display text-2xl font-bold">Admin sign-in</h1>
            <p className="text-sm text-slate-500">Enter the admin password to manage XField.</p>
          </div>
        </div>
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password" data-testid="admin-password-input" autoFocus />
        {error && <p className="text-sm font-medium text-rose-600" data-testid="admin-login-error">{error}</p>}
        <PrimaryButton type="submit" disabled={busy || !password} className="w-full" testId="admin-login-submit">
          {busy ? "Checking…" : "Sign in"}
        </PrimaryButton>
      </form>
    </Panel>
  );
}
