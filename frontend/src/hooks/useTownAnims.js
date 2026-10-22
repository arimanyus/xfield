import { useEffect, useRef, useState } from "react";
import { P, houseSpot } from "@/lib/iso";

const shift = (from, to) => {
  const [ax, ay] = P(...houseSpot(from.x, from.y));
  const [bx, by] = P(...houseSpot(to.x, to.y));
  return [ax - bx, ay - by];
};

export function useTownAnims(town) {
  const prev = useRef(null);
  const [state, setState] = useState({ anims: {}, ghosts: [] });

  useEffect(() => {
    if (!town) return;
    const before = prev.current;
    const anims = {};
    let fresh = 0;
    town.residents.forEach((r, idx) => {
      const old = before?.get(r.k);
      if (!before) anims[r.k] = { cls: "pop-in", delay: Math.min(idx * 25, 1400) };
      else if (!old) anims[r.k] = { cls: "pop-in", delay: 250 + Math.min(fresh++ * 90, 900) };
      else if (old.x !== r.x || old.y !== r.y) anims[r.k] = { cls: "moving", shift: shift(old, r) };
      else if (old.s === "r" && r.s === "f") anims[r.k] = { cls: "lights-on" };
    });
    const here = new Set(town.residents.map((r) => r.k));
    const ghosts = before ? [...before.values()].filter((r) => !here.has(r.k)) : [];
    prev.current = new Map(town.residents.map((r) => [r.k, r]));
    setState({ anims, ghosts });
    const t = setTimeout(() => setState({ anims: {}, ghosts: [] }), 3200);
    return () => clearTimeout(t);
  }, [town]);

  return state;
}
