// Mã hóa/giải mã thẻ phía TRÌNH DUYỆT (Web Crypto) — khớp 100% thuật toán tất định của
// server/cardCrypto.js để ciphertext giống hệt → join/so khớp/stats trên VPS vẫn đúng.
// Khóa lấy từ dịch vụ LAN (không bao giờ lưu ra đĩa/localStorage).
//   Server: kEnc=SHA256("orderhub-card-enc|"+secret), kIv=SHA256("orderhub-card-iv|"+secret)
//           iv = HMAC-SHA256(kIv, plaintext)[:16];  ct = AES-256-CBC(kEnc, iv, plaintext)
//           stored = "enc:v1:" + base64(iv(16) || ct)
const PREFIX = "enc:v1:";
const _enc = new TextEncoder();
const _dec = new TextDecoder();
const _crypto = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto : null;

async function sha256Bytes(str) {
  return new Uint8Array(await _crypto.subtle.digest("SHA-256", _enc.encode(str)));
}
const b64 = (u8) => btoa(String.fromCharCode.apply(null, u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const isEncrypted = (s) => typeof s === "string" && s.startsWith(PREFIX);

// Dựng bộ mã hóa từ secret (khóa thẻ). Trả { encCard, decCard }.
export async function makeCardCipher(secret) {
  const kEncRaw = await sha256Bytes("orderhub-card-enc|" + secret);
  const kIvRaw = await sha256Bytes("orderhub-card-iv|" + secret);
  const aesKey = await _crypto.subtle.importKey("raw", kEncRaw, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
  const hmacKey = await _crypto.subtle.importKey("raw", kIvRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  async function encCard(plain) {
    if (plain == null || plain === "") return plain;
    if (isEncrypted(plain)) return plain;
    const data = _enc.encode(String(plain));
    const mac = new Uint8Array(await _crypto.subtle.sign("HMAC", hmacKey, data));
    const iv = mac.slice(0, 16);                                       // IV tất định theo nội dung
    const ct = new Uint8Array(await _crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, data));
    const out = new Uint8Array(16 + ct.length);
    out.set(iv, 0); out.set(ct, 16);
    return PREFIX + b64(out);
  }
  async function decCard(stored) {
    if (!isEncrypted(stored)) return stored;
    try {
      const raw = unb64(stored.slice(PREFIX.length));
      const iv = raw.slice(0, 16), ct = raw.slice(16);
      const pt = await _crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, ct);
      return _dec.decode(pt);
    } catch { return "🔒"; }
  }
  return { encCard, decCard, isEncrypted };
}
