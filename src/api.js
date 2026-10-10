// Thin fetch wrapper. Stores the auth token in localStorage and attaches it.
const TOKEN_KEY = "orderhub.token";

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function req(method, url, body, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // TIMEOUT: request treo (server bận không trả lời) tự hủy để NHẢ khe kết nối của trình duyệt
  // (mỗi domain chỉ 6 khe) → poll notifications/presence không bóp chết request tải đơn.
  // GET 20s; thao tác ghi 90s (import sheet lớn có thể lâu, không cắt oan).
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : (method === "GET" ? 20000 : 90000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ac.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") throw new Error("Máy chủ phản hồi chậm — vui lòng thử lại");
    throw e;
  }
  clearTimeout(timer);
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
  get:  (u, opts) => req("GET", u, undefined, opts),
  post: (u, b, opts) => req("POST", u, b, opts),
  put:  (u, b, opts) => req("PUT", u, b, opts),
  del:  (u, b, opts) => req("DELETE", u, b, opts),
};
