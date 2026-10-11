import { useState } from "react";
import { Download, ExternalLink, Link2, Share } from "lucide-react";
import { toast } from "sonner";
import { isMobile, seCode, shareText, trackShare, xIntentUrl } from "@/lib/api";

const fetchFile = async (url, name) => {
  const blob = await fetch(url).then((r) => r.blob());
  return new File([blob], name, { type: "image/jpeg" });
};

const saveBlob = (file) => {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const ShareBar = ({ ep, onShared }) => {
  const ready = ep.image_status === "ready" && ep.card_url;
  const [busy, setBusy] = useState(false);
  const link = ep.share_url;
  const fileName = `the-simpsons-predicted-${ep.handle}-${seCode(ep)}.jpg`;

  const count = async (channel) => {
    try {
      const r = await trackShare(ep.id, channel);
      onShared?.(r.shares);
    } catch {
      /* counting is best-effort */
    }
  };

  const shareToX = async () => {
    const text = shareText(ep);
    if (ready && isMobile() && navigator.share) {
      setBusy(true);
      try {
        const file = await fetchFile(ep.card_url, fileName);
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text} ${link}` });
          count("x");
          return;
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
      } finally {
        setBusy(false);
      }
    }
    window.open(xIntentUrl(text, link), "_blank", "noopener");
    if (ready) {
      try {
        saveBlob(await fetchFile(ep.card_url, fileName));
        toast.success("Card saved — drop it into the post. The link unfurls into the still too.");
      } catch {
        toast.message("Post opened. Download the card and attach it.");
      }
    }
    count("x");
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
      saveBlob(await fetchFile(ep.card_url, fileName));
      count("download");
    } catch {
      toast.error("Could not download the card yet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5" data-testid="share-bar">
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <button type="button" onClick={shareToX} disabled={busy} data-testid="share-x-btn" className="btn-tape inline-flex items-center gap-2 flex-1 sm:flex-none justify-center">
          <Share className="w-5 h-5" /> {busy ? "Preparing card…" : "Share to X"}
        </button>
        <button type="button" onClick={copy} data-testid="copy-link-btn" className="btn-ghost inline-flex items-center gap-2">
          <Link2 className="w-5 h-5" /> Copy link
        </button>
        <button type="button" onClick={download} disabled={!ready || busy} data-testid="download-btn" className="btn-ghost inline-flex items-center gap-2 disabled:opacity-40">
          <Download className="w-5 h-5" /> {ready ? "Download card" : "Card developing…"}
        </button>
      </div>
      <p className="font-osd text-slate-500 text-base mt-2" data-testid="share-hint">
        {ready ? (
          <>
            The share card is an image with the still and all three prophecies — on a phone it goes straight into the post.{" "}
            <a href={ep.card_url} target="_blank" rel="noopener noreferrer" data-testid="share-card-preview" className="text-tape hover:underline inline-flex items-center gap-1">
              Preview card <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        ) : ep.image_status === "failed" ? (
          "The still could not be recovered; the link still unfurls with the episode text."
        ) : (
          "Share now and the picture will be in the preview by the time anyone taps it."
        )}
      </p>
    </div>
  );
};
