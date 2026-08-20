// ─────────────────────────────────────────────────────────────────────────────
// SQLite database — single source of truth for Order Hub.
// Full schema baked in up front; a lightweight migration block adds columns to
// pre-existing DBs so we never lose data between phases.
// ─────────────────────────────────────────────────────────────────────────────
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'Member',   -- Admin | Leader | Member | Lister
  team_ids     TEXT NOT NULL DEFAULT '[]',
  store_names  TEXT NOT NULL DEFAULT '[]',        -- stores a Lister/Member may see
  can_buy_card INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  name TEXT PRIMARY KEY, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,        -- eBay "ID Order" (Order Number)
  team          TEXT DEFAULT '',
  store         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  cust_phone    TEXT DEFAULT '',
  qty           TEXT DEFAULT '',
  product       TEXT DEFAULT '',
  image         TEXT DEFAULT '',
  link          TEXT DEFAULT '',
  size          TEXT DEFAULT '',
  color         TEXT DEFAULT '',
  profit        REAL DEFAULT 0,
  deadline      TEXT DEFAULT '',
  master_status TEXT DEFAULT '',
  claimed_by    TEXT DEFAULT '',
  claimed_name  TEXT DEFAULT '',
  claimed_at    INTEGER DEFAULT 0,
  note1 TEXT DEFAULT '', note2 TEXT DEFAULT '', note3 TEXT DEFAULT '', note4 TEXT DEFAULT '',
  listed_by     TEXT DEFAULT '',         -- user id who imported/created the order
  raw           TEXT DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  card TEXT DEFAULT '', amount REAL DEFAULT 0,
  order_number TEXT DEFAULT '', email TEXT DEFAULT '', tracking TEXT DEFAULT '',
  phone TEXT DEFAULT '', zip TEXT DEFAULT '', process_status TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL, requester_name TEXT NOT NULL,
  content TEXT DEFAULT '', card_value TEXT DEFAULT '', status TEXT DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
  message TEXT NOT NULL, link TEXT DEFAULT '', read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_card  ON purchases(card);
