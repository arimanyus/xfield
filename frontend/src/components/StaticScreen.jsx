import { useRollingCode } from "@/hooks/useTypewriter";

export const StaticScreen = ({ message = "SEARCHING THE ARCHIVE…", sub, fill = false, roll = true }) => {
  const code = useRollingCode(roll);
  return (
    <div
      data-testid="static-screen"
      className={`${fill ? "absolute inset-0" : "tape-frame relative aspect-video"} overflow-hidden bg-black select-none`}
    >
      <div className="absolute inset-0 static-noise animate-jitter" />
      <div className="absolute inset-0 scanlines" />
      <div className="absolute left-0 right-0 h-3 bg-tape/25 blur-[2px] animate-tracking" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
        <div data-testid="static-message" className="osd text-lg sm:text-2xl drop-shadow">
          {message}
        </div>
        <div
          data-testid="static-counter"
          className="font-display text-6xl sm:text-8xl text-white mt-2 tabular-nums drop-shadow-[0_0_14px_rgba(250,204,21,0.55)]"
        >
          {roll ? code : "— — —"}
        </div>
        {sub && <div className="font-osd text-slate-300 text-lg sm:text-xl mt-3 max-w-md">{sub}</div>}
      </div>
      <div className="absolute top-3 left-4 font-osd text-red-500 text-xl animate-blink">● REC</div>
      <div className="absolute top-3 right-4 font-osd text-slate-200 text-xl">PLAY ▶</div>
    </div>
  );
};
