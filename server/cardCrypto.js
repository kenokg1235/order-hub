// Mã hóa AT-REST cho dữ liệu THẺ (card_value / purchases.card / card_ledger.card).
// Mục tiêu: lấy được file data.db cũng KHÔNG đọc được số thẻ — chỉ giải mã được bằng
// khóa ORDERHUB_CARD_KEY (đặt trong .env trên VPS, KHÔNG nằm trong code/DB/git).
//
// Dùng mã hóa TẤT ĐỊNH (deterministic): cùng thẻ → cùng ciphertext. Nhờ vậy toàn bộ
// logic so khớp/join hiện có (purchases.card = card_requests.card_value, tính balance,
// stats, đếm số thẻ) VẪN CHẠY NGUYÊN trên ciphertext, không phải sửa.
// Đánh đổi (chấp nhận được với mối đe dọa "mất ổ đĩa"): kẻ tấn công có thể biết 2 dòng
// dùng CÙNG một thẻ, nhưng KHÔNG đọc được giá trị thẻ.
import crypto from "crypto";

const PREFIX = "enc:v1:";
let _init = false, _enabled = false, _kEnc = null, _kIv = null;

// Đọc khóa LAZY (lần dùng đầu) để server kịp nạp .env trước đó.
function init() {
  if (_init) return;
  _init = true;
  const secret = process.env.ORDERHUB_CARD_KEY || "";
  _enabled = secret.length >= 8;   // khóa quá ngắn/không có → tắt mã hóa (giữ app chạy)
  if (_enabled) {
    _kEnc = crypto.createHash("sha256").update("orderhub-card-enc|" + secret).digest();   // 32B khóa AES
    _kIv  = crypto.createHash("sha256").update("orderhub-card-iv|"  + secret).digest();   // 32B khóa HMAC→IV
  }
}

export function cardKeySet() { init(); return _enabled; }
export function isEncrypted(s) { return typeof s === "string" && s.startsWith(PREFIX); }

// Mã hóa 1 giá trị thẻ. Rỗng giữ rỗng; đã mã hóa thì bỏ qua; chưa đặt khóa thì giữ nguyên.
export function encCard(plain) {
  init();
  if (!_enabled) return plain;
  if (plain == null || plain === "") return plain;
  if (isEncrypted(plain)) return plain;
  const data = Buffer.from(String(plain), "utf8");
  const iv = crypto.createHmac("sha256", _kIv).update(data).digest().subarray(0, 16);   // IV tất định theo nội dung
  const c = crypto.createCipheriv("aes-256-cbc", _kEnc, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return PREFIX + Buffer.concat([iv, ct]).toString("base64");
}

// Giải mã để HIỂN THỊ. Plaintext (chưa migrate / khóa off) trả nguyên; lỗi → trả nguyên (không crash).
export function decCard(stored) {
  if (!isEncrypted(stored)) return stored;
  init();
  if (!_enabled) return stored;   // có ciphertext nhưng thiếu khóa → không giải được
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 16), ct = raw.subarray(16);
    const d = crypto.createDecipheriv("aes-256-cbc", _kEnc, iv);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return stored; }
}