CREATE INDEX IF NOT EXISTS idx_orders_team     ON orders(team);
CREATE INDEX IF NOT EXISTS idx_orders_store    ON orders(store);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id);
`);

// ── Migrations for pre-existing DBs (add columns if missing) ─────────────────
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}
ensureColumn("users", "store_names", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("stores", "status", "TEXT DEFAULT 'active'");   // trạng thái acc: active | die
ensureColumn("stores", "note", "TEXT DEFAULT ''");           // ghi chú (vd lý do die)
ensureColumn("stores", "died_at", "TEXT DEFAULT ''");        // ngày acc die "YYYY-MM-DD"
ensureColumn("orders", "listed_by", "TEXT DEFAULT ''");
ensureColumn("orders", "master_note", "TEXT DEFAULT ''");   // Admin/Lister note on Sheet Tổng
ensureColumn("users", "telegram_chat_id", "TEXT DEFAULT ''");
ensureColumn("users", "muted_teams", "TEXT NOT NULL DEFAULT '[]'");   // teams whose notifications this user mutes
ensureColumn("users", "can_master", "INTEGER NOT NULL DEFAULT 0");    // Leader có quyền xem/sửa Sheet Tổng
ensureColumn("users", "last_seen", "INTEGER DEFAULT 0");              // mốc hoạt động gần nhất (online)
ensureColumn("orders", "overdue_notified", "INTEGER DEFAULT 0");
ensureColumn("orders", "period", "TEXT DEFAULT ''");   // working month "YYYY-MM"
ensureColumn("orders", "cancel_reason", "TEXT DEFAULT ''");   // lý do khi master_status = Đã Cancel
ensureColumn("orders", "order_no", "TEXT DEFAULT ''");        // eBay order number (hiển thị; nhiều dòng có thể chung)
ensureColumn("orders", "line_key", "TEXT DEFAULT ''");        // khóa chống trùng theo dòng: orderNo||itemNo||variation
ensureColumn("orders", "urgent", "INTEGER DEFAULT 0");        // cảnh báo GẤP (Lister bật) để người xử lý chú ý
ensureColumn("orders", "urgent_note", "TEXT DEFAULT ''");     // ghi chú cảnh báo gấp (Lister cung cấp thông tin)
ensureColumn("orders", "staff_note", "TEXT DEFAULT ''");     // note của NV xử lý (Sheet Con) → Lister theo dõi
ensureColumn("orders", "finalized_at", "INTEGER DEFAULT 0"); // thời điểm đơn lên "Đã Up"/"Đã Cancel" (cho Leaderboard theo kỳ)
ensureColumn("orders", "staff_note_at", "INTEGER DEFAULT 0");   // lúc NV ghi note (để cảnh báo tăng dần theo thời gian)
ensureColumn("orders", "staff_note_done", "INTEGER DEFAULT 0"); // Lister đã xử lý note này chưa
// Backfill mốc cho các note đã có (xấp xỉ bằng updated_at).
db.exec("UPDATE orders SET staff_note_at = updated_at WHERE staff_note_at = 0 AND staff_note != '' AND updated_at > 0");
// Backfill: đơn đã Đã Up/Đã Cancel nhưng chưa có mốc → dùng updated_at (xấp xỉ thời điểm chốt).
db.exec("UPDATE orders SET finalized_at = updated_at WHERE finalized_at = 0 AND master_status IN ('Đã Up','Đã Cancel') AND updated_at > 0");
// Backfill order_no/line_key cho đơn cũ (mỗi đơn cũ là 1 dòng, order_no = id).
{
  const rows = db.prepare("SELECT id, raw, size, order_no, line_key FROM orders").all();
  const upd = db.prepare("UPDATE orders SET order_no=?, line_key=? WHERE id=?");
  for (const o of rows) {
    if (o.order_no && o.line_key) continue;
    const orderNo = o.order_no || o.id;
    let itemNo = ""; try { itemNo = JSON.parse(o.raw || "{}").itemNumber || ""; } catch {}
    upd.run(orderNo, `${orderNo}||${itemNo}||${o.size || ""}`, o.id);
  }
}
ensureColumn("purchases", "order_time", "INTEGER DEFAULT 0");   // when Order# last changed
ensureColumn("purchases", "name", "TEXT DEFAULT ''");          // Name tự nhập (trước cột Tracking)
ensureColumn("purchases", "deli_image", "TEXT DEFAULT ''");   // ảnh deli (dán ảnh) cho Lister gửi khách
ensureColumn("shipments", "account", "TEXT DEFAULT ''");        // which AfterShip key registered it
ensureColumn("blacklist", "category", "TEXT DEFAULT ''");       // Ngành hàng (dropdown) để lọc user theo loại hàng
ensureColumn("card_requests", "seq", "INTEGER DEFAULT 0");      // human-readable running ID
ensureColumn("card_requests", "period", "TEXT DEFAULT ''");    // tháng (YYYY-MM) của yêu cầu thẻ, theo tháng đơn hoạt động
ensureColumn("card_requests", "admin_note", "TEXT DEFAULT ''"); // note của Admin/người mua thẻ ở mục Mua thẻ
// Backfill period cho yêu cầu thẻ cũ (từ tháng tạo) để lọc theo tháng ở Mua thẻ.
db.exec("UPDATE card_requests SET period = strftime('%Y-%m', created_at/1000, 'unixepoch') WHERE (period IS NULL OR period='') AND created_at > 0");
// Backfill running IDs for card requests that don't have one yet.
{
  const todo = db.prepare("SELECT id FROM card_requests WHERE seq IS NULL OR seq=0 ORDER BY created_at").all();
  let next = (db.prepare("SELECT COALESCE(MAX(seq),0) m FROM card_requests").get().m) + 1;
  const up = db.prepare("UPDATE card_requests SET seq=? WHERE id=?");
  for (const r of todo) up.run(next++, r.id);
}

// Shipment tracking status (from AfterShip), keyed by tracking number.
db.exec(`
CREATE TABLE IF NOT EXISTS shipments (
  tracking_number TEXT PRIMARY KEY,
  slug       TEXT DEFAULT '',
  tag        TEXT DEFAULT '',      -- AfterShip status tag
  message    TEXT DEFAULT '',      -- last checkpoint message
  checked_at INTEGER DEFAULT 0,
  registered INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

// Payouts entered by Listing per eBay account (store).
db.exec(`
CREATE TABLE IF NOT EXISTS payouts (
  id         TEXT PRIMARY KEY,
  store      TEXT DEFAULT '',
  username   TEXT DEFAULT '',
  bank       TEXT DEFAULT '',
  amount     REAL DEFAULT 0,
  date       TEXT DEFAULT '',
  bank_name  TEXT DEFAULT '',
  note       TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payouts_store ON payouts(store);
`);

// Manually-entered business expenses. Two currencies tracked separately: VND | USDT.
db.exec(`
CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  date       TEXT DEFAULT '',
  category   TEXT DEFAULT '',
  currency   TEXT DEFAULT 'VND',   -- VND | USDT
  amount     REAL DEFAULT 0,
  note       TEXT DEFAULT '',
  kind       TEXT DEFAULT 'expense',   -- expense | profit
  created_by TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
`);
ensureColumn("expenses", "kind", "TEXT DEFAULT 'expense'");   // cho DB cũ

// Blacklist of difficult buyers (eBay usernames) — for Listing staff + Admin.
db.exec(`
CREATE TABLE IF NOT EXISTS blacklist (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  reason     TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blacklist_username ON blacklist(username);
`);

// Buổi làm việc — Admin bấm bắt đầu/kết thúc; thống kê thẻ + đơn xử lý trong khoảng đó.
db.exec(`
CREATE TABLE IF NOT EXISTS work_sessions (
  id             TEXT PRIMARY KEY,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER DEFAULT 0,
  started_by_name TEXT DEFAULT '',
  note           TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_worksessions_start ON work_sessions(started_at);
`);

// Số tiền còn hold trong tài khoản eBay — nhập tay, 1 dòng / store.
db.exec(`
CREATE TABLE IF NOT EXISTS store_holds (
  store           TEXT PRIMARY KEY,
  amount          REAL DEFAULT 0,
  note            TEXT DEFAULT '',
  updated_by_name TEXT DEFAULT '',
  updated_at      INTEGER DEFAULT 0
);
`);

// Task — Lister thêm hạng mục cần Admin kiểm tra; Admin thêm task theo dõi/xử lý case.
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  note           TEXT DEFAULT '',
  order_no       TEXT DEFAULT '',         -- mã order liên quan (rỗng = task tài khoản, không gắn đơn)
  priority       TEXT DEFAULT 'normal',   -- normal | high
  created_by     TEXT DEFAULT '',
  created_by_name TEXT DEFAULT '',
  response       TEXT DEFAULT '',         -- phản hồi của nhân viên xử lý đơn
  response_by_name TEXT DEFAULT '',
  response_at    INTEGER DEFAULT 0,
  done           INTEGER DEFAULT 0,
  done_by_name   TEXT DEFAULT '',
  done_at        INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
`);
ensureColumn("tasks", "order_no", "TEXT DEFAULT ''");
ensureColumn("tasks", "response", "TEXT DEFAULT ''");
ensureColumn("tasks", "response_by_name", "TEXT DEFAULT ''");
ensureColumn("tasks", "response_at", "INTEGER DEFAULT 0");
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_orderno ON tasks(order_no)");   // sau khi chắc chắn có cột order_no

// Proxy accounts — Admin thêm; nhân viên xử lý tự chọn "đang dùng", hiện tên cho mọi người.
db.exec(`
CREATE TABLE IF NOT EXISTS proxies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,          -- tài khoản/địa chỉ proxy
  note       TEXT DEFAULT '',
  admin_note TEXT DEFAULT '',        -- note nhân viên gửi cho Admin (mọi người sửa được)
  user_id    TEXT DEFAULT '',        -- người đang sử dụng
  user_name  TEXT DEFAULT '',
  used_at     INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);
