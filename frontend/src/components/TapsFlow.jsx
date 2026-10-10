import { useState } from "react";
import { ChipPicker } from "@/components/ChipPicker";
import { SpiceToggle } from "@/components/SpiceToggle";
import { CHIPS, CHIP_KEYS } from "@/lib/chips";

export const TapsFlow = ({ handle, profile, spice, setSpice, onDone }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const key = CHIP_KEYS[step];
  const reason = profile?.protected ? "That account is protected, so nothing could be read." : "Nothing could be read from that account right now.";

  const pick = (v) => {
    const next = { ...answers, [key]: v };
    setAnswers(next);
    if (step < 2) setStep(step + 1);
    else onDone(next);
  };

  return (
    <section className="panel p-5 sm:p-7 animate-tv-on" data-testid="taps-screen">
      <div className="osd text-sm">No signal · @{handle}</div>
      <p className="mt-2 text-slate-300 text-sm sm:text-base" data-testid="taps-reason">
        {reason} Three quick taps and the archive can still find the episode.
      </p>
      <div className="mt-5 flex items-center gap-2 font-osd text-lg text-slate-400">
        {CHIP_KEYS.map((k, i) => (
          <span key={k} className={`px-2 py-0.5 border ${i === step ? "border-tape text-tape" : i < step ? "border-white/30 text-white" : "border-white/10"}`}>
            {i + 1}
          </span>
        ))}
        <span className="ml-2">{step + 1} / 3</span>
      </div>
      <h2 className="font-display text-3xl sm:text-4xl mt-3 tracking-wide" data-testid="taps-question">
        {CHIPS[key].question}
      </h2>
      <div className="mt-4">
        <ChipPicker key={key} category={key} value={answers[key]} onPick={pick} testPrefix="taps" />
      </div>
      <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3">
        <SpiceToggle value={spice} onChange={setSpice} />
        {step > 0 && (
          <button type="button" data-testid="taps-back" onClick={() => setStep(step - 1)} className="btn-ghost sm:ml-auto">
            Back
          </button>
        )}
      </div>
    </section>
  );
};
