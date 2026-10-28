import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { WATER, heightAt, lightPhase, mix, tileOf } from "@/city3d/layout";
import { modernModel } from "@/city3d/modern";

const url = (model) => `/models/${model}.glb`;
const CARS = ["sedan", "taxi", "suv", "van", "delivery", "truck"].map((c) => `cars/${c}`);
const CAR_SCALE = 0.14;

function prepare(gltf) {
  if (gltf.userData.parts) return gltf.userData;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const base = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const parts = [];
  scene.traverse((o) => {
    if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: base.clone().multiply(o.matrixWorld) });
  });
  gltf.userData.parts = parts;
  gltf.userData.size = size;
  gltf.userData.footprint = Math.max(size.x, size.z);
  gltf.userData.height = size.y;
  return gltf.userData;
}

// A lit shop sign: bold letters on a panel. text is [label, background, ink].
const SIGNS = new Map();
function signTexture([label, bg, ink]) {
  const key = `${label}|${bg}|${ink}`;
  if (!SIGNS.has(key)) {
    const h = 128, font = `800 78px "Space Grotesk", "Segoe UI Emoji", system-ui, sans-serif`;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(label).width) + 72;
    canvas.height = h;
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, bg);
    shade.addColorStop(1, new THREE.Color(bg).multiplyScalar(0.78).getStyle());
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, h, 22);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(9, 9, canvas.width - 18, h - 18, 15);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillText(label, canvas.width / 2 + 3, h / 2 + 7);
    ctx.fillStyle = ink;
    ctx.fillText(label, canvas.width / 2, h / 2 + 4);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    SIGNS.set(key, { map, aspect: canvas.width / h });
  }
  return SIGNS.get(key);
}

// A flat sign panel centred on `at`, facing along rotation `rot`, no wider than maxW.
function Board({ text, at, rot = 0, height = 0.3, maxW = Infinity }) {
  const { map, aspect } = signTexture(text);
  const h = Math.min(height, maxW / aspect);
  return (
    <mesh position={at} rotation-y={rot}>
      <planeGeometry args={[h * aspect, h]} />
      <meshBasicMaterial map={map} transparent />
    </mesh>
  );
}

// A sign on posts, turned to face the default camera.
function StandSign({ text, at, height = 0.34, lift = 0.5 }) {
  const { aspect } = signTexture(text), w = height * aspect;
  return (
    <group position={at} rotation-y={Math.PI / 4}>
      {[-w / 2 + 0.06, w / 2 - 0.06].map((x) => (
        <mesh key={x} position={[x, lift / 2, -0.03]} castShadow><boxGeometry args={[0.05, lift, 0.05]} /><meshLambertMaterial color="#334155" /></mesh>
      ))}
      <mesh position={[0, lift + height / 2, -0.03]} castShadow><boxGeometry args={[w + 0.06, height + 0.06, 0.04]} /><meshLambertMaterial color="#1E293B" /></mesh>
      <Board text={text} at={[0, lift + height / 2, 0]} height={height} />
    </group>
  );
}

const loadImage = (src) => new Promise((done) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => done(img);
  img.onerror = () => done(null);
  img.src = src;
});

// A profile picture in a round white frame.
const FACES = new Map();
function faceTexture(url) {
  if (!FACES.has(url)) {
    const s = 128, rim = 9, canvas = document.createElement("canvas");
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext("2d"), map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    loadImage(url).then((img) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - rim, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#DBEAFE";
      ctx.fill();
      if (img) ctx.drawImage(img, rim, rim, s - 2 * rim, s - 2 * rim);
      map.needsUpdate = true;
    });
    FACES.set(url, map);
  }
  return FACES.get(url);
}

// A sign, or the owner's face, high on whichever wall of a building faces the camera: its front if it can, or where
// its design hangs it.
function FacadeSign({ it, prepared: { size, height, sign = {} }, s }) {
  const [o, a] = [0, Math.PI / 2, -Math.PI / 2].map((off) => [off, it.rot + off]).find(([, r]) => Math.sin(r) + Math.cos(r) > 0.5) || [0, it.rot];
  const { x = size.x / 2, z = size.z / 2, y = height * 0.78 } = sign;
  const half = (o ? x : z) * s + 0.015, wide = 2 * (o ? z : x) * s;
  const at = [it.x + Math.sin(a) * half, (it.y || 0) + y * s, it.z + Math.cos(a) * half];
  if (!it.face) return <Board text={it.sign} at={at} rot={a} height={it.mark ? 0.34 : 0.26} maxW={wide * 0.86} />;
  const d = Math.min(0.32, wide * 0.5, height * s * 0.6);
  return (
    <mesh position={at} rotation-y={a}>
      <planeGeometry args={[d, d]} />
      <meshBasicMaterial map={faceTexture(it.face)} transparent />
    </mesh>
  );
}

THREE.Cache.enabled = true;
const TINTED_MAPS = new WeakMap();
const TINTED = new Map();

function tintedMaterial(material, hex) {
  const key = `${material.uuid}|${hex}`;
  if (!TINTED.has(key)) {
    const out = material.clone();
    out.map = tintedMap(material.map, hex);
    TINTED.set(key, out);
  }
  return TINTED.get(key);
}

