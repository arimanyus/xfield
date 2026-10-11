import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API, timeout: 120000 });

export const readHandle = (handle) => http.post("/read", { handle }).then((r) => r.data);
export const createEpisode = (body) => http.post("/episodes", body).then((r) => r.data);
export const getEpisode = (id) => http.get(`/episodes/${id}`).then((r) => r.data);
export const retryEpisode = (id) => http.post(`/episodes/${id}/retry`).then((r) => r.data);
export const trackShare = (id, channel) => http.post(`/episodes/${id}/share`, { channel }).then((r) => r.data);
export const reportEpisode = (id, reason) => http.post(`/episodes/${id}/report`, { reason }).then((r) => r.data);
export const getRecent = (limit = 20) => http.get("/recent", { params: { limit } }).then((r) => r.data);
export const getHandle = (handle) => http.get(`/handles/${encodeURIComponent(handle)}`).then((r) => r.data);
export const getLeaderboard = (type, period) => http.get("/leaderboard", { params: { type, period } }).then((r) => r.data);
export const getTimeline = () => http.get("/timeline").then((r) => r.data);

export const untilYear = (year) => {
  const days = Math.ceil((Date.UTC(year, 0, 1) - Date.now()) / 86400000);
  if (days <= 0) return { days, label: "due now", due: true };
  if (days < 60) return { days, label: `${days} days`, due: false };
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days - y * 365.25) / 30.44);
  return { days, label: y ? `${y}y ${m}m` : `${m} months`, due: false };
};

export const errMsg = (e) => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  const status = e?.response?.status;
  if (status >= 500) return `The connection to the archive dropped (HTTP ${status}). Nothing was lost — try again.`;
  if (e?.code === "ECONNABORTED") return "The archive took too long to answer. Try again.";
  return e?.message || "Something went wrong";
};

export const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
export const cleanHandle = (raw) =>
  (raw || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/^@/, "")
    .trim();

export const seCode = (ep) => `S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
export const airedLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export const shareText = (ep) => {
  const head = ep.found_by
    ? `@${ep.handle} The Simpsons predicted you in ${ep.aired_year}.`
    : `The Simpsons predicted @${ep.handle} in ${ep.aired_year}.`;
  const tail = ep.found_by ? "\n\nExplain yourself." : "";
  const fixed = `${head}\n${seCode(ep)} “${ep.title}”\n\nComing ${ep.coming_near.year}: ${tail}`;
  const budget = 280 - 25 - fixed.length;
  return `${head}\n${seCode(ep)} “${ep.title}”\n\nComing ${ep.coming_near.year}: ${clip(ep.coming_near.text, Math.max(40, budget))}${tail}`;
};

export const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const xIntentUrl = (text, url) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
