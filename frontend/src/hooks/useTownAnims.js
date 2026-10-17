import { useEffect, useRef, useState } from "react";

export function useTownAnims(town) {
  const prev = useRef(null);
  const [anims, setAnims] = useState({});

  useEffect(() => {
    if (!town) return;
    const before = prev.current;
    const next = {};
    town.residents.forEach((r, idx) => {
      if (!before) next[r.k] = { cls: "pop-in", delay: Math.min(idx * 25, 1400) };
      else if (!before.has(r.k)) next[r.k] = { cls: "pop-in", delay: 250 + Math.min(Object.keys(next).length * 90, 900) };
      else if (before.get(r.k) === "r" && r.s === "f") next[r.k] = { cls: "lights-on", delay: 0 };
    });
    prev.current = new Map(town.residents.map((r) => [r.k, r.s]));
    setAnims(next);
    const t = setTimeout(() => setAnims({}), 3200);
    return () => clearTimeout(t);
  }, [town]);

  return anims;
}
