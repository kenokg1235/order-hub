// Mã hóa AT-REST cho dữ liệu THẺ — CHẾ ĐỘ NHẬP KHÓA BẰNG TAY.
// Khóa KHÔNG lưu trên đĩa. Admin nhập qua web sau mỗi lần khởi động; khóa chỉ nằm trong RAM.
// → Lấy được ổ đĩa/snapshot VPS cũng không có khóa → không giải mã được thẻ.
//
// Vẫn mã hóa TẤT ĐỊNH (cùng thẻ → cùng ciphertext) nên join/so khớp/stats giữ nguyên,
// và việc so khớp KHÔNG cần khóa (chạy trên ciphertext) — chỉ HIỂN THỊ & GHI MỚI mới cần khóa.
import crypto from "crypto";

const PREFIX = "enc:v1:";
const CHECK_PLAIN = "orderhub-card-key-check-v1";   // chuỗi cố định để xác minh khóa (không bí mật)

let _kEnc = null, _kIv = null, _loaded = false;

function deriveFrom(secret) {
  return {
    kEnc: crypto.createHash("sha256").update("orderhub-card-enc|" + secret).digest(),
    kIv:  crypto.createHash("sha256").update("orderhub-card-iv|"  + secret).digest(),
  };
}
function encWith(kEnc, kIv, plain) {
  const data = Buffer.from(String(plain), "utf8");
  const iv = crypto.createHmac("sha256", kIv).update(data).digest().subarray(0, 16);
  const c = crypto.createCipheriv("aes-256-cbc", kEnc, iv);
  return PREFIX + Buffer.concat([iv, c.update(data), c.final()]).toString("base64");
}

export function isEncrypted(s) { return typeof s === "string" && s.startsWith(PREFIX); }
export function cardKeyLoaded() { return _loaded; }

// Giá trị KIỂM TRA khóa = mã hóa tất định của CHECK_PLAIN. Lưu được lên đĩa (không phải khóa),
// dùng để xác minh khóa nhập vào có đúng không (tránh nhập sai → ghi/giải mã sai).
export function checkTokenFor(secret) { const { kEnc, kIv } = deriveFrom(secret); return encWith(kEnc, kIv, CHECK_PLAIN); }

// Nạp khóa vào RAM. Nếu có expectedToken → khóa phải khớp mới chấp nhận. Trả true nếu OK.
export function loadKey(secret, expectedToken) {
  if (!secret || String(secret).length < 8) return false;
  const { kEnc, kIv } = deriveFrom(String(secret));
  if (expectedToken && encWith(kEnc, kIv, CHECK_PLAIN) !== expectedToken) return false;   // SAI khóa
  _kEnc = kEnc; _kIv = kIv; _loaded = true;
  return true;
}
export function lockKey() { _kEnc = null; _kIv = null; _loaded = false; }

// Mã hóa khi GHI. Chưa mở khóa → ném CARD_LOCKED (chặn ghi plaintext). Rỗng/đã mã hóa → giữ nguyên.
export function encCard(plain) {
  if (plain == null || plain === "") return plain;
  if (isEncrypted(plain)) return plain;
  if (!_loaded) { const e = new Error("CARD_LOCKED"); e.code = "CARD_LOCKED"; throw e; }
  return encWith(_kEnc, _kIv, plain);
}
// Giải mã khi HIỂN THỊ. Chưa mở khóa → trả 🔒 (không lộ ciphertext). Plaintext cũ → trả nguyên.
export function decCard(stored) {
  if (!isEncrypted(stored)) return stored;
  if (!_loaded) return "🔒";
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 16), ct = raw.subarray(16);
    const d = crypto.createDecipheriv("aes-256-cbc", _kEnc, iv);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return stored; }
}
