import { Check, Download, ExternalLink, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const Step = ({ n, done, active, children, testid }) => (
  <li className={`flex items-center gap-4 transition-opacity duration-300 ${active || done ? "opacity-100" : "opacity-50"}`} data-testid={testid}>
    <span
      className={`shrink-0 w-9 h-9 grid place-items-center font-display text-xl tracking-wider transition-colors duration-300 ${
        done ? "bg-emerald-400 text-ink" : active ? "bg-tape text-ink" : "border border-white/20 text-slate-300"
      }`}
    >
      {done ? <Check className="w-5 h-5" strokeWidth={3} /> : n}
    </span>
    <div className="flex-1 min-w-0 flex items-center justify-between gap-3">{children}</div>
  </li>
);

export const ShareDialog = ({ ep, open, onOpenChange, copied, opened, pasteKey, tag, onTag, onCopy, onOpenX, onDownload, onCopyLink }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-ink-2 border-tape/30 p-0 overflow-hidden max-w-4xl w-[calc(100vw-2rem)] rounded-none" data-testid="share-dialog">
      <DialogTitle className="sr-only">Share to X</DialogTitle>
      <div className="grid md:grid-cols-[0.8fr_1fr]">
        <div className="bg-ink p-4 sm:p-6 flex items-center justify-center max-h-[40vh] md:max-h-[80vh]">
          <img src={ep.card_url} alt="Share card" data-testid="share-dialog-card" className="max-h-full w-auto object-contain tape-frame" />
        </div>
        <div className="p-6 sm:p-8 flex flex-col">
          <div className="osd">Share to X</div>
          <button
            type="button"
            role="switch"
            aria-checked={tag}
            onClick={() => onTag(!tag)}
            data-testid="share-tag-toggle"
            className="mt-5 inline-flex items-center gap-3 text-left group"
          >
            <span className={`w-6 h-6 grid place-items-center border transition-colors ${tag ? "bg-tape border-tape text-ink" : "border-white/30 text-transparent group-hover:border-tape"}`}>
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
            <span className="text-lg sm:text-xl text-slate-100">
              Tag <span className="font-osd text-tape">@{ep.handle}</span> in the post
            </span>
          </button>
          <ol className="mt-6 space-y-5">
            <Step n="1" done={copied} active={!copied} testid="share-step-copy">
              <span className="text-lg sm:text-xl text-slate-100">{copied ? "Card copied" : "Copy the card"}</span>
              {!copied && (
                <button type="button" onClick={onCopy} data-testid="share-copy-card-btn" className="btn-ghost text-base px-3 py-1.5">
                  Copy
                </button>
              )}
            </Step>
            <Step n="2" done={opened} active={copied && !opened} testid="share-step-open">
              <span className="text-lg sm:text-xl text-slate-100">Open X</span>
              <button type="button" onClick={onOpenX} data-testid="share-open-x-btn" className="btn-tape text-lg sm:text-xl px-4 py-2 inline-flex items-center gap-2">
                Open X <ExternalLink className="w-4 h-4" />
              </button>
            </Step>
            <Step n="3" active={opened} testid="share-step-paste">
              <span className="text-lg sm:text-xl text-slate-100">
                Paste <kbd className="font-osd text-tape bg-white/10 px-1.5 py-0.5 text-base align-middle">{pasteKey}</kbd> and post
              </span>
            </Step>
          </ol>
          <div className="mt-8 md:mt-auto pt-6 border-t border-white/10 flex flex-wrap gap-x-5 gap-y-2 font-osd text-lg text-slate-400">
            <button type="button" onClick={onDownload} data-testid="share-dialog-download" className="inline-flex items-center gap-1.5 hover:text-tape transition-colors">
              <Download className="w-4 h-4" /> Download card
            </button>
            <button type="button" onClick={onCopyLink} data-testid="share-dialog-copy-link" className="inline-flex items-center gap-1.5 hover:text-tape transition-colors">
              <Link2 className="w-4 h-4" /> Copy link
            </button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
