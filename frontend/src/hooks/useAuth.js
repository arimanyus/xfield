import { useCallback, useEffect, useState } from "react";
import { api, signInUrl } from "@/lib/api";

export function useAuth() {
  const [state, setState] = useState({ enabled: false, user: null, ready: false });

  const load = useCallback(async () => {
    try {
      const d = await api("/auth/me");
      setState({ enabled: d.enabled, user: d.user, ready: true });
    } catch {
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const login = (next) => { window.location.href = signInUrl(next); };
  const logout = async () => { await api("/auth/logout", { method: "POST" }); setState((s) => ({ ...s, user: null })); };

  return { ...state, login, logout, reload: load };
}
