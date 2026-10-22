const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function api(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
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
export const signInUrl = (next) => `${BASE}/auth/x/login?next=${encodeURIComponent(next || "/")}`;
export const getAdmin = () => localStorage.getItem("aa_admin") || null;

export const openXPost = (text, url) =>
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
