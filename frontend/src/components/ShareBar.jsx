import { useState } from "react";
import { Download, Link2, Share } from "lucide-react";
import { toast } from "sonner";
import { seCode, shareText, trackShare, xIntentUrl } from "@/lib/api";

export const ShareBar = ({ ep, onShared }) => {
  const ready = ep.image_status === "ready" && ep.image_url;
  const [busy, setBusy] = useState(false);
  const link = ep.share_url;

  const count = async (channel) => {
    try {
      const r = await trackShare(ep.id, channel);
      onShared?.(r.shares);
    } catch {
      /* counting is best-effort */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied. Go cause problems.");
    } catch {
      window.prompt("Copy this link", link);
    }
    count("copy");
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await fetch(ep.image_url).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `already-aired-${ep.handle}-${seCode(ep)}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      count("download");
    } catch {
      toast.error("Could not download the still yet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 flex flex-wrap gap-2 sm:gap-3" data-testid="share-bar">
      <a
        href={xIntentUrl(shareText(ep), link)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="share-x-btn"
        onClick={() => count("x")}
        className="btn-tape inline-flex items-center gap-2 flex-1 sm:flex-none justify-center"
      >
        <Share className="w-5 h-5" /> Share to X
      </a>
      <button type="button" onClick={copy} data-testid="copy-link-btn" className="btn-ghost inline-flex items-center gap-2">
        <Link2 className="w-5 h-5" /> Copy link
      </button>
      <button type="button" onClick={download} disabled={!ready || busy} data-testid="download-btn" className="btn-ghost inline-flex items-center gap-2 disabled:opacity-40">
        <Download className="w-5 h-5" /> {ready ? "Download" : "Still developing…"}
      </button>
      {!ready && ep.image_status !== "failed" && (
        <p className="w-full font-osd text-slate-500 text-base" data-testid="share-hint">
          Share now and the picture will be in the preview by the time anyone taps it.
        </p>
      )}
    </div>
  );
};