ensureColumn("proxies", "admin_note", "TEXT DEFAULT ''");   // cho DB đã tạo bảng trước đó

// Sổ ghi Balance thẻ — cộng amount khi hàng đạt trạng thái "Đã xử lý"; KHÔNG bị trừ khi xóa hàng/xóa thẻ.
db.exec(`
CREATE TABLE IF NOT EXISTS card_ledger (
  purchase_id TEXT PRIMARY KEY,   -- mỗi hàng ghi 1 dòng khi "Đã xử lý"
  card        TEXT NOT NULL,
  amount      REAL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_ledger_card ON card_ledger(card);
`);
// Backfill: các hàng hiện đang "Đã xử lý" → ghi vào sổ (giữ balance đang có).
db.exec(`INSERT OR IGNORE INTO card_ledger (purchase_id,card,amount,created_at)
  SELECT id, card, amount, created_at FROM purchases WHERE card!='' AND trim(process_status)='Đã xử lý'`);

// Dọn đơn nhiều sản phẩm cũ: chép địa chỉ/SĐT/thời hạn từ dòng "tổng" sang các dòng sản phẩm,
// rồi XÓA dòng tổng trống (không sản phẩm & không có thẻ) — đó là dòng orphan không xử lý được.
if (!db.prepare("SELECT 1 FROM settings WHERE key='mergeMultiItemV1'").get()) {
  const groups = db.prepare("SELECT store, order_no FROM orders WHERE order_no!='' GROUP BY store, order_no HAVING COUNT(*)>1").all();
  const updInfo = db.prepare("UPDATE orders SET address=?, cust_phone=?, deadline=? WHERE id=?");
  const hasPur = db.prepare("SELECT 1 FROM purchases WHERE order_id=?");
  const delOrd = db.prepare("DELETE FROM orders WHERE id=?");
  const delAud = db.prepare("DELETE FROM audit_log WHERE order_id=?");
  db.transaction(() => {
    for (const g of groups) {
      const rows = db.prepare("SELECT * FROM orders WHERE store=? AND order_no=?").all(g.store, g.order_no);
      const products = rows.filter((r) => String(r.product || "").trim());
      if (!products.length) continue;   // chỉ xử lý cụm có ít nhất 1 dòng sản phẩm thật
      const pick = (f) => (rows.find((r) => String(r[f] || "").trim()) || {})[f] || "";
      const addr = pick("address"), phone = pick("cust_phone"), deadline = pick("deadline");
      for (const r of products) updInfo.run(r.address || addr, r.cust_phone || phone, r.deadline || deadline, r.id);
      for (const r of rows) if (!String(r.product || "").trim() && !hasPur.get(r.id)) { delOrd.run(r.id); delAud.run(r.id); }
    }
  })();
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run("mergeMultiItemV1", "true");
}

