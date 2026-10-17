import { useCallback, useRef, useState } from "react";
import { api, cleanHandle } from "@/lib/api";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ERRORS = {
  not_found: (h) => `There's no X account called @${h}.`,
  protected: (h) => `@${h} is private, so they can't move in.`,
  blocked: () => "That one can't move into Springfield.",
  traffic: () => "The movers are stuck in traffic. Try again in a minute.",
  failed: () => "Something broke on the way. Try again.",
};

export function useMoveIn(onDone) {
  const [job, setJob] = useState(null);
  const busy = useRef(false);

  const start = useCallback(async (raw, by) => {
    const handle = cleanHandle(raw);
    if (!handle || busy.current) return;
    busy.current = true;
    setJob({ handle, state: "queued" });
    try {
      let j = await api("/move-in", { method: "POST", body: { handle, by: by || null } });
      setJob(j);
      for (let i = 0; i < 150 && !["done", "error"].includes(j.state); i++) {
        await sleep(1500);
        j = await api(`/move-in/${encodeURIComponent(j.handle)}`);
        setJob(j);
      }
      if (j.state === "error") {
        setJob({ ...j, message: (ERRORS[j.code] || ERRORS.failed)(j.handle) });
      } else if (j.state === "done") {
        setJob(null);
        await onDone(j.handle, j.code === "already");
      }
    } catch (e) {
      setJob({ handle, state: "error", message: e.message });
    } finally {
      busy.current = false;
    }
  }, [onDone]);

  return { job, start, reset: () => setJob(null) };
}
