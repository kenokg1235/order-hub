// ─────────────────────────────────────────────────────────────────────────────
// DỊCH VỤ KHÓA THẺ cho LAN — chạy trên MÁY ADMIN trong văn phòng (Windows + Node).
//
// Vai trò: giữ "khóa thẻ" trong RAM và phục vụ cho các trình duyệt TRONG LAN (qua HTTPS)
// để chúng tự giải mã số thẻ ngay trên máy. KHÓA KHÔNG BAO GIỜ LÊN VPS, không ghi ra đĩa.
//
//  • Admin chạy chương trình này → NHẬP khóa thẻ ("chạy khóa") → dịch vụ bắt đầu phục vụ.
//  • Đóng cửa sổ này = NGỪNG phục vụ → thẻ khóa lại trên mọi máy.
//  • Chỉ máy trong LAN (và tin cert) mới lấy được khóa; ngoài LAN không với tới → thẻ ẩn.
//
// Chạy:  node keyserver.mjs      (cần cert ở ./cert/ — xem README.md)
// ─────────────────────────────────────────────────────────────────────────────
import https from "https";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.KEY_PORT || 8443);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "https://tborderhub.space";
const CERT_FILE = process.env.CERT_FILE || path.join(__dirname, "cert", "server.pem");
const KEY_FILE = process.env.KEY_FILE || path.join(__dirname, "cert", "server-key.pem");

// Nhập khóa qua bàn phím, KHÔNG hiện ký tự (không lưu ra đĩa).
function askKeyHidden() {
  return new Promise((resolve) => {
    process.stdout.write("Nhập KHÓA THẺ để chạy (dán rồi Enter — không hiện ký tự): ");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};   // tắt echo
    rl.question("", (ans) => { rl.close(); process.stdout.write("\n"); resolve(String(ans || "").trim()); });
  });
}

async function main() {
  let creds;
  try {
    creds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  } catch (e) {
    console.error(`\n❌ Không đọc được chứng chỉ:\n   ${CERT_FILE}\n   ${KEY_FILE}\n→ Chạy mkcert tạo cert trước (xem README.md). Lỗi: ${e.message}\n`);
    process.exit(1);
  }

  const cardKey = await askKeyHidden();
  if (cardKey.length < 8) { console.error("Khóa quá ngắn — thoát."); process.exit(1); }

  const server = https.createServer(creds, (req, res) => {
    const origin = req.headers.origin || "";
    const allowed = origin === ALLOW_ORIGIN;
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.url === "/ping") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
    if (req.url === "/key" && req.method === "GET") {
      if (!allowed) { res.writeHead(403); return res.end("forbidden origin"); }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ key: cardKey }));
    }
    res.writeHead(404); res.end("not found");
  });

  server.on("error", (e) => { console.error("Lỗi server:", e.message); process.exit(1); });
  server.listen(PORT, "0.0.0.0", () => {
    console.log("\n──────────────────────────────────────────────");
    console.log(`🔑 DỊCH VỤ KHÓA THẺ ĐANG CHẠY  (cổng ${PORT})`);
    console.log(`   Chỉ phục vụ cho trang: ${ALLOW_ORIGIN}`);
    console.log(`   ⚠️  ĐÓNG cửa sổ này = NGỪNG phục vụ khóa → thẻ khóa lại trên mọi máy.`);
    console.log("──────────────────────────────────────────────\n");
  });
}

main();
