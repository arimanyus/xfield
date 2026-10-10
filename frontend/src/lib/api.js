import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API, timeout: 120000 });

export const readHandle = (handle) => http.post("/read", { handle }).then((r) => r.data);
export const createEpisode = (body) => http.post("/episodes", body).then((r) => r.data);
export const getEpisode = (id) => http.get(`/episodes/${id}`).then((r) => r.data);
export const trackShare = (id, channel) => http.post(`/episodes/${id}/share`, { channel }).then((r) => r.data);
export const reportEpisode = (id, reason) => http.post(`/episodes/${id}/report`, { reason }).then((r) => r.data);
export const getRecent = (limit = 20) => http.get("/recent", { params: { limit } }).then((r) => r.data);
export const getHandle = (handle) => http.get(`/handles/${encodeURIComponent(handle)}`).then((r) => r.data);
export const getLeaderboard = (type, period) => http.get("/leaderboard", { params: { type, period } }).then((r) => r.data);

export const errMsg = (e) => e?.response?.data?.detail || e?.message || "Something went wrong";

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

export const shareText = (ep) =>
  ep.found_by
    ? `@${ep.handle} the show predicted you in ${ep.aired_year}. ${seCode(ep)} “${ep.title}”. Explain yourself.`
    : `The show predicted @${ep.handle} in ${ep.aired_year}. ${seCode(ep)} “${ep.title}”. Episode:`;

export const xIntentUrl = (text, url) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
