import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { P, WORLD_W, WORLD_H, djb2, houseSpot } from "@/lib/iso";
import { Ground, Tree } from "@/components/town/Ground";
import { Building } from "@/components/town/Building";
import { Landmark, LandmarkLabel } from "@/components/town/Landmark";

const HALL_COLOR = "#F8FAFC";

function layout(town) {
  const used = new Set();
  const items = [];
  const colors = Object.fromEntries(town.neighbourhoods.map((nb) => [nb.id, nb.color]));
  const tints = {};
  town.residents.forEach((r) => {
    used.add(`${r.x},${r.y}`);
    if (colors[r.nb]) tints[`${r.x},${r.y}`] = colors[r.nb];
    const [hx, hy] = houseSpot(r.x, r.y);
    items.push({ type: "res", key: r.k, depth: hx + hy, r, color: colors[r.nb] });
  });
  const hall = town.town_hall;
  [...town.neighbourhoods, { id: "hall", bx: hall.bx, by: hall.by }].forEach((nb) => {
    used.add(`${nb.bx},${nb.by}`);
    if (nb.color) tints[`${nb.bx},${nb.by}`] = nb.color;
    items.push({ type: nb.id === "hall" ? "hall" : "lm", key: `nb-${nb.id}`, depth: 6 * nb.bx + 6 * nb.by + 2, nb });
  });
  const ring = new Set(used);
  used.forEach((s) => {
    const [x, y] = s.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ring.add(`${x + dx},${y + dy}`);
  });
  const lots = [...ring].map((s) => s.split(",").map(Number));
  lots.forEach(([x, y]) => {
    if (used.has(`${x},${y}`)) return;
    const h = djb2(`t${x},${y}`);
    [[0.5, 0.6], [1.45, 0.5], [1.0, 1.5]].forEach(([dx, dy], i) => {
      if ((h >> i) % 3 !== 0) items.push({ type: "tree", key: `t${x},${y},${i}`, depth: 3 * x + dx + 3 * y + dy, tx: 3 * x + dx, ty: 3 * y + dy });
    });
  });
  items.sort((a, b) => a.depth - b.depth || (a.key < b.key ? -1 : 1));
  return { items, lots, used, tints };
}

function fitView(used) {
  const xs = [];
  const ys = [];
  used.forEach((s) => {
    const [x, y] = s.split(",").map(Number);
    [[3 * x, 3 * y], [3 * x + 3, 3 * y + 3], [3 * x + 3, 3 * y], [3 * x, 3 * y + 3]].forEach(([a, b]) => {
      const [px, py] = P(a, b);
      xs.push(px);
      ys.push(py);
    });
  });
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys) + 300;
  const scale = Math.max(0.3, Math.min(0.85, Math.min(vw / (w + 200), (vh * 0.8) / (h + 200))));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2 - 120;
  return { scale, x: vw / 2 - cx * scale, y: vh * 0.46 - cy * scale };
}

const levelOf = (s) => (s < 0.25 ? 0 : s < 0.7 ? 1 : 2);
const DEMOLISH = { cls: "demolish" };

export const TownMap = forwardRef(function TownMap({ town, anims: { anims, ghosts }, me, onSelect, onDistrict, onTownHall, onBackground }, ref) {
  const tw = useRef(null);
  const wrap = useRef(null);
  const down = useRef(null);
  const { items, lots, used, tints } = useMemo(() => layout(town), [town]);
  const start = useMemo(() => fitView(used), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [level, setLevel] = useState(levelOf(start.scale));

  useImperativeHandle(ref, () => ({
    flyTo(x, y, scale = 0.9, ms = 1100) {
      const [px, py] = P(...houseSpot(x, y), 90);
      const el = wrap.current;
      tw.current?.setTransform(el.clientWidth / 2 - px * scale, el.clientHeight * 0.3 - py * scale, scale, ms, "easeInOutCubic");
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
        initialScale={start.scale}
        initialPositionX={start.x}
        initialPositionY={start.y}
        minScale={0.08}
        maxScale={2.2}
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
            <Ground lots={lots} tints={tints} />
            {items.map((it) => {
              if (it.type === "tree") return <Tree key={it.key} tx={it.tx} ty={it.ty} />;
              if (it.type === "hall") return <Landmark key={it.key} bx={it.nb.bx} by={it.nb.by} kind="city_hall" onClick={onTownHall} testId="landmark-town-hall" />;
              if (it.type === "lm") return <Landmark key={it.key} bx={it.nb.bx} by={it.nb.by} kind={it.nb.landmark || "harbor"} color={it.nb.color} onClick={() => onDistrict(it.nb.id)} testId={`landmark-${it.nb.id}`} />;
              return <Building key={it.key} r={it.r} color={it.color} level={level} anim={anims[it.key]} mine={me === it.key} onSelect={onSelect} />;
            })}
            {ghosts.map((r) => <Building key={`ghost-${r.k}`} r={r} level={level} anim={DEMOLISH} ghost />)}
            {items.filter((it) => it.type === "hall" || it.type === "lm").map((it) => (
              <LandmarkLabel
                key={`label-${it.key}`}
                bx={it.nb.bx}
                by={it.nb.by}
                level={level}
                color={it.type === "hall" ? HALL_COLOR : it.nb.color}
                name={it.type === "hall" ? "City Hall" : it.nb.name || "New district"}
                sub={it.type === "hall" ? `${town.stats.taken}/${town.stats.capacity} lots taken` : `${it.nb.size} lots${it.nb.claimed ? "" : " · unclaimed"}`}
                onClick={it.type === "hall" ? onTownHall : () => onDistrict(it.nb.id)}
              />
            ))}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
});
