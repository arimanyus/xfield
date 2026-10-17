const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function api(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    const err = new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(" ") : "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const cleanHandle = (raw) =>
  (raw || "").trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?]/)[0].replace(/^@/, "").trim();

export const smallAvatar = (url) => (url ? url.replace("_400x400", "_bigger") : null);

export const getMe = () => localStorage.getItem("aa_me") || null;
export const setMe = (h) => localStorage.setItem("aa_me", h);
export const getAdmin = () => localStorage.getItem("aa_admin") || null;
