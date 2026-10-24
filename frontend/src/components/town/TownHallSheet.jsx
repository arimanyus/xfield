import { Sheet } from "@/components/town/Sheet";

const STEPS = [
  "Type any X handle to reserve their lot next to the people they talk to.",
  "Only the real owner can light it up, by signing in with X.",
  "Every friend who moves in next to you adds a floor to your house.",
  "Neighbours pick the sign on your roof. Pick theirs back.",
];

export const TownHallSheet = ({ stats, onClose }) => (
  <Sheet onClose={onClose} testId="town-hall-sheet">
    <div className="title-display text-3xl sm:text-4xl leading-none pt-1 pr-10">CITY HALL</div>
    <div className="mt-5 flex items-end gap-3" data-testid="town-hall-spots">
      <span className="title-display text-6xl sm:text-7xl leading-none">{stats.taken}</span>
      <span className="font-display font-bold text-xl sm:text-2xl pb-2">/ {stats.capacity} LOTS TAKEN</span>
    </div>
    <ol className="mt-6 space-y-3">
      {STEPS.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-lg bg-brand border-2 border-ink grid place-items-center font-display font-bold">{i + 1}</span>
          <span className="font-head font-medium text-base sm:text-lg leading-snug pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  </Sheet>
);
