import { Sheet } from "@/components/town/Sheet";

const STEPS = [
  "Type any X handle to build their house.",
  "Only the real owner can light it, by signing in with X.",
  "When all the spots are gone, they're gone.",
];

export const TownHallSheet = ({ stats, onClose }) => (
  <Sheet onClose={onClose} testId="town-hall-sheet">
    <div className="font-display text-3xl sm:text-4xl leading-none pt-1 pr-10">XFIELD TOWN HALL</div>
    <div className="mt-5 flex items-end gap-3" data-testid="town-hall-spots">
      <span className="title-toon text-6xl sm:text-7xl leading-none">{stats.taken}</span>
      <span className="font-display text-2xl sm:text-3xl pb-2">/ {stats.capacity} SPOTS TAKEN</span>
    </div>
    <ol className="mt-6 space-y-3">
      {STEPS.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-simp border-[3px] border-ink grid place-items-center font-display text-lg pt-1">{i + 1}</span>
          <span className="font-head font-bold text-lg sm:text-xl leading-snug pt-1">{s}</span>
        </li>
      ))}
    </ol>
  </Sheet>
);
