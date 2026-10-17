import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function useTown() {
  const [town, setTown] = useState(null);
  const [error, setError] = useState(null);
  const version = useRef(null);

  const refresh = useCallback(async (force = false) => {
    try {
      const data = await api(`/town${!force && version.current !== null ? `?v=${version.current}` : ""}`);
      setError(null);
      if (data.unchanged) return null;
      version.current = data.version;
      setTown(data);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const t = setInterval(() => refresh(false), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  return { town, error, refresh };
}
