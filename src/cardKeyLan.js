// Quản lý KHÓA THẺ phía trình duyệt: lấy khóa từ dịch vụ LAN (máy Admin), giải mã/mã hóa
// thẻ NGAY TRONG TRÌNH DUYỆT. Khóa không bao giờ lên VPS, không lưu localStorage.
//  • Ở LAN + dịch vụ khóa chạy → lấy được khóa → xem/cấp thẻ được.
//  • Ngoài LAN / dịch vụ tắt → không có khóa → thẻ hiện 🔒, không cấp thẻ số-thật được
//    (nhưng vẫn DÁN MÃ sẵn để gắn vào đơn).
import { makeCardCipher, isEncrypted } from "./cardCryptoClient.js";

let _cipher = null, _ready = false, _url = "";
const _cache = new Map();        // ciphertext -> plaintext (giải mã tất định nên cache an toàn)
const _subs = new Set();         // callback báo khi trạng thái/giải mã đổi → component re-render

export function onLanKeyChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }
function emit() { _subs.forEach((fn) => { try { fn(); } catch {} }); }

export function lanKeyReady() { return _ready; }
export { isEncrypted };

// Thử lấy khóa từ dịch vụ LAN + dựng bộ mã hóa. Trả true nếu lấy được.
export async function initLanKey(url) {
  if (url != null) _url = String(url || "");
  _cipher = null; _ready = false; _cache.clear();
  if (!_url) { emit(); return false; }
  try {
    const base = _url.replace(/\/+$/, "");
    const r = await fetch(base + "/key", { cache: "no-store", credentials: "omit" });
    if (!r.ok) { emit(); return false; }
    const { key } = await r.json();
    if (!key) { emit(); return false; }
    _cipher = await makeCardCipher(key);
    _ready = true;
    emit();
    return true;
  } catch { emit(); return false; }
}

// Giải mã trước một LOẠT giá trị (điền cache) rồi báo re-render. Gọi sau khi tải dữ liệu.
export async function warmDecrypt(values) {
  if (!_ready || !_cipher) return;
  let changed = false;
  for (const v of values || []) {
    if (isEncrypted(v) && !_cache.has(v)) {
      try { _cache.set(v, await _cipher.decCard(v)); } catch { _cache.set(v, "🔒"); }
      changed = true;
    }
  }
  if (changed) emit();
}

// ĐỒNG BỘ: lấy số thẻ để HIỂN THỊ. Không mã hóa → trả nguyên; có khóa + đã cache → số thật;
// có khóa nhưng chưa cache → "…"; không khóa → 🔒.
export function cardText(stored) {
  if (!isEncrypted(stored)) return stored || "";
  if (!_ready) return "🔒";
  return _cache.has(stored) ? _cache.get(stored) : "…";
}

// Chuẩn bị giá trị thẻ để LƯU lên VPS:
//   đã là mã (copy/admin gửi) → dùng thẳng (không cần khóa);
//   số thật + có khóa → mã hóa; số thật + không khóa → ném NO_LAN_KEY.
export async function prepareCardForSave(input) {
  const v = String(input || "").trim();
  if (!v) return "";
  if (isEncrypted(v)) return v;
  if (!_ready || !_cipher) { const e = new Error("NO_LAN_KEY"); e.code = "NO_LAN_KEY"; throw e; }
  return _cipher.encCard(v);
}

// ───────────────── CÁCH B: nhập khóa thẻ THỦ CÔNG trên trình duyệt (làm từ xa) ─────────────────
// Khóa chỉ nằm trong RAM phiên này (sessionStorage, xóa khi đóng trình duyệt), KHÔNG gửi VPS, KHÔNG lưu đĩa.
// Có xác minh bằng "token kiểm tra" (= mã hóa tất định một chuỗi cố định bằng khóa đúng, lưu ở settings,
// KHÔNG bí mật) để chặn nhập sai khóa làm hỏng/ghi lệch dữ liệu thẻ.
const CHECK_PLAIN = "orderhub-card-key-check-v1";
const SS_KEY = "oh.ck";                    // tên mục trong sessionStorage
let _checkToken = "";                       // token kiểm tra lấy từ settings.cardKeyCheck
let _manual = false;                        // khóa hiện tại do nhập tay (để biết có thể gỡ)

export function setCheckToken(t) { _checkToken = String(t || ""); }
export function hasCheckToken() { return !!_checkToken; }
export function isManualKey() { return _manual; }

// Máy VĂN PHÒNG (có khóa LAN) tính token kiểm tra để Admin lưu lên settings cho remote verify.
export async function computeCheckToken() {
  if (!_cipher) return "";
  try { return await _cipher.encCard(CHECK_PLAIN); } catch { return ""; }
}

// Nhập khóa tay. Bắt buộc có token kiểm tra + khớp mới chấp nhận (an toàn tuyệt đối với dữ liệu).
export async function setManualKey(key) {
  const k = String(key || "").trim();
  if (k.length < 8) return { ok: false, error: "Khóa không hợp lệ (quá ngắn)." };
  if (!_checkToken) return { ok: false, error: "Chưa thiết lập xác minh — cần mở thẻ ở văn phòng (máy Admin) một lần trước." };
  let cipher, t = "";
  try { cipher = await makeCardCipher(k); t = await cipher.encCard(CHECK_PLAIN); } catch { return { ok: false, error: "Khóa không hợp lệ." }; }
  if (t !== _checkToken) return { ok: false, error: "Sai khóa thẻ." };
  _cipher = cipher; _ready = true; _manual = true; _cache.clear();
  try { sessionStorage.setItem(SS_KEY, k); } catch {}
  emit();
  return { ok: true };
}

// GỠ KHÓA tức thì: xóa khỏi RAM + sessionStorage → thẻ khóa lại ngay. Dùng khi rời máy/nghi ngờ.
export function clearManualKey() {
  _cipher = null; _ready = false; _manual = false; _cache.clear();
  try { sessionStorage.removeItem(SS_KEY); } catch {}
  emit();
}

// Khôi phục khóa tay đã nhập trong PHIÊN này (khi LAN không có) — gọi lúc khởi động nếu chưa ready.
export async function tryRestoreManualKey() {
  if (_ready) return true;
  let k = ""; try { k = sessionStorage.getItem(SS_KEY) || ""; } catch {}
  if (!k) return false;
  const r = await setManualKey(k);
  return r.ok;
}
