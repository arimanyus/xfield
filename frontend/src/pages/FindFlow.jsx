import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LabelConfirm } from "@/components/LabelConfirm";
import { TapsFlow } from "@/components/TapsFlow";
import { StaticScreen } from "@/components/StaticScreen";
import { createEpisode, errMsg, readHandle } from "@/lib/api";

export default function FindFlow() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handle = params.get("handle") || "";
  const by = params.get("by") || "";
  const [spice, setSpice] = useState(params.get("spice") === "savage" ? "savage" : "roast");
  const [step, setStep] = useState("reading");
  const [profile, setProfile] = useState(null);
  const [labels, setLabels] = useState(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!handle) {
      navigate("/");
      return;
    }
    if (started.current) return;
    started.current = true;
    readHandle(handle)
      .then((p) => {
        setProfile(p);
        if (p.found && p.labels) {
          setLabels(p.labels);
          setStep("confirm");
        } else {
          setStep("taps");
        }
      })
      .catch((e) => {
        setError(errMsg(e));
        setStep("error");
      });
  }, [handle, navigate]);

  const generate = async (finalLabels) => {
    setStep("generating");
    try {
      const ep = await createEpisode({ handle, found_by: by || null, spice, labels: finalLabels });
      navigate(`/ep/${ep.id}?fresh=1`, { replace: true });
    } catch (e) {
      setError(errMsg(e));
      setStep("error");
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="find-page">
      <div className="osd mb-4" data-testid="find-status">
        {step === "reading" && `Reading @${handle}…`}
        {step === "confirm" && "Signal locked"}
        {step === "taps" && "Manual tuning"}
        {step === "generating" && "Searching the archive…"}
        {step === "error" && "Signal lost"}
      </div>

      {step === "reading" && (
        <StaticScreen message={`READING @${handle.toUpperCase()}…`} sub="pulling the public posts and the bio" roll={false} />
      )}

      {step === "confirm" && profile && (
        <LabelConfirm profile={profile} labels={labels} setLabels={setLabels} spice={spice} setSpice={setSpice} onConfirm={() => generate(labels)} foundBy={by} />
      )}

      {step === "taps" && <TapsFlow handle={profile?.handle || handle} profile={profile} spice={spice} setSpice={setSpice} onDone={generate} />}

      {step === "generating" && (
        <StaticScreen message="SEARCHING THE ARCHIVE…" sub={`scrubbing 30 seasons for @${handle} · about 10 seconds`} />
      )}

      {step === "error" && (
        <section className="panel p-6" data-testid="find-error">
          <h2 className="font-display text-3xl tracking-wide">The archive hiccuped.</h2>
          <p className="mt-2 text-slate-300">{error}</p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              data-testid="find-retry"
              onClick={() => {
                started.current = false;
                setError("");
                setStep(labels ? "confirm" : "reading");
                if (!labels) {
                  started.current = true;
                  readHandle(handle)
                    .then((p) => {
                      setProfile(p);
                      if (p.found && p.labels) {
                        setLabels(p.labels);
                        setStep("confirm");
                      } else setStep("taps");
                    })
                    .catch((e) => {
                      setError(errMsg(e));
                      setStep("error");
                    });
                }
              }}
              className="btn-tape"
            >
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
