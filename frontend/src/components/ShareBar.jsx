import { useEffect, useRef, useState } from "react";
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

const toPng = async (url) => {
  const bmp = await createImageBitmap(await fetch(url).then((r) => r.blob()));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((res) => canvas.toBlob(res, "image/png"));
};

const copyImage = async (pngPromise) => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
    return true;
  } catch {
    return false;
  }
};

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || "");

export const ShareBar = ({ ep, onShared }) => {
  const ready = ep.image_status === "ready" && ep.card_url;
  const [busy, setBusy] = useState(false);
  const png = useRef(null);
  const link = ep.share_url;
  const fileName = `the-simpsons-predicted-${ep.handle}-${seCode(ep)}.jpg`;

  useEffect(() => {
    if (ready && !isMobile()) png.current = toPng(ep.card_url).catch(() => null);
  }, [ready, ep.card_url]);

  const count = async (channel) => {
    try {
      const r = await trackShare(ep.id, channel);
      onShared?.(r.shares);
    } catch {
      /* counting is best-effort */
    }
  };

  const openComposer = (text) => {
    const w = window.open(xIntentUrl(text, link), "_blank");
    if (w) w.opener = null;
    else toast.message("Open the post", { action: { label: "Open X", onClick: () => window.open(xIntentUrl(text, link), "_blank") } });
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
    if (ready) {
      const copied = await copyImage(png.current || toPng(ep.card_url));
      openComposer(text);
      if (copied) {
        toast.success(`Card copied. Paste it into the post (${isMac() ? "⌘V" : "Ctrl+V"}).`, { duration: 8000 });
      } else {
        try {
          saveBlob(await fetchFile(ep.card_url, fileName));
          toast.success("Card saved. Attach it to the post.", { duration: 8000 });
        } catch {
          toast.message("Post opened. Attach the card.");
        }
      }
    } else {
      openComposer(text);
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
      {ready && (
        <a href={ep.card_url} target="_blank" rel="noopener noreferrer" data-testid="share-card-preview" className="inline-flex items-center gap-1 mt-2 font-osd text-base text-slate-500 hover:text-tape">
          Preview card <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};
