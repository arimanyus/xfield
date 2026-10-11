import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cleanHandle, HANDLE_RE } from "@/lib/api";

export const HandleForm = ({ className = "", idPrefix = "hero" }) => {
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [friend, setFriend] = useState(false);
  const [you, setYou] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const h = cleanHandle(handle);
    const by = cleanHandle(you);
    if (!HANDLE_RE.test(h)) return toast.error("That's not an X handle.");
    if (friend && !HANDLE_RE.test(by)) return toast.error("Add your own handle too.");
    const q = new URLSearchParams({ handle: h });
    if (friend) q.set("by", by);
    navigate(`/find?${q.toString()}`);
  };

  return (
    <form onSubmit={submit} className={`panel p-4 sm:p-5 ${className}`} data-testid={`${idPrefix}-handle-form`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-osd text-2xl text-tape">@</span>
          <input
            data-testid={`${idPrefix}-handle-input`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={60}
            className="input-tape pl-10"
          />
        </div>
        <button type="submit" data-testid={`${idPrefix}-submit`} className="btn-tape whitespace-nowrap">
          Find the episode
        </button>
      </div>

      {friend && (
        <div className="relative mt-3 animate-rise">
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
      )}

      <button
        type="button"
        data-testid={`${idPrefix}-friend-toggle`}
        onClick={() => setFriend(!friend)}
        className="mt-3 font-osd text-base sm:text-lg text-slate-500 hover:text-tape transition-colors"
      >
        {friend ? "← It's me, actually" : "Roasting a friend? Add your @ →"}
      </button>
    </form>
  );
};