// Audit log — every cell edit on orders & purchases (who, field, old→new, when).
db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,        -- order | purchase
  entity_id  TEXT NOT NULL,
  order_id   TEXT DEFAULT '',      -- the order this change belongs to (fast lookup)
  field      TEXT NOT NULL,
  old_value  TEXT DEFAULT '',
  new_value  TEXT DEFAULT '',
  user_id    TEXT DEFAULT '',
  user_name  TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  undone     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_log(order_id);
`);
ensureColumn("audit_log", "undone", "INTEGER DEFAULT 0");   // cho DB cũ

// Sửa mốc chốt đơn (finalized_at) cho CHÍNH XÁC: lấy thời điểm đổi masterStatus sang
// trạng thái hiện tại từ audit_log. Backfill trước dùng updated_at nên sai khi đơn bị
// sửa sau lúc chốt → đơn của kỳ trước bị đếm nhầm sang kỳ sau trên Leaderboard.
if (!db.prepare("SELECT 1 FROM settings WHERE key='finalizedAtFixV2'").get()) {
  db.exec(`UPDATE orders SET finalized_at = COALESCE((
      SELECT MAX(a.created_at) FROM audit_log a
      WHERE a.order_id = orders.id AND a.entity='order' AND a.field='masterStatus'
        AND a.new_value = orders.master_status
    ), finalized_at)
    WHERE master_status IN ('Đã Up','Đã Cancel')`);
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run("finalizedAtFixV2", "true");
}

// Xin đơn — thành viên xin nhận đơn của thành viên khác; chủ đơn (hoặc Admin/Leader) duyệt.
db.exec(`
CREATE TABLE IF NOT EXISTS claim_requests (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL,
  requester_id   TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  owner_id       TEXT DEFAULT '',     -- chủ đơn tại thời điểm xin
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | canceled
  created_at     INTEGER NOT NULL,
  resolved_at    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_claimreq_order ON claim_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_claimreq_status ON claim_requests(status);
`);

// ── Seed defaults ────────────────────────────────────────────────────────────
function seedSetting(key, value) {
  if (!db.prepare("SELECT 1 FROM settings WHERE key=?").get(key))
    db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(key, JSON.stringify(value));
}
seedSetting("masterStatuses",  ["Đã Up", "Đã Cancel"]);
seedSetting("processStatuses", ["Đã xử lý", "Ped", "Có Tracking"]);
seedSetting("cardStatuses",    ["Chờ cấp", "Đã cấp", "Đã nhận", "Đã dùng", "Lỗi thẻ"]);
// Lý do khi đơn bị Cancel; failCancelReasons = các lý do tính vào "Fail rate" (lỗi NV).
seedSetting("cancelReasons",     ["Lỗi xử lý (NV)", "Khách hủy", "Hết hàng / hết size", "Lý do khác"]);
seedSetting("failCancelReasons", ["Lỗi xử lý (NV)"]);
// Số tháng giữ lại (ngoài tháng hiện tại) khi "Dọn dữ liệu cũ" — vd 2 = giữ tháng này + 2 tháng trước.
seedSetting("retentionMonths", 2);
// Card statuses that count toward Leaderboard "số thẻ".
seedSetting("cardCountStatuses", ["Live Bill", "Sai bill"]);   // nhóm "thẻ hợp lệ": tính số thẻ + khóa khi chọn
seedSetting("cardErrorStatuses", ["Lỗi thẻ"]);                  // nhóm "thẻ lỗi": không tính số thẻ
seedSetting("aftership", { enabled: false, keys: [] });   // keys: [apiKey, ...] (mỗi key ~50/tháng)
seedSetting("telegram",        { botToken: "", enabled: false });
// Active working month (new imports land here; "Chốt tháng" advances it).
const _d = new Date();
seedSetting("activeMonth", `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`);
// Backfill orders that predate the period column → put them in the active month.
{
  const am = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='activeMonth'").get().value);
  db.prepare("UPDATE orders SET period=? WHERE period='' OR period IS NULL").run(am);
}
// Row highlight colors (status name → light background). Master priority over process.
seedSetting("statusColors", {
  "Đã Up": "#e6f7ec", "Đã Cancel": "#fdeaea",
  "Đã xử lý": "#e8f0fe", "Ped": "#fef3e2", "Có Tracking": "#e6f7f4",
});

if (db.prepare("SELECT COUNT(*) c FROM teams").get().c === 0) {
  const now = Date.now();
  const ins = db.prepare("INSERT INTO teams (id,name,created_at) VALUES (?,?,?)");
  ins.run("team-tin", "Tín", now);
  ins.run("team-v3",  "V3",  now);
}

if (db.prepare("SELECT COUNT(*) c FROM users").get().c === 0) {
  db.prepare(`INSERT INTO users (id,name,email,password,role,team_ids,store_names,can_buy_card,active,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run("u-admin", "Admin", "admin@orderhub.local",
         bcrypt.hashSync("admin123", 10), "Admin", "[]", "[]", 1, 1, Date.now());
  console.log("[db] Seeded admin → admin@orderhub.local / admin123");
}

export default db;
