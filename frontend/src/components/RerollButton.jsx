import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createEpisode, errMsg } from "@/lib/api";

export const RerollButton = ({ ep }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const reroll = async () => {
    setBusy(true);
    try {
      const next = await createEpisode({ handle: ep.handle, found_by: ep.found_by || null, labels: ep.labels, fresh: true });
      navigate(`/ep/${next.id}?fresh=1`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      data-testid="reroll-btn"
      disabled={busy}
      onClick={reroll}
      className="font-osd text-lg text-slate-500 hover:text-tape inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> {busy ? "Searching…" : "Find another episode"}
    </button>
  );
};
