// Seeded randomness: the same key always lands the same way, so the city looks the same on every screen.
export const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
export const rand = (key) => (hash(key) % 10000) / 10000;
export const pick = (arr, key) => arr[hash(key) % arr.length];
export const chance = (key, p) => rand(key) < p;
