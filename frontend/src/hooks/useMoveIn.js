import { useCallback, useRef, useState } from "react";
import { api, cleanHandle } from "@/lib/api";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ERRORS = {
  not_found: (h) => `There's no X account called @${h}.`,
  protected: (h) => `@${h} is private, so they can't move in.`,
  blocked: () => "That one can't move into XField.",
  traffic: () => "The movers are stuck in traffic. Try again in a minute.",
  full: () => "XField is full. Every spot is taken.",
  failed: () => "Something broke on the way. Try again.",
};

export function useMoveIn(onDone) {
  const [job, setJob] = useState(null);
  const busy = useRef(false);

  const follow = useCallback(async (first) => {
    let j = first;
    setJob(j);
    for (let i = 0; i < 150 && !["done", "error"].includes(j.state); i++) {
      await sleep(1500);
      j = await api(`/move-in/${encodeURIComponent(j.handle)}`);
      setJob(j);
    }
    if (j.state === "error") setJob({ ...j, message: (ERRORS[j.code] || ERRORS.failed)(j.handle) });
    else if (j.state === "done") {
      setJob(null);
      await onDone(j.handle, j.code);
    }
  }, [onDone]);

  const run = useCallback(async (handle, firstCall) => {
    if (!handle || busy.current) return;
    busy.current = true;
    setJob({ handle, state: "queued" });
    try {
      await follow(await firstCall());
    } catch (e) {
      setJob(null);
      if (e.status === 404) await onDone(handle, "view");
      else setJob({ handle, state: "error", message: e.message });
    } finally {
      busy.current = false;
    }
  }, [follow]);

  const start = useCallback((raw) => {
    const handle = cleanHandle(raw);
    return run(handle, () => api("/move-in", { method: "POST", body: { handle } }));
  }, [run]);

  const watch = useCallback((handle) => run(handle, () => api(`/move-in/${encodeURIComponent(handle)}`)), [run]);

  return { job, start, watch, fail: (message) => setJob({ state: "error", message }), reset: () => setJob(null) };
}
