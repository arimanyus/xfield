import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { WATER, heightAt, lightPhase } from "@/city3d/layout";

const url = (model) => `/models/${model}.glb`;
const CARS = ["sedan", "taxi", "suv", "van", "delivery", "police", "truck", "hatchback-sports"].map((c) => url(`cars/${c}`));

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
  gltf.userData.footprint = Math.max(size.x, size.z);
  return gltf.userData;
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
    if (green || p.l < 0.42) c.setHSL(hsl.h, muted ? hsl.s : Math.max(0.55, hsl.s * 0.9), Math.min(0.62, Math.max(0.32, p.l + 0.12)), S);
    else if (p.l < 0.97) c.setHSL(hsl.h, muted ? hsl.s : 0.55, Math.max(0.72, p.l), S);
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

function Instances({ model, tint, items, onHover, onPick }) {
  const prepared = prepare(useLoader(GLTFLoader, url(model)));
  const { footprint } = prepared;
  const parts = useMemo(() => (tint ? prepared.parts.map((p) => ({ ...p, material: p.material.map ? tintedMaterial(p.material, tint) : p.material }))
    : prepared.parts), [prepared, tint]);
  const refs = useRef([]);
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    parts.forEach((p, pi) => {
      const mesh = refs.current[pi];
      items.forEach((it, i) => {
        const s = it.scale ?? (it.fit ? Math.min(1, it.fit / footprint) : 1);
        m.compose(new THREE.Vector3(it.x, (it.y || 0) + 0.02, it.z), q.setFromAxisAngle(up, it.rot || 0), new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(i, m.multiply(p.matrix));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [parts, footprint, items]);
  const hover = (e) => {
    const it = items[e.instanceId];
    if (!it?.owner && !it?.mark) return;
    e.stopPropagation();
    onHover({ item: it, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  return parts.map((p, pi) => (
    <instancedMesh key={pi} ref={(r) => (refs.current[pi] = r)} args={[p.geometry, p.material, items.length]} castShadow receiveShadow
      onPointerMove={hover} onPointerOut={() => onHover(null)}
      onClick={(e) => { const it = items[e.instanceId]; if ((it?.owner || it?.mark) && e.delta < 6) { e.stopPropagation(); onPick(it); } }} />
  ));
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
    const [x0, x1, z0, z1] = city.island, step = 0.4, pos = [], col = [], c = new THREE.Color();
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
        <planeGeometry args={[x1 - x0 + 24, z1 - z0 + 24]} />
        <meshLambertMaterial color="#4C97D1" transparent opacity={0.94} />
      </mesh>
    </>
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
    <instancedMesh key={axis + name} ref={(r) => (refs.current[axis + name] = r)} args={[null, null, count[axis]]} frustumCulled={false}>
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
            <instancedMesh key={lamp} ref={(r) => (refs.current[axis + lamp] = r)} args={[null, mats[axis][lamp], count[axis]]} frustumCulled={false}>
              <sphereGeometry args={[0.016, 8, 6]} />
            </instancedMesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Cross({ at }) {
  return (
    <group position={at}>
      <mesh><boxGeometry args={[0.5, 0.12, 0.12]} /><meshLambertMaterial color="#E11D48" /></mesh>
      <mesh><boxGeometry args={[0.12, 0.5, 0.12]} /><meshLambertMaterial color="#E11D48" /></mesh>
    </group>
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

function Cars({ lanes }) {
  const gltfs = useLoader(GLTFLoader, CARS);
  const cars = useMemo(() => {
    const out = [];
    lanes.forEach((lane, li) => {
      const n = Math.max(1, Math.round((lane.to - lane.from) / 7));
      for (let i = 0; i < n; i++) {
        const obj = gltfs[(li * 7 + i) % gltfs.length].scene.clone(true);
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        obj.scale.setScalar(0.14);
        const speed = 0.95 + ((i + li) % 4) * 0.18;
        out.push({ obj, lane, dir: i % 2 ? 1 : -1, t: lane.from + ((i * 37 + li * 13) % Math.max(1, lane.to - lane.from)), speed, v: speed });
      }
    });
    return out;
  }, [gltfs, lanes]);
  useFrame(({ clock }, dt) => {
    const phase = lightPhase(clock.elapsedTime);
    const step = Math.min(dt, 0.05);
    const groups = new Map();
    for (const c of cars) {
      const k = `${c.lane.axis}${c.lane.line}:${c.dir}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (b.t - a.t) * a.dir);
      let leader = null;
      for (const c of list) {
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
        if (leader) {
          const gap = (leader.t - c.t) * c.dir;
          if (gap < GAP) target = 0;
          else if (gap < GAP + 0.9) target = Math.min(target, c.speed * (gap - GAP) / 0.9);
        }
        c.v += Math.max(-4 * step, Math.min(3 * step, target - c.v));
        c.v = Math.max(0, c.v);
        c.t += c.dir * c.v * step;
        if (c.t > lane.to || c.t < lane.from) {
          c.dir = -c.dir;
          c.t = Math.min(lane.to, Math.max(lane.from, c.t));
          c.v = Math.min(c.v, 0.4);
        }
        const off = c.dir * 0.16;
        if (lane.axis === "x") c.obj.position.set(c.t, 0.03, lane.line + off);
        else c.obj.position.set(lane.line - off, 0.03, c.t);
        c.obj.rotation.y = lane.axis === "x" ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : c.dir > 0 ? 0 : Math.PI;
        leader = c;
      }
    }
  });
  return cars.map((c, i) => <primitive key={i} object={c.obj} />);
}

function Controls({ center, focus }) {
  const { camera, gl } = useThree();
  const ctl = useRef();
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomed = useRef(false);
  useEffect(() => {
    const c = new MapControls(camera, gl.domElement);
    c.enableDamping = true;
    c.minZoom = 10;
    c.maxZoom = 150;
    c.minPolarAngle = 0.55;
    c.maxPolarAngle = 1.05;
    c.screenSpacePanning = false;
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
  useEffect(() => {
    if (!focus || !ctl.current) return;
    const c = ctl.current, [cx, cz] = centerRef.current;
    const to = new THREE.Vector3(focus[0] - cx, 0, focus[1] - cz);
    const shift = to.clone().sub(c.target);
    c.target.add(shift);
    camera.position.add(shift);
    if (!zoomed.current) {
      camera.zoom = 42;
      zoomed.current = true;
    }
    camera.updateProjectionMatrix();
  }, [focus, camera]);
  useFrame(() => ctl.current?.update());
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
      el.style.opacity = l.kind === "civic" && camera.zoom < 24 ? 0 : 1;
    });
  });
  return null;
}

export function City3D({ city, labelNodes, focus, onHover, onPick }) {
  const groups = useMemo(() => {
    const g = {};
    for (const b of [...city.roads, ...city.buildings]) (g[`${b.model}|${b.tint || ""}`] ||= []).push(b);
    return g;
  }, [city]);
  const [t0, t1, u0, u1] = city.grid;
  const span = Math.max(t1 - t0, u1 - u0) * 0.8;
  const hall = city.buildings.find((b) => b.mark?.kind === "city_hall");
  return (
    <Canvas flat shadows orthographic dpr={[1, 2]} camera={{ position: [30, 30, 30], zoom: 48, near: -200, far: 400 }}
      onPointerMissed={() => onHover(null)}>
      <color attach="background" args={["#CFE6FF"]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#F0F9FF", "#A3C98A", 1.2]} />
      <directionalLight position={[-18, 30, 10]} intensity={2.6} color="#FFF4E0" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0006} shadow-normalBias={0.04}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-camera-near={0.5} shadow-camera-far={120} />
      <Controls center={city.center} focus={focus} />
      <Projector labels={city.labels} nodes={labelNodes} center={city.center} />
      <group position={[-city.center[0], 0, -city.center[1]]}>
        <Terrain city={city} />
        <Signals signals={city.signals} />
        {city.crosses.map(([x, z, y]) => <Cross key={`${x},${z}`} at={[x, y, z]} />)}
        {hall && <XLogo at={[hall.x, 2.75, hall.z]} />}
        <Suspense fallback={null}>
          <Pads pads={city.pads} />
          {Object.entries(groups).map(([key, items]) => (
            <Instances key={key} model={items[0].model} tint={items[0].tint} items={items} onHover={onHover} onPick={onPick} />
          ))}
          <Cars lanes={city.lanes} />
        </Suspense>
      </group>
    </Canvas>
  );
}
