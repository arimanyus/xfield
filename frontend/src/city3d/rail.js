// The railway loop round the city: a rectangle with rounded corners, walked by distance along it.

export function railLoop(W, E, N, S, R) {
  const pts = [];
  const arc = (cx, cz, from, to) => {
    for (let i = 1; i < 10; i++) {
      const a = from + ((to - from) * i) / 10;
      pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
    }
  };
  pts.push([W, N + R], [W, S - R]);
  arc(W + R, S - R, Math.PI, Math.PI / 2);
  pts.push([W + R, S], [E - R, S]);
  arc(E - R, S - R, Math.PI / 2, 0);
  pts.push([E, S - R], [E, N + R]);
  arc(E - R, N + R, 0, -Math.PI / 2);
  pts.push([E - R, N], [W + R, N]);
  arc(W + R, N + R, -Math.PI / 2, -Math.PI);
  pts.push([W, N + R]);
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, at, total: at[at.length - 1] };
}

// Where the loop is s along from its start (any s, it wraps), and which way it runs there as a y rotation.
export function pointAt({ pts, at, total }, s) {
  const d = ((s % total) + total) % total;
  let lo = 0, hi = at.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (at[m] <= d) lo = m;
    else hi = m;
  }
  const [a, b] = [pts[lo], pts[hi]], u = (d - at[lo]) / (at[hi] - at[lo] || 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(-(b[1] - a[1]), b[0] - a[0])];
}
