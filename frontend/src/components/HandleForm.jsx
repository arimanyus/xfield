import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SpiceToggle } from "@/components/SpiceToggle";
import { cleanHandle, HANDLE_RE } from "@/lib/api";

export const HandleForm = ({ initialHandle = "", initialMode = "me", lockHandle = false, className = "", idPrefix = "hero" }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode);
  const [handle, setHandle] = useState(initialHandle);
  const [you, setYou] = useState("");
  const [spice, setSpice] = useState("savage");

  const submit = (e) => {
    e.preventDefault();
    const h = cleanHandle(handle);
    const by = cleanHandle(you);
    if (!HANDLE_RE.test(h)) return toast.error("Enter a real X handle: letters, numbers, underscore, max 15.");
    if (mode === "friend" && !HANDLE_RE.test(by)) return toast.error("Add your own handle so the card credits you.");
    const q = new URLSearchParams({ handle: h, spice });
    if (mode === "friend") q.set("by", by);
    navigate(`/find?${q.toString()}`);
  };

  return (
    <form onSubmit={submit} className={`panel p-4 sm:p-5 ${className}`} data-testid={`${idPrefix}-handle-form`}>
      <div className="flex gap-1 mb-4 font-osd text-lg uppercase tracking-wider" role="tablist">
        {[
          ["me", "It's me"],
          ["friend", "It's a friend"],
        ].map(([k, label]) => (
          <button
            type="button"
            key={k}
            role="tab"
            aria-selected={mode === k}
            data-testid={`${idPrefix}-mode-${k}`}
            onClick={() => setMode(k)}
            className={`px-3 py-1 border-b-2 transition-colors ${mode === k ? "border-tape text-tape" : "border-transparent text-slate-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="osd text-sm">{mode === "friend" ? "Their X handle" : "Your X handle"}</span>
        <div className="relative mt-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-osd text-2xl text-tape">@</span>
          <input
            data-testid={`${idPrefix}-handle-input`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            readOnly={lockHandle}
            placeholder={mode === "friend" ? "their_handle" : "your_handle"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={60}
            className="input-tape pl-10"
          />
        </div>
      </label>

      {mode === "friend" && (
        <label className="block mt-3 animate-rise">
          <span className="osd text-sm">Your handle (for the credit)</span>
          <div className="relative mt-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-osd text-2xl text-slate-400">@</span>
            <input
              data-testid={`${idPrefix}-your-handle-input`}
              value={you}
              onChange={(e) => setYou(e.target.value)}
              placeholder="you"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={60}
              className="input-tape pl-10"
            />
          </div>
        </label>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <SpiceToggle value={spice} onChange={setSpice} />
        <button type="submit" data-testid={`${idPrefix}-submit`} className="btn-tape sm:ml-auto">
          {mode === "friend" ? "Find their episode" : "Find my episode"}
        </button>
      </div>
    </form>
  );
};