function tintedMap(src, hex) {
  const img = src.image;
  if (!TINTED_MAPS.has(img)) TINTED_MAPS.set(img, new Map());
  const cache = TINTED_MAPS.get(img);
  if (cache.has(hex)) return cache.get(hex);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const S = THREE.SRGBColorSpace, hsl = {}, p = {}, rgb = {}, c = new THREE.Color();
  new THREE.Color(hex).getHSL(hsl, S);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    c.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, S).getHSL(p, S);
    const grey = p.s < 0.22, green = p.h > 0.36 && p.h < 0.47 && p.s > 0.3;
    if (!grey && !green) continue;
    const muted = hsl.s < 0.2;
    if (green || p.l < 0.42) c.setHSL(hsl.h, muted ? hsl.s : Math.max(0.7, hsl.s), Math.min(0.5, Math.max(0.3, p.l + 0.05)), S);
    else if (p.l < 0.97) c.setHSL(hsl.h, muted ? hsl.s : 0.72, Math.min(0.74, Math.max(0.56, p.l * 0.8)), S);
    c.getRGB(rgb, S);
    px[i] = rgb.r * 255;
    px[i + 1] = rgb.g * 255;
    px[i + 2] = rgb.b * 255;
  }
  ctx.putImageData(data, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.flipY = src.flipY;
  map.colorSpace = src.colorSpace;
  map.magFilter = src.magFilter;
  map.minFilter = src.minFilter;
  cache.set(hex, map);
  return map;
}

const RECOLORED = new Map();
function recolor(material, hex) {
  const key = `${material.uuid}|${hex}`;
  if (!RECOLORED.has(key)) RECOLORED.set(key, Object.assign(material.clone(), { color: new THREE.Color(hex) }));
  return RECOLORED.get(key);
}
// Model files take the tint into their textures; the building kit paints walls and trim by kind.
const skin = (p, tint, dark) => {
  if (!p.kind) return tint && p.material.map ? tintedMaterial(p.material, tint) : p.material;
  const m = (dark && p.off) || p.material, t = tint || "#94A3B8";
  return p.kind === "accent" ? recolor(m, t) : p.kind === "tone" || p.kind === "wall" ? recolor(m, mix(t, "#FFFFFF", 0.55)) : m;
};

function Instances(props) {
  return props.model.startsWith("modern/") ? <Placed {...props} prepared={modernModel(props.model)} /> : <Loaded {...props} />;
}

function Loaded(props) {
  return <Placed {...props} prepared={prepare(useLoader(GLTFLoader, url(props.model)))} />;
}

