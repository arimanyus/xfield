import { useEffect, useMemo } from "react";
import * as THREE from "three";

const FONT = `"Space Grotesk", system-ui, sans-serif`;
const ORIGIN = process.env.REACT_APP_BACKEND_URL;
// Screen width, height and how high its bottom edge stands. The huge one towers over downtown.
const SIZES = { huge: { w: 6, h: 3.375, lift: 2.8 }, big: { w: 2.4, h: 1.35, lift: 1.2 } };
const STEEL = "#475569";

// The admin's picture, cropped to fill the screen, with the caption on a dark band along the bottom.
function paint(canvas, img, caption, big) {
  const ctx = canvas.getContext("2d"), { width: W, height: H } = canvas;
  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  if (!caption) return;
  const band = H * (big ? 0.17 : 0.24);
  ctx.fillStyle = "rgba(15,23,42,0.82)";
  ctx.fillRect(0, H - band, W, band);
  let size = band * 0.6;
  ctx.font = `700 ${size}px ${FONT}`;
  while (ctx.measureText(caption).width > W * 0.92 && size > 10) ctx.font = `700 ${(size -= 2)}px ${FONT}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, W * 0.04, H - band / 2);
}

function useScreen(url, caption, aspect, big) {
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = Math.round(1600 / aspect);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return { canvas, map };
  }, [aspect]);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { if (live) { paint(screen.canvas, img, caption, big); screen.map.needsUpdate = true; } };
    img.src = `${ORIGIN}${url}`;
    paint(screen.canvas, null, caption, big);
    screen.map.needsUpdate = true;
    return () => { live = false; };
  }, [url, caption, screen, big]);
  useEffect(() => () => screen.map.dispose(), [screen]);
  return screen.map;
}

// One billboard on steel legs with a catwalk and lamps, turned to face the camera. Clicking it opens its link.
function Billboard({ board }) {
  const { w, h, lift: base } = SIZES[board.size] || SIZES.big;
  const lift = board.lift ?? base;
  const map = useScreen(board.image_url, board.caption, w / h, board.size === "huge");
  const legX = w * 0.3, top = lift + h, post = board.size === "huge" ? 0.16 : 0.1;
  const hover = (on) => { if (board.link) document.body.style.cursor = on ? "pointer" : ""; };
  const open = (e) => {
    if (e.delta >= 6 || !board.link) return;
    e.stopPropagation();
    window.open(board.link, "_blank", "noopener,noreferrer");
  };
  return (
    <group position={[board.x, 0, board.z]} rotation-y={Math.PI / 4}>
      {[-legX, legX].map((x) => (
        <mesh key={x} position={[x, lift / 2 + 0.05, -0.12]} castShadow><boxGeometry args={[post, lift + 0.1, post]} /><meshLambertMaterial color={STEEL} /></mesh>
      ))}
      <mesh position={[0, lift * 0.55, -0.12]} castShadow><boxGeometry args={[legX * 2, 0.06, 0.06]} /><meshLambertMaterial color={STEEL} /></mesh>
      <mesh position={[0, lift + h / 2, -0.08]} castShadow><boxGeometry args={[w + 0.16, h + 0.16, 0.12]} /><meshLambertMaterial color="#1E293B" /></mesh>
      <mesh position={[0, lift + h / 2, -0.015]} onClick={open} onPointerOver={() => hover(true)} onPointerOut={() => hover(false)}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[0, lift - 0.1, 0.12]} castShadow><boxGeometry args={[w + 0.1, 0.04, 0.34]} /><meshLambertMaterial color={STEEL} /></mesh>
      <mesh position={[0, lift + 0.06, 0.28]}><boxGeometry args={[w + 0.1, 0.02, 0.02]} /><meshLambertMaterial color={STEEL} /></mesh>
      {[-0.36, 0, 0.36].map((f) => (
        <group key={f} position={[f * w, top + 0.12, 0.08]}>
          <mesh position={[0, 0, -0.08]}><boxGeometry args={[0.03, 0.03, 0.2]} /><meshLambertMaterial color={STEEL} /></mesh>
          <mesh position={[0, -0.02, 0.04]} rotation-x={0.5}><boxGeometry args={[0.14, 0.05, 0.08]} /><meshBasicMaterial color="#FEF3C7" toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  );
}

export const Billboards = ({ boards }) => boards.map((b) => <Billboard key={b.id} board={b} />);
