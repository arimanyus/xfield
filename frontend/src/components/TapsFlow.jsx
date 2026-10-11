import { useState } from "react";
import { ChipPicker } from "@/components/ChipPicker";
import { SpiceToggle } from "@/components/SpiceToggle";
import { CHIPS, CHIP_KEYS } from "@/lib/chips";

export const TapsFlow = ({ handle, profile, spice, setSpice, onDone }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const key = CHIP_KEYS[step];
  const reason = profile?.protected
    ? "That account is protected, so nothing could be read."
    : "X's mirrors are blocking us for that account right now, so nothing could be read.";

  const pick = (v) => {
    const next = { ...answers, [key]: v };
    setAnswers(next);
    if (step < 2) setStep(step + 1);
    else onDone(next, pasted.trim());
  };

  return (
    <section className="panel p-5 sm:p-7 animate-tv-on" data-testid="taps-screen">
      <div className="osd text-sm">No signal · @{handle}</div>
      <p className="mt-2 text-slate-300 text-sm sm:text-base" data-testid="taps-reason">
        {reason} Three quick taps and the archive can still find the episode.
      </p>

      <div className="mt-4 border border-white/10 bg-ink/40">
        <button
          type="button"
          data-testid="taps-paste-toggle"
          onClick={() => setPasteOpen(!pasteOpen)}
          className="w-full text-left px-4 py-3 font-osd text-lg text-tape flex items-center justify-between"
        >
          <span>Paste a few of their posts (optional) — makes the episode eerily specific</span>
          <span>{pasteOpen ? "−" : "+"}</span>
        </button>
        {pasteOpen && (
          <div className="px-4 pb-4 animate-rise">
            <textarea
              data-testid="taps-paste-input"
              value={pasted}
              onChange={(e) => setPasted(e.target.value.slice(0, 3000))}
              rows={5}
              placeholder={"One post per line, copied straight from X.\nshipped the thing. nobody noticed. shipping again tomorrow.\nhot take: every productivity app is a to-do list wearing a trench coat"}
              className="w-full bg-ink-2 border-2 border-white/10 focus:border-tape outline-none text-base text-white placeholder:text-slate-600 px-3 py-2 font-body"
            />
            <div className="font-osd text-slate-500 text-sm mt-1">{pasted.length}/3000 · only used to write this episode</div>
          </div>
        )}
      </div>

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
