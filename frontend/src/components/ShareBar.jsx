import { useEffect, useRef, useState } from "react";
import { Download, Link2, Share } from "lucide-react";
import { toast } from "sonner";
import { ShareDialog } from "@/components/ShareDialog";
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

const pasteKey = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘V" : "Ctrl+V";

export const ShareBar = ({ ep, onShared }) => {
  const ready = ep.image_status === "ready" && ep.card_url;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [tag, setTag] = useState(Boolean(ep.found_by));
  const png = useRef(null);
  const link = ep.share_url;
  const text = shareText(ep, tag);
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

  const copyCard = async () => {
    const ok = await copyImage(png.current || toPng(ep.card_url));
    setCopied(ok);
    return ok;
  };

  const openX = () => {
    if (!copied) copyCard();
    const w = window.open(xIntentUrl(text, link), "_blank");
    if (w) w.opener = null;
    setOpened(true);
    count("x");
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied. Go cause problems.");
    } catch {
      window.prompt("Copy this link", link);
    }
    count("copy");
  };

  const shareToX = async () => {
    if (!ready) {
      openX();
      return;
    }
    if (isMobile() && navigator.share) {
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
    copyCard();
    setOpened(false);
    setOpen(true);
  };

  return (
    <div className="mt-6" data-testid="share-bar">
      <button
        type="button"
        onClick={shareToX}
        disabled={busy}
        data-testid="share-x-btn"
        className="btn-tape w-full text-2xl sm:text-3xl py-4 inline-flex items-center justify-center gap-3"
      >
        <Share className="w-6 h-6 sm:w-7 sm:h-7" /> {busy ? "Preparing card…" : "Share to X"}
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-osd text-lg text-slate-400">
        <button type="button" onClick={copyLink} data-testid="copy-link-btn" className="inline-flex items-center gap-1.5 hover:text-tape transition-colors">
          <Link2 className="w-4 h-4" /> Copy link
        </button>
        <button type="button" onClick={download} disabled={!ready || busy} data-testid="download-btn" className="inline-flex items-center gap-1.5 hover:text-tape transition-colors disabled:opacity-40">
          <Download className="w-4 h-4" /> {ready ? "Download card" : "Card developing…"}
        </button>
      </div>
      {ready && (
        <ShareDialog
          ep={ep}
          open={open}
          onOpenChange={setOpen}
          copied={copied}
          opened={opened}
          pasteKey={pasteKey}
          tag={tag}
          onTag={setTag}
          onCopy={copyCard}
          onOpenX={openX}
          onDownload={download}
          onCopyLink={copyLink}
        />
      )}
    </div>
  );
};
