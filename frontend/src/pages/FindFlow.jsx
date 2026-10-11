import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TapsFlow } from "@/components/TapsFlow";
import { StaticScreen } from "@/components/StaticScreen";
import { createEpisode, errMsg, readHandle } from "@/lib/api";

export default function FindFlow() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handle = params.get("handle") || "";
  const by = params.get("by") || "";
  const [step, setStep] = useState("reading");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  const generate = async (labels) => {
    setStep("generating");
    try {
      const ep = await createEpisode({ handle, found_by: by || null, labels });
      navigate(`/ep/${ep.id}?fresh=1`, { replace: true });
    } catch (e) {
      setError(errMsg(e));
      setStep("error");
    }
  };

  const start = () => {
    setError("");
    setStep("reading");
    readHandle(handle)
      .then((p) => {
        if (p.existing_episode_id) {
          navigate(`/ep/${p.existing_episode_id}`, { replace: true });
          return;
        }
        setProfile(p);
        if (p.found && p.labels) generate(p.labels);
        else setStep("taps");
      })
      .catch((e) => {
        setError(errMsg(e));
        setStep("error");
      });
  };

  useEffect(() => {
    if (!handle) {
      navigate("/");
      return;
    }
    if (started.current) return;
    started.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, navigate]);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="find-page">
      <div className="osd mb-4" data-testid="find-status">
        {step === "reading" && `Reading @${handle}…`}
        {step === "taps" && "Manual tuning"}
        {step === "generating" && "Searching the archive…"}
        {step === "error" && "Signal lost"}
      </div>

      {step === "reading" && <StaticScreen message={`READING @${handle.toUpperCase()}…`} roll={false} />}

      {step === "taps" && <TapsFlow handle={profile?.handle || handle} profile={profile} onDone={generate} />}

      {step === "generating" && <StaticScreen message="OPENING THE SPRINGFIELD ARCHIVE…" />}

      {step === "error" && (
        <section className="panel p-6" data-testid="find-error">
          <h2 className="font-display text-3xl tracking-wide">The archive hiccuped.</h2>
          <p className="mt-2 text-slate-300">{error}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" data-testid="find-retry" onClick={start} className="btn-tape">
              Try again
            </button>
            <Link to="/" data-testid="find-home" className="btn-ghost">
              Start over
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