function Placed({ prepared, tint, dark, items, onHover, onPick }) {
  const { footprint } = prepared;
  const parts = useMemo(() => prepared.parts.map((p) => ({ ...p, material: skin(p, tint, dark) })), [prepared, tint, dark]);
  const refs = useRef([]);
  const scaleOf = (it) => it.scale ?? (it.size ? it.size / footprint : it.fit ? Math.min(1, it.fit / footprint) : 1);
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    parts.forEach((p, pi) => {
      const mesh = refs.current[pi];
      items.forEach((it, i) => {
        const s = scaleOf(it);
        m.compose(new THREE.Vector3(it.x, (it.y || 0) + 0.02, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE.Vector3(s, s * (it.stretch || 1), s));
        mesh.setMatrixAt(i, m.multiply(p.matrix));
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [parts, footprint, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const hover = (e) => {
    const it = items[e.instanceId];
    if (!it?.owner && !it?.mark) return;
    e.stopPropagation();
    onHover({ item: it, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const click = (e) => {
    const it = items[e.instanceId];
    if (e.delta >= 6 || !(it?.owner || it?.mark)) return;
    e.stopPropagation();
    onPick(it);
  };
  return (
    <>
      {parts.map((p, pi) => (
        <instancedMesh key={pi} ref={(r) => { refs.current[pi] = r; }} args={[p.geometry, p.material, Math.ceil(items.length / 64) * 64]} castShadow receiveShadow
          onPointerMove={hover} onPointerOut={() => onHover(null)} onClick={click} />
      ))}
      {items.map((it, i) => (it.sign || it.face) && <FacadeSign key={i} it={it} prepared={prepared} s={scaleOf(it)} />)}
    </>
  );
}

function Pads({ pads }) {
  const ref = useRef();
  useEffect(() => {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    pads.forEach((p, i) => {
      ref.current.setMatrixAt(i, m.makeScale(p.w, 1, p.d).setPosition(p.x, p.y ?? 0.012, p.z));
      ref.current.setColorAt(i, c.set(p.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [pads]);
  return (
    <instancedMesh ref={ref} args={[null, null, pads.length]} receiveShadow>
      <boxGeometry args={[1, 0.02, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

const SAND = new THREE.Color("#E4D2A8");
const GRASS_C = new THREE.Color("#7DB563");
const HILL = new THREE.Color("#5E9A48");
const ROCK = new THREE.Color("#9A958C");

function landColor(y, out) {
  if (y < 0) return out.copy(SAND).lerp(GRASS_C, Math.min(1, Math.max(0, (y - WATER) / 0.06)));
  if (y < 1.15) return out.copy(GRASS_C).lerp(HILL, y / 1.15);
  return out.copy(HILL).lerp(ROCK, Math.min(1, (y - 1.15) / 0.8));
}

function Terrain({ city }) {
  const geometry = useMemo(() => {
    const [x0, x1, z0, z1] = city.island, step = Math.max(0.4, Math.max(x1 - x0, z1 - z0) / 320);
    const pos = [], col = [], c = new THREE.Color();
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) H[i * (nz + 1) + j] = heightAt(x0 + i * step, z0 + j * step, city);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        for (const [a, b] of [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) {
          const y = H[a * (nz + 1) + b];
          pos.push(x0 + a * step, y, z0 + b * step);
          landColor(y, c);
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, [city]);
  const [x0, x1, z0, z1] = city.island;
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, WATER, (z0 + z1) / 2]}>
        <planeGeometry args={[x1 - x0 + 400, z1 - z0 + 400]} />
        <meshLambertMaterial color="#4C97D1" transparent opacity={0.94} />
      </mesh>
    </>
  );
}

function Flag({ color, y }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.015, 0.015, 0.7]} /><meshLambertMaterial color="#334155" /></mesh>
      <mesh position={[0.14, 0.6, 0]}><boxGeometry args={[0.28, 0.17, 0.02]} /><meshLambertMaterial color={color} /></mesh>
    </group>
  );
}

// Arrivals, a concert garden: a stage under a truss, a big screen showing the last three people to move in, and
// coloured spots sweeping a dancing crowd. Tapping a face opens that person's house; tapping the garden opens Arrivals.
const FONT = `"Space Grotesk", system-ui, sans-serif`;
const CROWD = ["#2563EB", "#16A34A", "#EAB308", "#DC2626", "#7C3AED", "#0D9488", "#DB2777", "#EA580C"];
const SPOTS = [[-1, "#F472B6"], [0, "#22D3EE"], [1, "#FDE047"]];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function drawScreen(canvas, people, imgs) {
  const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1E1B4B");
  g.addColorStop(1, "#831843");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FDE68A";
  ctx.font = `800 48px ${FONT}`;
  ctx.fillText("★ ARRIVALS ★", W / 2, 48);
  if (!people.length) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText("New neighbours show up here", W / 2, H / 2 + 20);
  }
  people.forEach((p, i) => {
    const cx = (W / people.length) * (i + 0.5), cy = 168, r = 70;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#DBEAFE";
    ctx.fill();
    ctx.clip();
    if (imgs[i]) ctx.drawImage(imgs[i], cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#FDE68A";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(`@${clip(p.h, 13)}`, cx, 280);
    ctx.fillStyle = "#E0E7FF";
    ctx.font = `600 22px ${FONT}`;
    if (p.line) ctx.fillText(`“${clip(p.line, 24)}”`, cx, 324);
  });
}

function Venue({ at, people, onPick, onOpen }) {
  const crowd = useRef(), spots = useRef([]);
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 416;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return { canvas, map };
  }, []);
  const key = people.map((p) => `${p.k}:${p.line}`).join("|");
  useEffect(() => {
    let live = true;
    const draw = (imgs) => {
      drawScreen(screen.canvas, people, imgs);
      screen.map.needsUpdate = true;
    };
    draw([]);
    Promise.all(people.map((p) => loadImage(p.a))).then((imgs) => live && draw(imgs));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fans = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const z = -0.3 + Math.random() * 1.8;
    return { x: (Math.random() - 0.5) * Math.min(2.4, 2 * (2.6 - Math.abs(z))), z, phase: Math.random() * 6.3, color: CROWD[i % CROWD.length] };
  }), []);
  useEffect(() => {
    const c = new THREE.Color();
    fans.forEach((f, i) => crowd.current.setColorAt(i, c.set(f.color)));
    crowd.current.instanceColor.needsUpdate = true;
  }, [fans]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, m = new THREE.Matrix4();
    fans.forEach((f, i) => crowd.current.setMatrixAt(i, m.makeTranslation(f.x, 0.13 + Math.abs(Math.sin(t * 4 + f.phase)) * 0.05, f.z)));
    crowd.current.instanceMatrix.needsUpdate = true;
    spots.current.forEach((s, i) => { if (s) s.rotation.z = Math.sin(t * 0.9 + i * 2.1) * 0.45; });
  });
  const pick = (e) => {
    e.stopPropagation();
    const hit = people[Math.floor(e.uv.x * people.length)];
    if (hit && e.delta < 6) onPick(hit.k);
  };
  const metal = <meshLambertMaterial color="#94A3B8" />;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={Math.PI / 4} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onOpen(); } }}>
      <mesh position={[0, 0.03, 0.55]} receiveShadow><boxGeometry args={[2.5, 0.02, 2.1]} /><meshLambertMaterial color="#E7E2D6" /></mesh>
      <mesh position={[0, 0.12, -1.0]} castShadow receiveShadow><boxGeometry args={[2.7, 0.24, 0.9]} /><meshLambertMaterial color="#1E293B" /></mesh>
      <mesh position={[0, 0.2, -0.54]}><boxGeometry args={[2.7, 0.04, 0.02]} /><meshBasicMaterial color="#F472B6" toneMapped={false} /></mesh>
      <mesh position={[0, 1.2, -1.42]} castShadow><boxGeometry args={[2.62, 1.12, 0.08]} /><meshLambertMaterial color="#0F172A" /></mesh>
      <mesh position={[0, 1.2, -1.375]} onClick={pick}>
        <planeGeometry args={[2.5, 1.016]} />
        <meshBasicMaterial map={screen.map} toneMapped={false} />
      </mesh>
      {[[-1.36, -1.42], [1.36, -1.42], [-1.36, -0.55], [1.36, -0.55]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 1.1, z]} castShadow>{metal}<boxGeometry args={[0.07, 2.2, 0.07]} /></mesh>
      ))}
      {[-1.42, -0.55].map((z) => <mesh key={z} position={[0, 2.2, z]} castShadow>{metal}<boxGeometry args={[2.8, 0.07, 0.07]} /></mesh>)}
      {[-1.36, 1.36].map((x) => <mesh key={x} position={[x, 2.2, -0.98]}>{metal}<boxGeometry args={[0.07, 0.07, 0.87]} /></mesh>)}
      {[-1.12, 1.12].map((x) => (
        <group key={x} position={[x, 0.24, -0.82]}>
          <mesh position={[0, 0.16, 0]} castShadow><boxGeometry args={[0.28, 0.32, 0.24]} /><meshLambertMaterial color="#111827" /></mesh>
          <mesh position={[0, 0.44, 0]} castShadow><boxGeometry args={[0.22, 0.24, 0.2]} /><meshLambertMaterial color="#111827" /></mesh>
        </group>
      ))}
      {SPOTS.map(([x, color], i) => (
        <group key={x} position={[x * 0.9, 2.14, -0.55]} ref={(g) => { spots.current[i] = g; }}>
          <mesh position={[0, -0.98, 0.33]} rotation-x={-0.32}>
            <coneGeometry args={[0.38, 1.96, 20, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh><cylinderGeometry args={[0.07, 0.09, 0.14, 10]} /><meshLambertMaterial color="#334155" /></mesh>
        </group>
      ))}
      <instancedMesh ref={crowd} args={[null, null, fans.length]} castShadow>
        <capsuleGeometry args={[0.045, 0.1, 3, 8]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

// City hall: a domed civic palace on the central square with a fountain and the spinning X on top.
function CityHall({ hall, onHover, onPick }) {
  const marble = "#F5F5F4", stone = "#D6D3D1";
  const it = { ...hall, owner: null };
  return (
    <group position={[hall.x, 0, hall.z]}
      onPointerMove={(e) => { e.stopPropagation(); onHover({ item: it, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
      onPointerOut={() => onHover(null)} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onPick(it); } }}>
      <mesh position={[0, 0.1, -0.2]} castShadow receiveShadow><boxGeometry args={[3.2, 0.2, 2.4]} /><meshLambertMaterial color={stone} /></mesh>
      <mesh position={[0, 0.06, 1.15]} receiveShadow><boxGeometry args={[1.6, 0.12, 0.5]} /><meshLambertMaterial color={stone} /></mesh>
      <mesh position={[0, 0.75, -0.4]} castShadow><boxGeometry args={[2.8, 1.1, 1.6]} /><meshLambertMaterial color={marble} /></mesh>
      {[-1.15, -0.69, -0.23, 0.23, 0.69, 1.15].map((x) => (
        <mesh key={x} position={[x, 0.68, 0.72]} castShadow><cylinderGeometry args={[0.07, 0.08, 0.96, 10]} /><meshLambertMaterial color={marble} /></mesh>
      ))}
      <mesh position={[0, 1.22, 0.55]} castShadow><boxGeometry args={[2.8, 0.12, 0.5]} /><meshLambertMaterial color={marble} /></mesh>
      <mesh position={[0, 1.42, 0.55]} rotation={[0, 0, Math.PI / 2]} scale={[0.55, 1, 1]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 2.8, 3, 1, false, Math.PI / 2]} /><meshLambertMaterial color={marble} />
      </mesh>
      <mesh position={[0, 1.5, -0.4]} castShadow><cylinderGeometry args={[0.6, 0.6, 0.4, 24]} /><meshLambertMaterial color={marble} /></mesh>
      <mesh position={[0, 1.7, -0.4]} castShadow><sphereGeometry args={[0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshLambertMaterial color="#E5B93C" /></mesh>
      <Board text={["CITY HALL", "#1E3A8A", "#FDE68A"]} at={[0, 1.22, 0.81]} height={0.13} />
      <XLogo at={[0, 3.05, -0.4]} />
      <mesh position={[0, 0.08, 1.75]} receiveShadow><cylinderGeometry args={[0.42, 0.46, 0.16, 20]} /><meshLambertMaterial color={stone} /></mesh>
      <mesh position={[0, 0.17, 1.75]}><cylinderGeometry args={[0.36, 0.36, 0.02, 20]} /><meshLambertMaterial color="#60A5FA" /></mesh>
      <mesh position={[0, 0.32, 1.75]}><cylinderGeometry args={[0.03, 0.05, 0.3, 8]} /><meshLambertMaterial color={stone} /></mesh>
      {[-1.4, 1.4].map((x) => <group key={x} position={[x, 0, 1.3]}><Flag color="#1D9BF0" y={0} /></group>)}
    </group>
  );
}

const _identity = new THREE.Quaternion();
const _unit = new THREE.Vector3(1, 1, 1);
const LENS = { r: "#EF4444", y: "#FACC15", g: "#22C55E" };
const DIM = { r: "#3F1D1D", y: "#3A3010", g: "#14301C" };

function Signals({ signals }) {
  const mats = useMemo(() => {
    const lens = (hex) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.15 });
    return { x: { r: lens(DIM.r), y: lens(DIM.y), g: lens(DIM.g) }, z: { r: lens(DIM.r), y: lens(DIM.y), g: lens(DIM.g) } };
  }, []);
  const refs = useRef({});
  useEffect(() => {
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), p = new THREE.Vector3();
    const lists = { x: signals.filter((s) => s.axis === "x"), z: signals.filter((s) => s.axis === "z") };
    const put = (mesh, list, y, z, spin) => {
      if (!mesh) return;
      list.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rot);
        p.set(0, y, z).applyQuaternion(q);
        p.x += s.x;
        p.z += s.z;
        mesh.setMatrixAt(i, m.compose(p, spin ? q : _identity, _unit));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    for (const axis of ["x", "z"]) {
      const list = lists[axis];
      put(refs.current[`${axis}pole`], list, 0.19, 0, false);
      put(refs.current[`${axis}head`], list, 0.4, 0, true);
      put(refs.current[`${axis}r`], list, 0.445, 0.024, false);
      put(refs.current[`${axis}y`], list, 0.4, 0.024, false);
      put(refs.current[`${axis}g`], list, 0.355, 0.024, false);
    }
  }, [signals]);
  const last = useRef("");
  useFrame(({ clock }) => {
    const phase = lightPhase(clock.elapsedTime);
    const key = phase.x + phase.z;
    if (key === last.current) return;
    last.current = key;
    for (const axis of ["x", "z"]) {
      for (const lamp of ["r", "y", "g"]) {
        const on = phase[axis] === lamp;
        const mat = mats[axis][lamp], hex = on ? LENS[lamp] : DIM[lamp];
        mat.color.set(hex);
        mat.emissive.set(hex);
        mat.emissiveIntensity = on ? 1.4 : 0.05;
      }
    }
  });
  if (!signals.length) return null;
  const count = { x: signals.filter((s) => s.axis === "x").length, z: signals.filter((s) => s.axis === "z").length };
  const part = (axis, name, geo) => count[axis] > 0 && (
    <instancedMesh key={axis + name} ref={(r) => { refs.current[axis + name] = r; }} args={[null, null, count[axis]]} frustumCulled={false}>
      {geo}
      {name.length === 1 ? null : <meshLambertMaterial color={name === "pole" ? "#334155" : "#0F172A"} />}
    </instancedMesh>
  );
  return (
    <group>
      {["x", "z"].map((axis) => (
        <group key={axis}>
          {part(axis, "pole", <cylinderGeometry args={[0.012, 0.015, 0.38, 6]} />)}
          {part(axis, "head", <boxGeometry args={[0.055, 0.15, 0.045]} />)}
          {["r", "y", "g"].map((lamp) => count[axis] > 0 && (
            <instancedMesh key={lamp} ref={(r) => { refs.current[axis + lamp] = r; }} args={[null, mats[axis][lamp], count[axis]]} frustumCulled={false}>
              <sphereGeometry args={[0.016, 8, 6]} />
            </instancedMesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// A house that just lit up or grew a floor flashes from the ground.
function Flash({ f }) {
  const ref = useRef();
  useFrame(() => {
    const t = (performance.now() - f.at) / 1400;
    ref.current.visible = t < 1;
    ref.current.scale.setScalar(0.7 + t * 0.8);
    ref.current.material.opacity = Math.max(0, 1 - t);
  });
  return (
    <mesh ref={ref} position={[tileOf(f.x), 0.3, tileOf(f.y)]} rotation-x={-Math.PI / 2} renderOrder={3}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={f.color} transparent depthTest={false} />
    </mesh>
  );
}

function xLogoTexture() {
  const s = 256, canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(52, 44); ctx.lineTo(108, 44); ctx.lineTo(204, 212); ctx.lineTo(148, 212);
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(196, 44); ctx.lineTo(60, 212);
  ctx.stroke();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function XLogo({ at }) {
  const ref = useRef();
  const map = useMemo(xLogoTexture, []);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.6; });
  return (
    <group position={at}>
      <mesh position={[0, -0.55, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.9]} />
        <meshLambertMaterial color="#334155" />
      </mesh>
      <mesh ref={ref} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.08]} />
        <meshLambertMaterial map={map} />
      </mesh>
    </group>
  );
}

const STOP = 0.72;
const GAP = 0.78;

const carSpot = (lane, t, dir) => (lane.axis === "x" ? [t, lane.line + dir * 0.16] : [lane.line - dir * 0.16, t]);
const carYaw = (lane, dir) => (lane.axis === "x" ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI);

// At every junction or corner a car goes straight or turns onto the crossing road. It never turns back.
function turn(c, p, laneAt) {
  const { lane } = c;
  const cross = laneAt(lane.axis === "x" ? "z" : "x", p, lane.line);
  const ways = p === (c.dir > 0 ? lane.to : lane.from) ? [] : [[lane, c.dir], [lane, c.dir]];
  if (cross && lane.line < cross.to) ways.push([cross, 1]);
  if (cross && lane.line > cross.from) ways.push([cross, -1]);
  const [next, dir] = ways.length ? ways[Math.floor(Math.random() * ways.length)] : [lane, -c.dir];
  if (next !== lane) c.t = lane.line;
  c.lane = next;
  c.dir = dir;
}

function Cars({ lanes }) {
  const gltfs = useLoader(GLTFLoader, CARS.map(url));
  const laneAt = useMemo(() => {
    const byLine = new Map();
    for (const l of lanes) {
      l.nodes = [...new Set([l.from, ...l.stops, l.to])].sort((a, b) => a - b);
      const key = `${l.axis}${l.line}`;
      byLine.set(key, [...(byLine.get(key) || []), l]);
    }
    return (axis, line, t) => (byLine.get(`${axis}${line}`) || []).find((l) => l.from <= t && t <= l.to);
  }, [lanes]);
  const cars = useMemo(() => {
    const out = [];
    lanes.forEach((lane, li) => {
      const n = Math.max(1, Math.round((lane.to - lane.from) / 7));
      for (let i = 0; i < n; i++) {
        const k = (li * 7 + i) % gltfs.length, obj = gltfs[k].scene.clone(true);
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        obj.scale.setScalar(CAR_SCALE);
        const speed = 0.95 + ((i + li) % 4) * 0.18, dir = i % 2 ? 1 : -1;
        const t = lane.from + 0.5 + ((i * 37 + li * 13) % Math.max(1, lane.to - lane.from - 1));
        const [x, z] = carSpot(lane, t, dir);
        obj.position.set(x, 0.03, z);
        obj.rotation.y = carYaw(lane, dir);
        out.push({ obj, lane, dir, t, speed, v: speed });
      }
    });
    return out;
  }, [gltfs, lanes]);
  // Every car brakes for whatever is right in front of it: the car ahead in its lane, or one crossing or
  // turning into its path. Of two cars that see each other, the first in the list goes.
  useFrame(({ clock }, dt) => {
    const phase = lightPhase(clock.elapsedTime);
    const step = Math.min(dt, 0.05);
    const spots = cars.map((c) => carSpot(c.lane, c.t, c.dir));
    const heads = cars.map((c) => (c.lane.axis === "x" ? [c.dir, 0] : [0, c.dir]));
    const ahead = (i, j) => {
      const dx = spots[j][0] - spots[i][0], dz = spots[j][1] - spots[i][1];
      const along = dx * heads[i][0] + dz * heads[i][1], side = Math.abs(dx * heads[i][1] - dz * heads[i][0]);
      return along > 0 && side < 0.2 ? along : Infinity;
    };
    cars.forEach((c, i) => {
      const { lane } = c;
      let target = c.speed;
      let next = Infinity;
      for (const p of lane.stops) {
        const dist = (p - c.dir * STOP - c.t) * c.dir;
        if (dist > -0.04 && dist < next) next = dist;
      }
      const lamp = phase[lane.axis];
      if (lamp === "r" || (lamp === "y" && next < 1.15)) {
        if (next < 1.8) target = next < 0.05 ? 0 : c.speed * Math.min(1, (next - 0.05) / 1.15);
      }
      let gap = Infinity;
      cars.forEach((_, j) => {
        if (j === i) return;
        const d = ahead(i, j);
        if (d < gap && !(j > i && ahead(j, i) < Infinity && heads[i][0] !== heads[j][0])) gap = d;
      });
      if (gap < GAP) target = 0;
      else if (gap < GAP + 0.9) target = Math.min(target, c.speed * (gap - GAP) / 0.9);
      c.v += Math.max(-4 * step, Math.min(3 * step, target - c.v));
      c.v = Math.max(0, c.v);
      const t = c.t + c.dir * c.v * step;
      const p = c.dir > 0 ? lane.nodes.find((n) => n > c.t && n <= t) : lane.nodes.findLast((n) => n < c.t && n >= t);
      if (p === undefined) c.t = t;
      else {
        c.t = p;
        turn(c, p, laneAt);
      }
      const [x, z] = carSpot(c.lane, c.t, c.dir);
      const ease = Math.min(1, step * 10);
      c.obj.position.x += (x - c.obj.position.x) * ease;
      c.obj.position.z += (z - c.obj.position.z) * ease;
      const yaw = carYaw(c.lane, c.dir) - c.obj.rotation.y;
      c.obj.rotation.y += Math.atan2(Math.sin(yaw), Math.cos(yaw)) * ease;
    });
  });
  return cars.map((c, i) => <primitive key={i} object={c.obj} />);
}

// People stroll the pavement on both sides of every road, end to end and back, crossing the side streets.
const SKIN = ["#F5D0B0", "#E0AC69", "#C68642", "#8D5524", "#FFDBAC"];
const PAVEMENT = 0.42;

function Walkers({ lanes }) {
  const body = useRef(), head = useRef();
  const people = useMemo(() => lanes.flatMap((lane, li) => Array.from({ length: Math.round((lane.to - lane.from) / 3) }, (_, i) => ({
    lane, t: lane.from + Math.random() * (lane.to - lane.from), dir: Math.random() < 0.5 ? 1 : -1, side: i % 2 ? 1 : -1,
    speed: 0.2 + Math.random() * 0.12, phase: Math.random() * 6.3, shirt: CROWD[(li + i) % CROWD.length], skin: SKIN[(li * 3 + i) % SKIN.length],
  }))), [lanes]);
  useEffect(() => {
    const c = new THREE.Color();
    people.forEach((p, i) => {
      body.current.setColorAt(i, c.set(p.shirt));
      head.current.setColorAt(i, c.set(p.skin));
    });
    body.current.instanceColor.needsUpdate = head.current.instanceColor.needsUpdate = true;
  }, [people]);
  useFrame(({ clock }, dt) => {
    const m = new THREE.Matrix4();
    people.forEach((p, i) => {
      const { from, to, axis, line } = p.lane;
      p.t += p.dir * p.speed * Math.min(dt, 0.05);
      if (p.t < from || p.t > to) p.dir = p.t < from ? 1 : -1;
      const off = line + p.side * PAVEMENT, [x, z] = axis === "x" ? [p.t, off] : [off, p.t];
      const bob = Math.abs(Math.sin(clock.elapsedTime * 9 + p.phase)) * 0.012;
      body.current.setMatrixAt(i, m.makeTranslation(x, 0.102 + bob, z));
      head.current.setMatrixAt(i, m.makeTranslation(x, 0.2 + bob, z));
    });
    body.current.instanceMatrix.needsUpdate = head.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={body} args={[null, null, people.length]} castShadow frustumCulled={false}>
        <capsuleGeometry args={[0.032, 0.08, 3, 8]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={head} args={[null, null, people.length]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.032, 10, 8]} />
        <meshLambertMaterial />
      </instancedMesh>
    </>
  );
}

// Pans (and zooms, when a focus asks for it) smoothly to each new focus, so a tour feels like a camera move.
function Controls({ center, focus, span }) {
  const { camera, gl } = useThree();
  const ctl = useRef();
  const goal = useRef(null);
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomed = useRef(false);
  useEffect(() => {
    const c = new MapControls(camera, gl.domElement);
    c.enableDamping = true;
    c.maxZoom = 150;
    c.minPolarAngle = 0.55;
    c.maxPolarAngle = 1.05;
    c.screenSpacePanning = false;
    c.addEventListener("start", () => { goal.current = null; });
    ctl.current = c;
    const key = (e) => {
      if (!["-", "=", "+"].includes(e.key) || e.target.closest?.("input, textarea")) return;
      camera.zoom = Math.min(c.maxZoom, Math.max(c.minZoom, camera.zoom * (e.key === "-" ? 0.8 : 1.25)));
      camera.updateProjectionMatrix();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      c.dispose();
    };
  }, [camera, gl]);
  useEffect(() => { ctl.current.minZoom = Math.min(10, 1300 / span); }, [span]);
  useEffect(() => {
    if (!focus) return;
    const [cx, cz] = centerRef.current;
    goal.current = { to: new THREE.Vector3(focus[0] - cx, 0, focus[1] - cz), zoom: focus[2] ?? (zoomed.current ? null : 42) };
    zoomed.current = true;
  }, [focus]);
  useFrame((_, dt) => {
    const c = ctl.current, g = goal.current;
    if (c && g) {
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4.5);
      const shift = g.to.clone().sub(c.target).multiplyScalar(k);
      c.target.add(shift);
      camera.position.add(shift);
      if (g.zoom) {
        camera.zoom += (g.zoom - camera.zoom) * k;
        camera.updateProjectionMatrix();
      }
      if (shift.lengthSq() < 1e-7 && (!g.zoom || Math.abs(g.zoom - camera.zoom) < 0.05)) goal.current = null;
    }
    c?.update();
  });
  return null;
}

// Takes a 1200x630 picture of one house and its street from a fixed corner, the house left of centre so a card can
// sit on the right. Returns the JPEG and where the given points landed in it.
const SNAP = { W: 1200, H: 630, zoom: 92, shift: 230 };
const until = (ok, ms = 20000) => new Promise((done) => {
  const start = performance.now();
  const tick = () => (ok() || performance.now() - start > ms ? done() : setTimeout(tick, 250));
  tick();
});
// Mounts once every model in its Suspense boundary has loaded.
function Ready({ flag }) {
  useEffect(() => { flag.current = true; }, [flag]);
  return null;
}
function Snapshot({ snapRef, center, ready }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const shoot = (at, points) => {
      const { W, H, zoom, shift } = SNAP;
      const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -200, 400);
      cam.zoom = zoom;
      const house = new THREE.Vector3(at[0] - center[0], 0, at[1] - center[1]);
      const target = house.clone().add(new THREE.Vector3(1, 0, -1).normalize().multiplyScalar(shift / zoom));
      cam.position.copy(target).add(new THREE.Vector3(40, 40, 40));
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const size = gl.getSize(new THREE.Vector2()), ratio = gl.getPixelRatio();
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      gl.setPixelRatio(2);
      gl.setSize(W, H, false);
      gl.render(scene, cam);
      out.getContext("2d").drawImage(gl.domElement, 0, 0, W, H);
      gl.setPixelRatio(ratio);
      gl.setSize(size.x, size.y, false);
      gl.render(scene, camera);
      const v = new THREE.Vector3();
      const placed = points.map((p) => {
        v.set(p.pos[0] - center[0], p.pos[1], p.pos[2] - center[1]).project(cam);
        return { ...p, x: Math.round(((v.x + 1) / 2) * W), y: Math.round(((1 - v.y) / 2) * H) };
      });
      return { out, placed };
    };
    snapRef.current = async ({ at, points }) => {
      await until(() => ready.current);
      await new Promise((r) => setTimeout(r, 800));
      const { out, placed } = shoot(at, points);
      const blob = await new Promise((r) => out.toBlob(r, "image/jpeg", 0.88));
      return { blob, points: placed };
    };
    return () => { snapRef.current = null; };
  }, [gl, scene, camera, center, snapRef, ready]);
  return null;
}

function Projector({ labels, nodes, center }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    labels.forEach((l, i) => {
      const el = nodes.current[i];
      if (!el) return;
      v.set(l.pos[0] - center[0], l.pos[1], l.pos[2] - center[1]).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    });
  });
  return null;
}

// Keeps the previous object while the content is the same, so a town refresh doesn't rebuild terrain or respawn cars.
function useStable(value) {
  const ref = useRef({ key: null, value });
  const key = JSON.stringify(value);
  if (ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

// One house on its own, for the vote cards: no face, no sign, nothing to say whose it is.
function Lone({ model, tint }) {
  const { parts, footprint, height } = modernModel(`modern/${model}`);
  const s = 1.6 / Math.max(footprint, height);
  return (
    <group scale={s} position={[0, (-height * s) / 2, 0]}>
      {parts.map((p, i) => <mesh key={i} geometry={p.geometry} material={skin(p, tint)} />)}
    </group>
  );
}

export function HousePreview({ model, tint }) {
  return (
    <Canvas flat orthographic dpr={[1, 2]} camera={{ position: [4, 3.2, 4], zoom: 55 }} className="!h-28">
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#E0F2FE", "#9CC97F", 1.1]} />
      <directionalLight position={[-3, 6, 4]} intensity={2.6} color="#FFEFD6" />
      <Lone model={model} tint={tint} />
    </Canvas>
  );
}

const byModel = (items) => {
  const g = {};
  for (const b of items) (g[`${b.model}|${b.tint || ""}|${b.dark ? "dark" : ""}`] ||= []).push(b);
  return g;
};

export function City3D({ city, labels, labelNodes, focus, flashes, onHover, onPick, newest, onFace, snapRef }) {
  const shape = useStable({ built: city.built, island: city.island, water: city.water });
  const lanes = useStable(city.lanes);
  const groups = useMemo(() => byModel([...city.roads, ...city.buildings]), [city]);
  const [t0, t1, u0, u1] = city.grid;
  const span = Math.max(t1 - t0, u1 - u0) * 0.8;
  const ready = useRef(false);
  return (
    <Canvas flat shadows orthographic dpr={[1, 2]} camera={{ position: [30, 30, 30], zoom: 48, near: -200, far: 400 }}
      onPointerMissed={() => onHover(null)}>
      <color attach="background" args={["#CFE6FF"]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#E0F2FE", "#9CC97F", 1.15]} />
      <directionalLight position={[-18, 30, 10]} intensity={3.1} color="#FFEFD6" castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0006} shadow-normalBias={0.04}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-camera-near={0.5} shadow-camera-far={120} />
      <Controls center={city.center} focus={focus} span={Math.max(city.island[1] - city.island[0], city.island[3] - city.island[2])} />
      <Projector labels={labels} nodes={labelNodes} center={city.center} />
      {snapRef && <Snapshot snapRef={snapRef} center={city.center} ready={ready} />}
      <group position={[-city.center[0], 0, -city.center[1]]}>
        <Terrain city={shape} />
        {flashes.map((f) => <Flash key={f.id} f={f} />)}
        <Signals signals={city.signals} />
        {city.hall && <CityHall hall={city.hall} onHover={onHover} onPick={onPick} />}
        {city.venue && <Venue at={city.venue} people={newest.slice(0, 3)} onPick={onFace}
          onOpen={() => onPick({ x: city.venue.x, z: city.venue.z, mark: { kind: "place", id: "arrivals" } })} />}
        {city.signs.map((s) => <StandSign key={s.text[0]} text={s.text} at={[s.x, 0, s.z]} height={0.26} lift={0.3} />)}
        <Suspense fallback={null}>
          <Pads pads={city.pads} />
          {Object.entries(groups).map(([key, items]) => (
            <Instances key={key} model={items[0].model} tint={items[0].tint} dark={items[0].dark} items={items} onHover={onHover} onPick={onPick} />
          ))}
          <Ready flag={ready} />
        </Suspense>
        <Suspense fallback={null}>
          <Cars lanes={lanes} />
        </Suspense>
        <Walkers lanes={lanes} />
      </group>
    </Canvas>
  );
}
