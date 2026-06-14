// Thin fetch wrapper. Stores the auth token in localStorage and attaches it.
const TOKEN_KEY = "orderhub.token";

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function req(method, url, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
}

export const api = {
  get:  (u) => req("GET", u),
  post: (u, b) => req("POST", u, b),
  put:  (u, b) => req("PUT", u, b),
  del:  (u) => req("DELETE", u),
};
