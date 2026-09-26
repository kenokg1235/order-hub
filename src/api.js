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
  // Phiên bị vô hiệu khi đang đăng nhập (vd Admin đổi mật khẩu) → xóa token + báo App về Login.
  // KHÔNG reload cứng (tránh vòng lặp reload gây trắng màn/treo).
  if (r.status === 401 && token) {
    setToken("");
    try { window.dispatchEvent(new Event("orderhub:logout")); } catch {}
    throw new Error(data.error || "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại");
  }
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
}

export const api = {
  get:  (u) => req("GET", u),
  post: (u, b) => req("POST", u, b),
  put:  (u, b) => req("PUT", u, b),
  del:  (u, b) => req("DELETE", u, b),
};
