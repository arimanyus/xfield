import {
  Trophy, Smartphone, Gamepad2, Video, Fish, Atom, Sparkles, Building2, Vote, Utensils, Mail, Watch,
  Siren, Euro, Landmark, Medal, Shirt, Mic, Snowflake, Clapperboard, Flame, Gem, Rocket, Megaphone, Tv,
} from "lucide-react";

export const CAT_COLOR = {
  tech: "#38BDF8",
  politics: "#FF6B6B",
  science: "#4ADE80",
  sports: "#FFA94D",
  culture: "#C084FC",
  business: "#FF8FC7",
};

export const ICONS = {
  "superbowl-26": Trophy, autocorrect: Smartphone, farmville: Gamepad2, "video-calls": Video,
  "three-eyed-fish": Fish, higgs: Atom, hologram: Sparkles, shard: Building2, "voting-machine": Vote,
  horsemeat: Utensils, "beatles-letter": Mail, smartwatch: Watch, fifa: Siren, greece: Euro, trump: Landmark,
  nobel: Medal, david: Shirt, gaga: Mic, curling: Snowflake, "disney-fox": Clapperboard, serfsons: Flame,
  kamala: Gem, branson: Rocket, hanks: Megaphone,
};

export const iconFor = (id) => ICONS[id] || Tv;

export const gapLabel = (p) => p.gap_label || (p.gap === 1 ? "1 year early" : `${p.gap} years early`);
