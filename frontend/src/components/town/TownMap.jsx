import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { P, WORLD_W, WORLD_H, blockPlots, djb2 } from "@/lib/iso";
import { Ground, Tree } from "@/components/town/Ground";
import { Building } from "@/components/town/Building";
import { Landmark, LandmarkLabel } from "@/components/town/Landmark";

const floor3 = (v) => Math.floor(v / 3);

function layout(town) {
  const used = new Set();
  const occupied = new Set();
  const items = [];
  town.residents.forEach((r) => {
    used.add(`${floor3(r.x)},${floor3(r.y)}`);
    occupied.add(`${r.x},${r.y}`);
    items.push({ type: "res", key: r.k, depth: r.x + r.y, r });
  });
  const hall = town.town_hall;
  [...town.neighbourhoods, { id: "hall", bx: hall.bx, by: hall.by }].forEach((nb) => {
    used.add(`${nb.bx},${nb.by}`);
    blockPlots(nb.bx, nb.by).forEach((p) => occupied.add(p.join(",")));
    items.push({ type: nb.id === "hall" ? "hall" : "lm", key: `nb-${nb.id}`, depth: 3 * nb.bx + 3 * nb.by + 2, nb });
  });
  const island = new Set();
  used.forEach((s) => {
    const [bx, by] = s.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) island.add(`${bx + dx},${by + dy}`);
  });
  const blocks = [...island].map((s) => s.split(",").map(Number));
  blocks.forEach(([bx, by]) =>
    blockPlots(bx, by).forEach(([i, j]) => {
      if (!occupied.has(`${i},${j}`) && djb2(`t${i},${j}`) % 3 === 0) items.push({ type: "tree", key: `t${i},${j}`, depth: i + j - 0.1, i, j });
    }),
  );
  items.sort((a, b) => a.depth - b.depth || (a.key < b.key ? -1 : 1));
  return { items, blocks };
}

const levelOf = (s) => (s < 0.35 ? 0 : s < 0.95 ? 1 : 2);

export const TownMap = forwardRef(function TownMap({ town, anims, me, onSelect, onTownHall, onBackground }, ref) {
  const tw = useRef(null);
  const wrap = useRef(null);
  const down = useRef(null);
  const [level, setLevel] = useState(2);
  const { items, blocks } = useMemo(() => layout(town), [town]);
  const [hx, hy] = P(3 * town.town_hall.bx + 1, 3 * town.town_hall.by + 1, 60);
  const startScale = window.innerWidth < 640 ? 0.55 : 0.75;

  useImperativeHandle(ref, () => ({
    flyTo(i, j, scale = 0.95, ms = 1100) {
      const [x, y] = P(i + 0.5, j + 0.5, 50);
      const el = wrap.current;
      tw.current?.setTransform(el.clientWidth / 2 - x * scale, el.clientHeight * 0.34 - y * scale, scale, ms, "easeInOutCubic");
    },
  }));

  return (
    <div
      ref={wrap}
      className="absolute inset-0 touch-none select-none"
      onPointerDownCapture={(e) => { down.current = [e.clientX, e.clientY]; }}
      onClickCapture={(e) => {
        if (down.current && Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) > 8) e.stopPropagation();
      }}
      data-testid="town-map"
    >
      <TransformWrapper
        ref={tw}
        initialScale={startScale}
        initialPositionX={window.innerWidth / 2 - hx * startScale}
        initialPositionY={window.innerHeight * 0.45 - hy * startScale}
        minScale={0.08}
        maxScale={2.4}
        limitToBounds={false}
        wheel={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
        onTransformed={(_, s) => setLevel((prev) => (levelOf(s.scale) === prev ? prev : levelOf(s.scale)))}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: WORLD_W, height: WORLD_H }}>
          <svg width={WORLD_W} height={WORLD_H} onClick={onBackground} className="block">
            <defs>
              <clipPath id="avatar-clip" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>
            </defs>
            <Ground blocks={blocks} />
            {items.map((it, idx) => {
              if (it.type === "tree") return <Tree key={it.key} i={it.i} j={it.j} />;
              if (it.type === "hall")
                return <Landmark key={it.key} bx={it.nb.bx} by={it.nb.by} kind="town_hall" onClick={onTownHall} testId="landmark-town-hall" />;
              if (it.type === "lm")
                return <Landmark key={it.key} bx={it.nb.bx} by={it.nb.by} kind={it.nb.landmark || "lard_lad"} testId={`landmark-${it.nb.id}`} />;
              const a = anims[it.key];
              return <Building key={it.key} r={it.r} level={level} anim={a?.cls} delay={a?.delay} mine={me === it.key} onSelect={onSelect} />;
            })}
            {items.filter((it) => it.type === "hall" || it.type === "lm").map((it) => (
              <LandmarkLabel key={`label-${it.key}`} bx={it.nb.bx} by={it.nb.by} level={level}
                name={it.type === "hall" ? "Town Hall" : it.nb.name || "New neighbourhood"}
                sub={it.type === "hall" ? "The real predictions" : `${it.nb.size} houses`}
                onClick={it.type === "hall" ? onTownHall : undefined} />
            ))}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
});
