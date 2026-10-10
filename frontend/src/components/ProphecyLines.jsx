import { useTypewriter } from "@/hooks/useTypewriter";

const Line = ({ tag, year, text, quote, delay, fresh, testid, accent }) => {
  const typed = useTypewriter(text, fresh, delay);
  const typing = fresh && typed.length < text.length;
  return (
    <div className={`border-l-2 pl-4 py-1 ${accent ? "border-tape" : "border-white/25"}`} data-testid={testid}>
      <div className="osd flex items-center gap-2">
        <span className={accent ? "" : "text-slate-300"}>{tag}</span>
        {year && <span className="text-white bg-white/10 px-1.5 leading-tight">{year}</span>}
      </div>
      <p className="text-lg sm:text-xl leading-snug mt-1.5 min-h-[1.6em] text-slate-100">
        {typed}
        {typing && <span className="text-tape animate-blink">▍</span>}
      </p>
      {quote && !typing && (
        <p className="font-osd text-slate-400 text-base sm:text-lg mt-2 animate-rise" data-testid={`${testid}-evidence`}>
          EVIDENCE › “{quote}”
        </p>
      )}
    </div>
  );
};

export const ProphecyLines = ({ ep, fresh }) => (
  <div className="space-y-5" data-testid="prophecy-lines">
    <Line tag="Already happened" text={ep.already_happened} quote={ep.evidence} delay={200} fresh={fresh} testid="line-past" accent />
    <Line tag="Coming" year={ep.coming_near.year} text={ep.coming_near.text} delay={200 + ep.already_happened.length * 16 + 400} fresh={fresh} testid="line-near" />
    <Line
      tag="Coming"
      year={ep.coming_far.year}
      text={ep.coming_far.text}
      delay={200 + (ep.already_happened.length + ep.coming_near.text.length) * 16 + 900}
      fresh={fresh}
      testid="line-far"
    />
  </div>
);
