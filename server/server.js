// ─────────────────────────────────────────────────────────────────────────────
// Order Hub API server (Express + SQLite).
// Phase 1: auth, users, teams, settings. Later phases add orders/cards/notify.
// In production it also serves the built client from /dist.
// ─────────────────────────────────────────────────────────────────────────────
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import db from "./db.js";
import { fetchEbayImage } from "./ebayImage.js";
import {
  newId, createSession, destroySession, userFromReq,
  publicUser, requireAuth, requireAdmin, allowedStores,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 4000;

// ── Auth ────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!u || !u.active) return res.status(401).json({ error: "Email hoặc mật khẩu sai" });
  if (!bcrypt.compareSync(password, u.password))
    return res.status(401).json({ error: "Email hoặc mật khẩu sai" });
  const token = createSession(u.id);
  res.json({ token, user: publicUser(u) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const h = req.headers.authorization || "";
  destroySession(h.startsWith("Bearer ") ? h.slice(7) : "");
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json({ user: u });
});

// ── Users (Admin) ─────────────────────────────────────────────────────────────
app.get("/api/users", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at").all();
  res.json({ users: rows.map(publicUser) });
});

app.post("/api/users", requireAdmin, (req, res) => {
  const { name, email, password, role, teamIds, storeNames, canBuyCard, canMaster, mutedTeams } = req.body || {};
  const mail = String(email || "").trim().toLowerCase();
  if (!name || !mail || !password) return res.status(400).json({ error: "Thiếu tên / email / mật khẩu" });
  const dup = db.prepare("SELECT 1 FROM users WHERE email=?").get(mail);
  if (dup) return res.status(409).json({ error: "Email đã tồn tại" });
  const id = newId("u");
  db.prepare(`INSERT INTO users (id,name,email,password,role,team_ids,store_names,muted_teams,can_buy_card,can_master,active,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`)
    .run(id, name, mail, bcrypt.hashSync(String(password), 10),
         role || "Member", JSON.stringify(teamIds || []), JSON.stringify(storeNames || []),
         JSON.stringify(mutedTeams || []), (role === "Buyer" || canBuyCard) ? 1 : 0, canMaster ? 1 : 0, Date.now());
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)) });
});

app.put("/api/users/:id", requireAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "Không tìm thấy user" });
  const { name, role, teamIds, storeNames, canBuyCard, canMaster, active, password, mutedTeams } = req.body || {};
  db.prepare(`UPDATE users SET name=?, role=?, team_ids=?, store_names=?, muted_teams=?, can_buy_card=?, can_master=?, active=?,
              password=COALESCE(?, password) WHERE id=?`)
    .run(name ?? u.name, role ?? u.role, JSON.stringify(teamIds ?? JSON.parse(u.team_ids)),
         JSON.stringify(storeNames ?? JSON.parse(u.store_names || "[]")),
         JSON.stringify(mutedTeams ?? JSON.parse(u.muted_teams || "[]")),
         (role ?? u.role) === "Buyer" ? 1 : (canBuyCard != null ? (canBuyCard ? 1 : 0) : u.can_buy_card),
         canMaster != null ? (canMaster ? 1 : 0) : u.can_master,
         active != null ? (active ? 1 : 0) : u.active,
         password ? bcrypt.hashSync(String(password), 10) : null, u.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(u.id)) });
});

app.delete("/api/users/:id", requireAdmin, (req, res) => {
  if (req.params.id === "u-admin") return res.status(400).json({ error: "Không thể xóa Admin gốc" });
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Teams ─────────────────────────────────────────────────────────────────────
app.get("/api/teams", requireAuth, (req, res) => {
  res.json({ teams: db.prepare("SELECT * FROM teams ORDER BY created_at").all() });
});

app.post("/api/teams", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Thiếu tên team" });
  const id = newId("team");
  db.prepare("INSERT INTO teams (id,name,created_at) VALUES (?,?,?)").run(id, name, Date.now());
  res.json({ team: db.prepare("SELECT * FROM teams WHERE id=?").get(id) });
});

app.put("/api/teams/:id", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim();
  db.prepare("UPDATE teams SET name=? WHERE id=?").run(name, req.params.id);
  res.json({ team: db.prepare("SELECT * FROM teams WHERE id=?").get(req.params.id) });
});

app.delete("/api/teams/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM teams WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Settings (configurable status lists, telegram) ─────────────────────────────
app.get("/api/settings", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const out = {};
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  res.json({ settings: out });
});

app.put("/api/settings/:key", requireAdmin, (req, res) => {
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(req.params.key, JSON.stringify(req.body.value));
  res.json({ ok: true });
});

// ── Stores ────────────────────────────────────────────────────────────────────
const ensureStore = (name) => {
  if (name && !db.prepare("SELECT 1 FROM stores WHERE name=?").get(name))
    db.prepare("INSERT INTO stores (name,created_at) VALUES (?,?)").run(name, Date.now());
};
function canTouchStore(user, store) {
  if (user.role === "Admin") return true;
  if (user.role === "Lister") return (user.storeNames || []).includes(store);
  return false;
}
// Lister tự thêm store cho chính mình khi nhập liệu (import/đơn/payout).
// Chỉ cho tạo store MỚI (chưa tồn tại) → tránh chiếm store đã có của người khác.
function ensureStoreForUser(user, store) {
  if (canTouchStore(user, store)) return true;
  if (user.role !== "Lister" || !store) return false;
  if (db.prepare("SELECT 1 FROM stores WHERE name=?").get(store)) return false;   // store đã tồn tại → cần Admin gán
  db.prepare("INSERT INTO stores (name,created_at) VALUES (?,?)").run(store, Date.now());
  const row = db.prepare("SELECT store_names FROM users WHERE id=?").get(user.id);
  const list = JSON.parse(row?.store_names || "[]");
  if (!list.includes(store)) { list.push(store); db.prepare("UPDATE users SET store_names=? WHERE id=?").run(JSON.stringify(list), user.id); }
  user.storeNames = list;   // cập nhật cho request hiện tại
  return true;
}
// Ai được sửa ô trên Sheet Tổng: Admin/Lister (store) + Leader được cấp quyền Sheet Tổng.
const canEditMasterOrder = (user, o) => canTouchStore(user, o.store) || (user.role === "Leader" && user.canMaster);

app.get("/api/stores", requireAuth, (req, res) => {
  res.json({ stores: db.prepare("SELECT name FROM stores ORDER BY name").all().map((s) => s.name) });
});
app.post("/api/stores", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Thiếu tên store" });
  ensureStore(name);
  res.json({ ok: true });
});
app.delete("/api/stores/:name", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM stores WHERE name=?").run(req.params.name);
  res.json({ ok: true });
});

// ── Monthly periods ───────────────────────────────────────────────────────────
function getSetting(key, def) { const r = db.prepare("SELECT value FROM settings WHERE key=?").get(key); try { return r ? JSON.parse(r.value) : def; } catch { return def; } }
function setSetting(key, value) { db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value)); }
const getActiveMonth = () => getSetting("activeMonth", "");
function nextMonth(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m, 1);   // m is 1-based → index m = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Orders (master sheet) ─────────────────────────────────────────────────────
function orderOut(o) {
  return {
    id: o.id, orderNo: o.order_no || o.id, team: o.team, store: o.store, address: o.address, custPhone: o.cust_phone,
    qty: o.qty, product: o.product, image: o.image, link: o.link, size: o.size, color: o.color,
    profit: o.profit, deadline: o.deadline, masterStatus: o.master_status,
    masterNote: o.master_note, cancelReason: o.cancel_reason,
    claimedBy: o.claimed_by, claimedName: o.claimed_name, claimedAt: o.claimed_at,
    note1: o.note1, note2: o.note2, note3: o.note3, note4: o.note4,
    listedBy: o.listed_by, period: o.period, createdAt: o.created_at, updatedAt: o.updated_at,
  };
}

// eBay item number from a stored order (raw.itemNumber or parsed from link).
function itemNoOf(o) {
  try { const it = JSON.parse(o.raw || "{}").itemNumber; if (it) return String(it); } catch {}
  const m = String(o.link || "").match(/itm\/(\d{6,})/);
  return m ? m[1] : "";
}

// Background image fetch queue — throttled to avoid eBay rate-limiting.
const imgQueue = [];
let imgRunning = false;
function enqueueImage(orderId, itemNumber) {
  if (!itemNumber) return;
  imgQueue.push({ orderId, itemNumber });
  runImgQueue();
}
async function runImgQueue() {
  if (imgRunning) return;
  imgRunning = true;
  while (imgQueue.length) {
    const { orderId, itemNumber } = imgQueue.shift();
    const url = await fetchEbayImage(itemNumber);
    if (url) db.prepare("UPDATE orders SET image=?, updated_at=? WHERE id=?").run(url, Date.now(), orderId);
    await new Promise((r) => setTimeout(r, 700));
  }
  imgRunning = false;
}

// Master-sheet read: Admin = all; Lister = assigned stores; others = none here.
app.get("/api/orders", requireAuth, (req, res) => {
  const stores = allowedStores(req.user);
  if (stores !== null && stores.length === 0) return res.json({ orders: [] });
  const month = req.query.month || getActiveMonth();
  const conds = [], params = [];
  if (month && month !== "all") { conds.push("period=?"); params.push(month); }
  if (stores !== null) { conds.push(`store IN (${stores.map(() => "?").join(",")})`); params.push(...stores); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`).all(...params);
  // Sheet Tổng (Admin/Lister/Leader-master) là view quản lý → hiện đầy đủ read-back (tracking/order#/email…).
  res.json({ orders: rows.map((o) => ({ ...orderOut(o), purchases: purchasesOf(o.id, false) })) });
});

// Bulk import (eBay rows already parsed client-side). Store chosen at import time.
app.post("/api/orders/import", requireAuth, (req, res) => {
  const store = String(req.body.store || "").trim();
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!store) return res.status(400).json({ error: "Chưa chọn store" });
  if (!ensureStoreForUser(req.user, store)) return res.status(403).json({ error: "Store này đã tồn tại, nhờ Admin gán cho bạn" });
  ensureStore(store);
  const now = Date.now();
  const period = getActiveMonth();
  const stmt = db.prepare(`
    INSERT INTO orders (id,order_no,line_key,store,address,cust_phone,qty,product,image,link,size,color,profit,deadline,master_note,listed_by,raw,period,created_at,updated_at)
    VALUES (@id,@orderNo,@lineKey,@store,@address,@custPhone,@qty,@product,@image,@link,@size,@color,@profit,@deadline,@masterNote,@listedBy,@raw,@period,@now,@now)`);
  const existsLineKey = db.prepare("SELECT 1 FROM orders WHERE line_key=?");
  const existsId = db.prepare("SELECT 1 FROM orders WHERE id=?");
  let inserted = 0, duplicates = 0, skipped = 0;
  const seenInFile = new Set();
  const newIds = [];
  const tx = db.transaction((list) => {
    for (const r of list) {
      const orderNo = String(r.orderNumber || r.id || "").trim();
      if (!orderNo) { skipped++; continue; }
      const itemNo = r.raw && r.raw.itemNumber ? String(r.raw.itemNumber) : String(r.itemNumber || "");
      const variation = r.size || "";
      const lineKey = `${orderNo}||${itemNo}||${variation}`;     // unique per product line of an order
      if (seenInFile.has(lineKey)) { duplicates++; continue; }   // same line twice in this file
      seenInFile.add(lineKey);
      if (existsLineKey.get(lineKey)) { duplicates++; continue; } // this exact line already imported
      // Unique internal id: orderNo for the first line, orderNo-2/-3… for extra products.
      let id = orderNo, n = 2;
      while (existsId.get(id)) id = `${orderNo}-${n++}`;
      stmt.run({
        id, orderNo, lineKey, store, address: r.address || "", custPhone: r.custPhone || "", qty: String(r.qty || ""),
        product: r.product || "", image: "", link: r.link || "",
        size: variation, color: r.color || "", profit: Number(r.profit) || 0, deadline: r.deadline || "",
        masterNote: r.masterNote || "", listedBy: req.user.id,
        raw: JSON.stringify(r.raw || {}), period, now,
      });
      inserted++;
      if (itemNo) newIds.push({ id, it: itemNo });
    }
  });
  tx(rows);
  for (const { id, it } of newIds) enqueueImage(id, it);   // cover-image fetch for new orders only
  res.json({ ok: true, inserted, duplicates, skipped, total: rows.length });
});

// Fetch cover image for one order (manual refresh).
app.post("/api/orders/:id/fetch-image", requireAuth, async (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (!canEditMasterOrder(req.user, o)) return res.status(403).json({ error: "Không có quyền" });
  const url = await fetchEbayImage(itemNoOf(o));
  if (url) db.prepare("UPDATE orders SET image=?, updated_at=? WHERE id=?").run(url, Date.now(), o.id);
  res.json({ order: orderOut(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id)) });
});

// Queue image fetch for all visible orders missing an image.
app.post("/api/orders/fetch-images", requireAuth, (req, res) => {
  const stores = allowedStores(req.user);
  let rows;
  if (stores === null) rows = db.prepare("SELECT * FROM orders WHERE image=''").all();
  else if (!stores.length) rows = [];
  else {
    const ph = stores.map(() => "?").join(",");
    rows = db.prepare(`SELECT * FROM orders WHERE image='' AND store IN (${ph})`).all(...stores);
  }
  let queued = 0;
  for (const o of rows) { const it = itemNoOf(o); if (it) { enqueueImage(o.id, it); queued++; } }
  res.json({ queued });
});

// Manual add single order.
app.post("/api/orders", requireAuth, (req, res) => {
  const b = req.body || {};
  const store = String(b.store || "").trim();
  if (!ensureStoreForUser(req.user, store)) return res.status(403).json({ error: "Store này đã tồn tại, nhờ Admin gán cho bạn" });
  const id = String(b.id || "").trim();
  if (!id) return res.status(400).json({ error: "Thiếu ID Order" });
  if (db.prepare("SELECT 1 FROM orders WHERE id=?").get(id)) return res.status(409).json({ error: "ID Order đã tồn tại" });
  ensureStore(store);
  const now = Date.now();
  const itemNo = (String(b.link || "").match(/itm\/(\d{6,})/) || [])[1] || "";
  const lineKey = `${id}||${itemNo}||${b.size || ""}`;
  db.prepare(`INSERT INTO orders (id,order_no,line_key,store,address,cust_phone,qty,product,image,link,size,color,profit,deadline,listed_by,period,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, lineKey, store, b.address || "", b.custPhone || "", String(b.qty || ""), b.product || "",
         b.image || "", b.link || "", b.size || "", b.color || "", Number(b.profit) || 0,
         b.deadline || "", req.user.id, getActiveMonth(), now, now);
  res.json({ order: orderOut(db.prepare("SELECT * FROM orders WHERE id=?").get(id)) });
});

// Edit order fields (team change = Admin only).
app.put("/api/orders/:id", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (!canEditMasterOrder(req.user, o)) return res.status(403).json({ error: "Không có quyền" });
  const b = req.body || {};
  const map = {
    address: "address", custPhone: "cust_phone", qty: "qty", product: "product", image: "image",
    link: "link", size: "size", color: "color", profit: "profit", deadline: "deadline",
    masterStatus: "master_status", masterNote: "master_note", cancelReason: "cancel_reason",
    note1: "note1", note2: "note2", note3: "note3", note4: "note4",
  };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) if (k in b) {
    logChange(req.user, "order", o.id, o.id, k, o[col], b[k]);
    sets.push(`${col}=?`); vals.push(b[k]);
  }
  if ("team" in b) {
    if (req.user.role !== "Admin") return res.status(403).json({ error: "Chỉ Admin chia team" });
    logChange(req.user, "order", o.id, o.id, "team", o.team, b.team || "");
    sets.push("team=?"); vals.push(b.team || "");
  }
  if (sets.length) {
    sets.push("updated_at=?"); vals.push(Date.now());
    db.prepare(`UPDATE orders SET ${sets.join(",")} WHERE id=?`).run(...vals, o.id);
  }
  if ("deadline" in b) db.prepare("UPDATE orders SET overdue_notified=0 WHERE id=?").run(o.id);
  // Admin/Lister added or changed the master note → ping the order processor(s) to read it.
  if ("masterNote" in b && String(b.masterNote || "").trim() && String(b.masterNote) !== String(o.master_note || "")) {
    let targets = [];
    if (o.claimed_by) targets = [o.claimed_by];                       // claimed → just that person
    else if (o.team) {                                                // unclaimed → whole team's processors
      for (const usr of db.prepare("SELECT id, team_ids FROM users WHERE active=1 AND role IN ('Leader','Member')").all())
        if (JSON.parse(usr.team_ids || "[]").includes(o.team)) targets.push(usr.id);
    }
    if (targets.length)
      notify(targets, "master-note", `📝 Note đơn ${o.id} (${o.store}): ${String(b.masterNote).slice(0, 90)}`, "", o.team ? [o.team] : []);
  }
  res.json({ order: orderOut(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id)) });
});

// Divide selected orders to a team (Admin only).
app.post("/api/orders/divide", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const team = String(req.body.team || "");
  const now = Date.now();
  const getTeam = db.prepare("SELECT team FROM orders WHERE id=?");
  const stmt = db.prepare("UPDATE orders SET team=?, updated_at=? WHERE id=?");
  db.transaction((list) => { for (const id of list) { const cur = getTeam.get(id); if (cur) logChange(req.user, "order", id, id, "team", cur.team, team); stmt.run(team, now, id); } })(ids);
  res.json({ ok: true, count: ids.length });
});

app.delete("/api/orders/:id", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.json({ ok: true });
  if (!canTouchStore(req.user, o.store)) return res.status(403).json({ error: "Không có quyền" });
  db.prepare("DELETE FROM orders WHERE id=?").run(o.id);
  db.prepare("DELETE FROM audit_log WHERE order_id=?").run(o.id);
  res.json({ ok: true });
});

// Bulk-delete selected orders (Admin only). Purchases cascade via FK.
app.post("/api/orders/bulk-delete", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
  if (!ids.length) return res.json({ ok: true, deleted: 0 });
  const stmt = db.prepare("DELETE FROM orders WHERE id=?");
  const stmtAudit = db.prepare("DELETE FROM audit_log WHERE order_id=?");
  let deleted = 0;
  db.transaction((list) => { for (const id of list) { deleted += stmt.run(id).changes; stmtAudit.run(id); } })(ids);
  res.json({ ok: true, deleted });
});

// ── Dọn dữ liệu cũ (Admin) — xóa đơn + thẻ xử lý + yêu cầu thẻ của tháng quá hạn giữ ──
function subMonths(ym, n) {
  let [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  m -= n; while (m <= 0) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
const ymOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
// Tháng cũ hơn (period <) mốc này sẽ bị xóa. Giữ tháng hiện tại + retentionMonths tháng trước.
function cleanupCutoff() {
  const keep = Math.max(0, Number(getSetting("retentionMonths", 2)) || 0);
  return subMonths(getActiveMonth(), keep);
}
function oldCardRequestIds(cutoff) {
  return db.prepare("SELECT id, created_at FROM card_requests").all()
    .filter((r) => ymOf(r.created_at) < cutoff).map((r) => r.id);
}
// Xem trước số lượng sẽ xóa.
app.get("/api/cleanup-old", requireAdmin, (req, res) => {
  const cutoff = cleanupCutoff();
  const orders = db.prepare("SELECT COUNT(*) c FROM orders WHERE period!='' AND period < ?").get(cutoff).c;
  const cardRequests = oldCardRequestIds(cutoff).length;
  const months = db.prepare("SELECT DISTINCT period FROM orders WHERE period!='' AND period < ? ORDER BY period").all(cutoff).map((r) => r.period);
  res.json({ activeMonth: getActiveMonth(), retentionMonths: getSetting("retentionMonths", 2), cutoff, orders, cardRequests, months });
});
// Thực hiện xóa.
app.post("/api/cleanup-old", requireAdmin, (req, res) => {
  const cutoff = cleanupCutoff();
  const orderIds = db.prepare("SELECT id FROM orders WHERE period!='' AND period < ?").all(cutoff).map((o) => o.id);
  const reqIds = oldCardRequestIds(cutoff);
  const delAudit = db.prepare("DELETE FROM audit_log WHERE order_id=?");
  const delOrder = db.prepare("DELETE FROM orders WHERE id=?");      // purchases cascade via FK
  const delReq = db.prepare("DELETE FROM card_requests WHERE id=?");
  let ordersDeleted = 0, cardRequestsDeleted = 0;
  db.transaction(() => {
    for (const id of orderIds) { delAudit.run(id); delOrder.run(id); ordersDeleted++; }
    for (const id of reqIds) { delReq.run(id); cardRequestsDeleted++; }
  })();
  res.json({ ok: true, cutoff, ordersDeleted, cardRequestsDeleted });
});

// Edit history of an order's cells (+ its purchases). Anyone who can view the
// order sees full history (order + card edits). Người không phải Admin/người nhận
// vẫn xem được lịch sử thao tác trên thẻ, nhưng SỐ THẺ bị che để giữ riêng tư.
app.get("/api/orders/:id/history", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  const u = req.user;
  const canView = u.role === "Admin" || canTouchOrderTeam(u, o) || (u.role === "Lister" && (u.storeNames || []).includes(o.store));
  if (!canView) return res.status(403).json({ error: "Không có quyền" });
  let rows = db.prepare("SELECT * FROM audit_log WHERE order_id=? ORDER BY created_at DESC").all(o.id);
  if (!canSeePurchases(u, o)) {   // che số thẻ với người không phải Admin/người nhận (vẫn thấy "đã đổi thẻ")
    const mask = (v) => (v ? "••• (ẩn)" : v);
    rows = rows.map((r) => (r.entity === "purchase" && r.field === "card")
      ? { ...r, old_value: mask(r.old_value), new_value: mask(r.new_value) } : r);
  }
  res.json({ history: rows.map((r) => ({
    entity: r.entity, field: r.field, oldValue: r.old_value, newValue: r.new_value,
    userName: r.user_name, createdAt: r.created_at,
  })) });
});

// Hoàn tác thao tác sửa ô gần nhất CỦA CHÍNH MÌNH (đi lùi dần qua audit log).
const UNDO_ORDER_FIELDS = { size: ["size", "t"], color: ["color", "t"], profit: ["profit", "n"], deadline: ["deadline", "t"], masterStatus: ["master_status", "t"], masterNote: ["master_note", "t"], cancelReason: ["cancel_reason", "t"], team: ["team", "t"], note1: ["note1", "t"], note2: ["note2", "t"], note3: ["note3", "t"], note4: ["note4", "t"] };
const UNDO_PUR_FIELDS = { card: ["card", "t"], amount: ["amount", "n"], orderNumber: ["order_number", "t"], email: ["email", "t"], tracking: ["tracking", "t"], phone: ["phone", "t"], zip: ["zip", "t"], processStatus: ["process_status", "t"] };
app.post("/api/undo", requireAuth, (req, res) => {
  const fields = [...Object.keys(UNDO_ORDER_FIELDS), ...Object.keys(UNDO_PUR_FIELDS)];
  const ph = fields.map(() => "?").join(",");
  const e = db.prepare(`SELECT * FROM audit_log WHERE user_id=? AND undone=0 AND entity IN ('order','purchase') AND field IN (${ph}) ORDER BY created_at DESC LIMIT 1`).get(req.user.id, ...fields);
  if (!e) return res.json({ ok: false, message: "Không có thao tác nào để hoàn tác." });
  const map = e.entity === "order" ? UNDO_ORDER_FIELDS : UNDO_PUR_FIELDS;
  const def = map[e.field];
  if (!def) return res.json({ ok: false, message: "Không hoàn tác được thao tác này." });
  const [col, type] = def;
  const val = type === "n" ? (Number(e.old_value) || 0) : e.old_value;
  if (e.entity === "order") {
    if (!db.prepare("SELECT 1 FROM orders WHERE id=?").get(e.entity_id)) return res.json({ ok: false, message: "Đơn không còn tồn tại." });
    db.prepare(`UPDATE orders SET ${col}=?, updated_at=? WHERE id=?`).run(val, Date.now(), e.entity_id);
  } else {
    if (!db.prepare("SELECT 1 FROM purchases WHERE id=?").get(e.entity_id)) return res.json({ ok: false, message: "Thẻ không còn tồn tại." });
    db.prepare(`UPDATE purchases SET ${col}=? WHERE id=?`).run(val, e.entity_id);
  }
  // Ghi lại bản hoàn tác (đánh dấu undone=1 để không bị undo tiếp), và đánh dấu thao tác gốc đã hoàn tác.
  db.prepare(`INSERT INTO audit_log (id,entity,entity_id,order_id,field,old_value,new_value,user_id,user_name,created_at,undone)
              VALUES (?,?,?,?,?,?,?,?,?,?,1)`)
    .run(newId("aud"), e.entity, e.entity_id, e.order_id, e.field, e.new_value, e.old_value, req.user.id, req.user.name, Date.now());
  db.prepare("UPDATE audit_log SET undone=1 WHERE id=?").run(e.id);
  res.json({ ok: true, field: e.field, oldValue: e.old_value, newValue: e.new_value, orderId: e.order_id });
});

// ── Monthly periods: list + close month ───────────────────────────────────────
app.get("/api/months", requireAuth, (req, res) => {
  const months = db.prepare("SELECT DISTINCT period FROM orders WHERE period!='' ORDER BY period DESC").all().map((r) => r.period);
  const active = getActiveMonth();
  if (active && !months.includes(active)) months.unshift(active);
  const lc = getSetting("lastClose", null);
  res.json({ months, activeMonth: active, lastClose: lc ? { from: lc.from, to: lc.to } : null });
});

// Close the active month: carry unfinished orders (not Đã Up / Đã Cancel) into the
// next month; finished orders stay archived in the closed month. (Admin only)
app.post("/api/months/close", requireAdmin, (req, res) => {
  const from = getActiveMonth();
  if (!from) return res.status(400).json({ error: "Chưa có tháng hoạt động" });
  const to = nextMonth(from);
  const ids = db.prepare(
    "SELECT id FROM orders WHERE period=? AND master_status NOT IN ('Đã Up','Đã Cancel')").all(from).map((r) => r.id);
  const now = Date.now();
  for (const id of ids) db.prepare("UPDATE orders SET period=?, updated_at=? WHERE id=?").run(to, now, id);
  setSetting("activeMonth", to);
  setSetting("lastClose", { from, to, ids });   // remember for undo
  res.json({ ok: true, from, to, moved: ids.length });
});

// Undo the most recent close: move exactly those orders back + restore active month.
app.post("/api/months/undo-close", requireAdmin, (req, res) => {
  const lc = getSetting("lastClose", null);
  if (!lc) return res.status(400).json({ error: "Không có lần chốt nào để hoàn tác" });
  const now = Date.now();
  let restored = 0;
  for (const id of lc.ids || []) {
    // only move back orders still sitting in the closed-to month (not since re-changed)
    restored += db.prepare("UPDATE orders SET period=?, updated_at=? WHERE id=? AND period=?").run(lc.from, now, id, lc.to).changes;
  }
  setSetting("activeMonth", lc.from);
  setSetting("lastClose", null);
  res.json({ ok: true, restoredTo: lc.from, restored });
});

// Reopen a month: set it active + pull unfinished orders from the current active
// month back into it. Works regardless of close history. (Admin only)
app.post("/api/months/reopen", requireAdmin, (req, res) => {
  const target = String(req.body.month || "").trim();
  if (!target) return res.status(400).json({ error: "Thiếu tháng" });
  const active = getActiveMonth();
  let moved = 0;
  if (target !== active) {
    moved = db.prepare(
      "UPDATE orders SET period=?, updated_at=? WHERE period=? AND master_status NOT IN ('Đã Up','Đã Cancel')")
      .run(target, Date.now(), active, ).changes;
    setSetting("activeMonth", target);
    setSetting("lastClose", null);
  }
  res.json({ ok: true, target, from: active, moved });
});

// ── Sheet Con (team sheet): claim, notes, multi-card purchases ────────────────
function canTouchOrderTeam(user, order) {
  if (user.role === "Admin") return true;
  if (user.role === "Leader" || user.role === "Member")
    return !!order.team && (user.teamIds || []).includes(order.team);
  return false;
}
// A card is "valid" on an order only if it exists in the issued cards (Sheet Mua thẻ).
function cardExists(card) {
  return !!card && !!db.prepare("SELECT 1 FROM card_requests WHERE card_value=? LIMIT 1").get(card);
}
function purchaseOut(p, masked = false) {
  // Card/purchase details are private to the order's claimer — other teammates get a masked stub.
  if (masked) return { id: p.id, orderId: p.order_id, hidden: true };
  return {
    id: p.id, orderId: p.order_id, card: p.card, amount: p.amount,
    orderNumber: p.order_number, email: p.email, tracking: p.tracking,
    phone: p.phone, zip: p.zip, processStatus: p.process_status,
    cardValid: !p.card || cardExists(p.card), orderTime: p.order_time, hidden: false,
  };
}
const purchasesOf = (orderId, masked = false) =>
  db.prepare("SELECT * FROM purchases WHERE order_id=? ORDER BY created_at").all(orderId).map((p) => purchaseOut(p, masked));
// Who may see/own a purchase's card info: Admin or the person who claimed the order.
const canSeePurchases = (user, o) => !!user && (user.role === "Admin" || (!!o.claimed_by && o.claimed_by === user.id));
const orderFull = (o, user) => ({ ...orderOut(o), purchases: purchasesOf(o.id, !canSeePurchases(user, o)) });

// Record a single cell change (skips no-op edits). entity = order | purchase.
function logChange(user, entity, entityId, orderId, field, oldVal, newVal) {
  if (String(oldVal ?? "") === String(newVal ?? "")) return;
  db.prepare(`INSERT INTO audit_log (id,entity,entity_id,order_id,field,old_value,new_value,user_id,user_name,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(newId("aud"), entity, entityId, orderId, field, String(oldVal ?? ""), String(newVal ?? ""), user.id, user.name, Date.now());
}

// Team-scoped orders (Admin = all; Leader/Member = own teams' divided orders).
app.get("/api/team-orders", requireAuth, (req, res) => {
  const u = req.user;
  const month = req.query.month || getActiveMonth();
  const conds = [], params = [];
  if (month && month !== "all") { conds.push("period=?"); params.push(month); }
  if (u.role === "Admin") { /* all teams */ }
  else if (u.role === "Leader" || u.role === "Member") {
    const teams = u.teamIds || [];
    if (!teams.length) return res.json({ orders: [] });
    conds.push(`team IN (${teams.map(() => "?").join(",")})`); params.push(...teams);
    conds.push("team!=''");
  } else return res.json({ orders: [] });
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`).all(...params);
  res.json({ orders: rows.map((o) => orderFull(o, u)) });
});

// Employees a manager may distribute orders to (Admin = all; Leader = own teams).
app.get("/api/assignable-users", requireAuth, (req, res) => {
  const u = req.user;
  if (u.role !== "Admin" && u.role !== "Leader") return res.json({ users: [] });
  // Only order-processing roles can be assigned orders (exclude Lister / card Buyer).
  const all = db.prepare("SELECT id,name,role,team_ids FROM users WHERE active=1 AND role IN ('Admin','Leader','Member')").all()
    .map((x) => ({ id: x.id, name: x.name, role: x.role, teamIds: JSON.parse(x.team_ids || "[]") }));
  if (u.role === "Admin") return res.json({ users: all });
  const myTeams = new Set(u.teamIds || []);
  res.json({ users: all.filter((x) => (x.teamIds || []).some((t) => myTeams.has(t))) });
});

// Claim an order (lock name). Non-admin can't steal an already-claimed order.
// Admin may pass {userId} to assign to a specific member.
app.post("/api/orders/:id/claim", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (!canTouchOrderTeam(req.user, o)) return res.status(403).json({ error: "Không thuộc team của đơn" });
  let uid = req.user.id, uname = req.user.name;
  const isManager = req.user.role === "Admin" || req.user.role === "Leader";
  if (isManager && req.body && req.body.userId) {
    // Admin/Leader distributing the order to a specific employee.
    const tu = db.prepare("SELECT id,name,team_ids FROM users WHERE id=?").get(req.body.userId);
    if (!tu) return res.status(404).json({ error: "Không tìm thấy nhân viên" });
    if (req.user.role === "Leader" && !JSON.parse(tu.team_ids || "[]").includes(o.team))
      return res.status(403).json({ error: "Nhân viên không thuộc team của đơn" });
    uid = tu.id; uname = tu.name;
  } else if (o.claimed_by && !isManager) {
    return res.status(409).json({ error: "Đơn đã có người nhận" });
  }
  const now = Date.now();
  logChange(req.user, "order", o.id, o.id, "claimedBy", o.claimed_name, uname);
  db.prepare("UPDATE orders SET claimed_by=?, claimed_name=?, claimed_at=?, updated_at=? WHERE id=?")
    .run(uid, uname, now, now, o.id);
  res.json({ order: orderFull(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id), req.user) });
});

// Remove the claim (Admin = any; Leader = own team's orders).
app.post("/api/orders/:id/unclaim", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  const isManager = req.user.role === "Admin" || req.user.role === "Leader";
  if (!isManager || !canTouchOrderTeam(req.user, o))
    return res.status(403).json({ error: "Chỉ Admin hoặc Leader của team" });
  logChange(req.user, "order", o.id, o.id, "claimedBy", o.claimed_name, "");
  db.prepare("UPDATE orders SET claimed_by='', claimed_name='', claimed_at=0, updated_at=? WHERE id=?")
    .run(Date.now(), o.id);
  res.json({ order: orderFull(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id), req.user) });
});

// Order-level notes (team members).
app.put("/api/orders/:id/notes", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (!canTouchOrderTeam(req.user, o)) return res.status(403).json({ error: "Không có quyền" });
  const b = req.body || {};
  const sets = [], vals = [];
  for (const k of ["note1", "note2", "note3", "note4"]) if (k in b) { logChange(req.user, "order", o.id, o.id, k, o[k], b[k]); sets.push(`${k}=?`); vals.push(b[k]); }
  if (sets.length) {
    sets.push("updated_at=?"); vals.push(Date.now());
    db.prepare(`UPDATE orders SET ${sets.join(",")} WHERE id=?`).run(...vals, o.id);
  }
  res.json({ order: orderFull(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id), req.user) });
});

// Purchases (one per card used on the order).
app.post("/api/orders/:id/purchases", requireAuth, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "Không tìm thấy đơn" });
  if (!canSeePurchases(req.user, o)) return res.status(403).json({ error: "Chỉ người nhận đơn mới thêm thẻ" });
  const b = req.body || {};
  const id = newId("pur");
  db.prepare(`INSERT INTO purchases (id,order_id,card,amount,order_number,email,tracking,phone,zip,process_status,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, o.id, String(b.card || "").trim(), Number(b.amount) || 0, b.orderNumber || "", b.email || "",
         b.tracking || "", b.phone || "", b.zip || "", b.processStatus || "", Date.now());
  res.json({ purchase: purchaseOut(db.prepare("SELECT * FROM purchases WHERE id=?").get(id)) });
});

app.put("/api/purchases/:pid", requireAuth, (req, res) => {
  const p = db.prepare("SELECT * FROM purchases WHERE id=?").get(req.params.pid);
  if (!p) return res.status(404).json({ error: "Không tìm thấy thẻ" });
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(p.order_id);
  if (!canSeePurchases(req.user, o)) return res.status(403).json({ error: "Chỉ người nhận đơn mới sửa thẻ" });
  const b = req.body || {};
  const map = { card: "card", amount: "amount", orderNumber: "order_number", email: "email",
    tracking: "tracking", phone: "phone", zip: "zip", processStatus: "process_status" };
  // Must have a valid issued card before entering any other field.
  const effCard = ("card" in b) ? String(b.card || "") : p.card;
  const touchesOther = Object.keys(b).some((k) => k !== "card" && k in map);
  if (touchesOther && !(effCard && cardExists(effCard)))
    return res.status(400).json({ error: "Phải nhập thẻ đã cấp vào ô Thẻ trước khi nhập thông tin khác" });
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) if (k in b) {
    const nv = col === "amount" ? (Number(b[k]) || 0) : (k === "card" ? String(b[k] || "").trim() : b[k]);
    logChange(req.user, "purchase", p.id, p.order_id, k, p[col], nv);
    sets.push(`${col}=?`); vals.push(nv);
  }
  // stamp Time when the Order# value actually changes
  if ("orderNumber" in b && String(b.orderNumber) !== String(p.order_number || "")) { sets.push("order_time=?"); vals.push(Date.now()); }
  if (sets.length) db.prepare(`UPDATE purchases SET ${sets.join(",")} WHERE id=?`).run(...vals, p.id);
  // Notify the store's Lister(s) when an order gets a tracking (process status → "Có Tracking").
  if ("processStatus" in b && b.processStatus === "Có Tracking" && p.process_status !== "Có Tracking") {
    const listers = listersForStore(o.store);
    if (listers.length)
      notify(listers, "lister-tracking", `🚚 Đơn ${o.id} (${o.store}) đã có tracking — đã mua hàng.`);
  }
  res.json({ purchase: purchaseOut(db.prepare("SELECT * FROM purchases WHERE id=?").get(p.id)) });
});

app.delete("/api/purchases/:pid", requireAuth, (req, res) => {
  const p = db.prepare("SELECT * FROM purchases WHERE id=?").get(req.params.pid);
  if (!p) return res.json({ ok: true });
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(p.order_id);
  if (!canSeePurchases(req.user, o)) return res.status(403).json({ error: "Chỉ người nhận đơn mới xóa thẻ" });
  db.prepare("DELETE FROM purchases WHERE id=?").run(p.id);
  res.json({ ok: true });
});

// ── Notifications + Telegram ──────────────────────────────────────────────────
function getTelegram() {
  const row = db.prepare("SELECT value FROM settings WHERE key='telegram'").get();
  try { return row ? JSON.parse(row.value) : { botToken: "", enabled: false }; } catch { return { botToken: "", enabled: false }; }
}
async function sendTelegram(chatId, text) {
  const tg = getTelegram();
  if (!tg.enabled || !tg.botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {}
}
// Insert in-app notifications + push to Telegram for each target user.
// `teams` (id or array): the team(s) this notification concerns. A user who has
// muted ALL of those teams is skipped (both in-app + Telegram).
function notify(userIds, type, message, link = "", teams = []) {
  const now = Date.now();
  const teamList = (Array.isArray(teams) ? teams : [teams]).filter(Boolean);
  const ins = db.prepare("INSERT INTO notifications (id,user_id,type,message,link,read,created_at) VALUES (?,?,?,?,?,0,?)");
  for (const uid of [...new Set(userIds.filter(Boolean))]) {
    const u = db.prepare("SELECT telegram_chat_id, muted_teams FROM users WHERE id=?").get(uid);
    if (teamList.length && u) {
      const muted = JSON.parse(u.muted_teams || "[]");
      if (muted.length && teamList.every((t) => muted.includes(t))) continue;   // user muted this team
    }
    ins.run(newId("ntf"), uid, type, message, link, now);
    if (u && u.telegram_chat_id) sendTelegram(u.telegram_chat_id, message);
  }
}
// Team(s) a user belongs to (for tagging notifications by team).
const userTeams = (id) => { const r = db.prepare("SELECT team_ids FROM users WHERE id=?").get(id); return r ? JSON.parse(r.team_ids || "[]") : []; };
const adminIds = () => db.prepare("SELECT id FROM users WHERE active=1 AND role='Admin'").all().map((r) => r.id);
// Active Listers assigned to a given store (for store-scoped Lister notifications).
const listersForStore = (store) => {
  if (!store) return [];
  return db.prepare("SELECT id, store_names FROM users WHERE active=1 AND role='Lister'").all()
    .filter((u) => JSON.parse(u.store_names || "[]").includes(store)).map((u) => u.id);
};

// Set of user ids belonging to any of the given teams (for team-scoped card views).
function teammateIds(teamIds) {
  const set = new Set();
  if (!teamIds || !teamIds.length) return set;
  for (const u of db.prepare("SELECT id, team_ids FROM users").all()) {
    const t = JSON.parse(u.team_ids || "[]");
    if (teamIds.some((x) => t.includes(x))) set.add(u.id);
  }
  return set;
}
// Who to notify about a card request: all Admins + card-buyers sharing a team with
// the requester. (V3's buyer won't get Tín's requests; Admin always sees everything.)
function cardManagersForRequester(requesterId) {
  const r = db.prepare("SELECT team_ids FROM users WHERE id=?").get(requesterId);
  const reqTeams = r ? JSON.parse(r.team_ids || "[]") : [];
  const ids = [];
  for (const u of db.prepare("SELECT id, role, team_ids FROM users WHERE active=1 AND (role='Admin' OR can_buy_card=1)").all()) {
    if (u.role === "Admin") { ids.push(u.id); continue; }
    const t = JSON.parse(u.team_ids || "[]");
    if (reqTeams.some((x) => t.includes(x))) ids.push(u.id);
  }
  return ids;
}

// Thành viên đang online: hoạt động trong 2 phút gần đây.
app.get("/api/presence", requireAuth, (req, res) => {
  const cutoff = Date.now() - 120000;
  const rows = db.prepare("SELECT id,name,role,last_seen FROM users WHERE active=1 AND last_seen>=? ORDER BY name").all(cutoff);
  res.json({ count: rows.length, online: rows.map((u) => ({ id: u.id, name: u.name, role: u.role, lastSeen: u.last_seen })) });
});

app.get("/api/notifications", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
  const unread = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0").get(req.user.id).c;
  res.json({ unread, notifications: rows.map((n) => ({ id: n.id, type: n.type, message: n.message, link: n.link, read: !!n.read, createdAt: n.created_at })) });
});
app.post("/api/notifications/read", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(req.user.id);
  res.json({ ok: true });
});
app.post("/api/notifications/clear-read", requireAuth, (req, res) => {
  const r = db.prepare("DELETE FROM notifications WHERE user_id=? AND read=1").run(req.user.id);
  res.json({ ok: true, deleted: r.changes });
});
app.delete("/api/notifications/:id", requireAuth, (req, res) => {
  db.prepare("DELETE FROM notifications WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Telegram account linking (code-based).
const tgPending = new Map();   // code -> { userId, expires }
app.get("/api/telegram/status", requireAuth, (req, res) => {
  const u = db.prepare("SELECT telegram_chat_id FROM users WHERE id=?").get(req.user.id);
  const tg = getTelegram();
  res.json({ linked: !!(u && u.telegram_chat_id), enabled: !!(tg.enabled && tg.botToken) });
});
app.post("/api/telegram/start-link", requireAuth, async (req, res) => {
  const tg = getTelegram();
  if (!tg.enabled || !tg.botToken) return res.status(400).json({ error: "Admin chưa bật Telegram trong Cấu hình" });
  const code = "LINK-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  tgPending.set(code, { userId: req.user.id, expires: Date.now() + 10 * 60 * 1000 });
  let botUsername = "";
  try { const r = await (await fetch(`https://api.telegram.org/bot${tg.botToken}/getMe`)).json(); botUsername = r.result?.username || ""; } catch {}
  res.json({ code, botUsername });
});
app.post("/api/telegram/check-link", requireAuth, async (req, res) => {
  const tg = getTelegram();
  if (!tg.botToken) return res.status(400).json({ error: "Chưa cấu hình bot" });
  let myCode = null;
  for (const [code, info] of tgPending) if (info.userId === req.user.id && info.expires > Date.now()) myCode = code;
  if (!myCode) return res.status(400).json({ error: "Chưa bắt đầu liên kết hoặc đã hết hạn — bấm 'Bắt đầu' lại" });
  try {
    const upd = await (await fetch(`https://api.telegram.org/bot${tg.botToken}/getUpdates`)).json();
    const msgs = (upd.result || []).map((u) => u.message).filter(Boolean).reverse();
    const hit = msgs.find((m) => String(m.text || "").includes(myCode));
    if (!hit) return res.json({ linked: false });
    db.prepare("UPDATE users SET telegram_chat_id=? WHERE id=?").run(String(hit.chat.id), req.user.id);
    tgPending.delete(myCode);
    sendTelegram(String(hit.chat.id), "✅ Liên kết Order Hub thành công! Bạn sẽ nhận thông báo tại đây.");
    res.json({ linked: true });
  } catch { res.status(500).json({ error: "Lỗi gọi Telegram" }); }
});
app.post("/api/telegram/unlink", requireAuth, (req, res) => {
  db.prepare("UPDATE users SET telegram_chat_id='' WHERE id=?").run(req.user.id);
  res.json({ ok: true });
});

// Overdue check — notify assignee + admins once per order when past deadline (DD/MM).
function checkOverdue() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const orders = db.prepare(
    "SELECT * FROM orders WHERE overdue_notified=0 AND deadline!='' AND master_status NOT IN ('Đã Up','Đã Cancel')").all();
  for (const o of orders) {
    const m = String(o.deadline).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!m) continue;
    const day = +m[1], mon = +m[2];
    if (!day || !mon || mon > 12 || day > 31) continue;
    const dl = new Date(today.getFullYear(), mon - 1, day);
    if (dl < today) {
      // Oversight goes to the store's Lister(s); if the store has none, fall back to Admins.
      const listers = listersForStore(o.store);
      const oversight = listers.length ? listers : adminIds();
      notify([o.claimed_by, ...oversight], "overdue", `⏰ Đơn ${o.id} (${o.store}) đã QUÁ HẠN xử lý: ${o.deadline}`, "", o.team ? [o.team] : []);
      db.prepare("UPDATE orders SET overdue_notified=1 WHERE id=?").run(o.id);
    }
  }
}
setInterval(checkOverdue, 10 * 60 * 1000);
setTimeout(checkOverdue, 15000);

// ── Card system: requests (Sheet Yêu cầu) + issued cards (Sheet Mua thẻ) ──────
const COMPLETED_STATUS = "Đã Up";   // an order counts as completed at this master status

// Listing employees are restricted to the master sheet — no card access at all.
function blockLister(req, res, next) {
  if (req.user && req.user.role === "Lister") return res.status(403).json({ error: "Không có quyền truy cập thẻ" });
  next();
}

const cardCode = (seq) => "MT-" + String(seq || 0).padStart(4, "0");   // human-readable ID lệnh
function cardOut(r) {
  return {
    id: r.id, seq: r.seq, code: cardCode(r.seq), requesterId: r.requester_id, requesterName: r.requester_name,
    content: r.content, card: r.card_value, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
// Stats for an issued card: orders it paid for + completed count + profit share
// (profit split across cards by amount, counted only for "Đã Up" orders).
function cardStats(cardValue) {
  if (!cardValue) return { orders: [], profit: 0, completed: 0 };
  const purs = db.prepare(`
    SELECT p.amount AS amount, o.id AS oid, o.master_status AS master, o.profit AS profit
    FROM purchases p JOIN orders o ON o.id = p.order_id WHERE p.card = ?`).all(cardValue);
  const byOrder = {};
  for (const p of purs) {
    if (!byOrder[p.oid]) byOrder[p.oid] = { oid: p.oid, master: p.master, profit: p.profit || 0, mine: 0 };
    byOrder[p.oid].mine += p.amount || 0;
  }
  const orders = [], list = Object.values(byOrder);
  let profit = 0, completed = 0;
  for (const info of list) {
    orders.push(info.oid);
    if (info.master === COMPLETED_STATUS) {
      completed++;
      const total = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM purchases WHERE order_id=?").get(info.oid).s;
      profit += info.profit * (total > 0 ? info.mine / total : 1);
    }
  }
  return { orders, profit: Math.round(profit * 100) / 100, completed };
}
const cardOutFull = (r) => ({ ...cardOut(r), stats: cardStats(r.card_value) });
// card_value → earliest order period that used it ("first-used month"); robust to op order.
function cardFirstMonths() {
  const m = {};
  for (const r of db.prepare(
    "SELECT p.card AS card, MIN(o.period) AS fm FROM purchases p JOIN orders o ON o.id=p.order_id WHERE p.card!='' AND o.period!='' GROUP BY p.card").all())
    m[r.card] = r.fm;
  return m;
}

// List: managers (Admin / canBuyCard) see all + stats; employees see only their own.
app.get("/api/card-requests", requireAuth, blockLister, (req, res) => {
  const u = req.user;
  // Admin sees every team's requests.
  if (u.role === "Admin") {
    const rows = db.prepare("SELECT * FROM card_requests ORDER BY created_at DESC").all();
    return res.json({ requests: rows.map(cardOutFull), manager: true });
  }
  // Card-buyer: manager view but scoped to own team(s) — teammates' requests + own.
  if (u.canBuyCard) {
    const mates = teammateIds(u.teamIds);
    const rows = db.prepare("SELECT * FROM card_requests ORDER BY created_at DESC").all()
      .filter((r) => r.requester_id === u.id || mates.has(r.requester_id));
    return res.json({ requests: rows.map(cardOutFull), manager: true });
  }
  // Plain employee: only their own requests.
  const rows = db.prepare("SELECT * FROM card_requests WHERE requester_id=? ORDER BY created_at DESC").all(u.id);
  res.json({ requests: rows.map(cardOut), manager: false });
});

// Valid issued card values (for client-side validation in Sheet Con).
app.get("/api/card-values", requireAuth, blockLister, (req, res) => {
  res.json({ cards: db.prepare("SELECT DISTINCT card_value FROM card_requests WHERE card_value!=''").all().map((r) => r.card_value) });
});

// Employee creates a request.
app.post("/api/card-requests", requireAuth, blockLister, (req, res) => {
  const id = newId("req"), now = Date.now();
  // High-water-mark counter → ID lệnh never reused even after deletions (for reconciliation).
  const high = Math.max(db.prepare("SELECT COALESCE(MAX(seq),0) m FROM card_requests").get().m, getSetting("cardSeqHigh", 0));
  const seq = high + 1;
  setSetting("cardSeqHigh", seq);
  db.prepare(`INSERT INTO card_requests (id,requester_id,requester_name,content,card_value,status,seq,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, req.user.name, String(req.body.content || ""), "", "", seq, now, now);
  notify(cardManagersForRequester(req.user.id), "card-request", `🎴 Yêu cầu thẻ mới từ ${req.user.name}: ${String(req.body.content || "").slice(0, 80)}`, "", userTeams(req.user.id));
  res.json({ request: cardOut(db.prepare("SELECT * FROM card_requests WHERE id=?").get(id)) });
});

// Update: owner edits content/status; manager fills card + status.
app.put("/api/card-requests/:id", requireAuth, blockLister, (req, res) => {
  const r = db.prepare("SELECT * FROM card_requests WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  const u = req.user;
  const isManager = u.role === "Admin" || u.canBuyCard;
  const isOwner = r.requester_id === u.id;
  if (!isManager && !isOwner) return res.status(403).json({ error: "Không có quyền" });
  const b = req.body || {};
  // Chống gian lận: khi trạng thái hiện tại thuộc nhóm "thẻ hợp lệ" (vd Live/Sai bill) thì đã KHÓA —
  // nhân viên chỉ được đổi qua lại TRONG nhóm hợp lệ, không được chuyển sang nhóm khác (vd thẻ lỗi)
  // để né chỉ số đơn/thẻ. Nhóm thẻ lỗi/khác KHÔNG khóa (đổi sang hợp lệ thoải mái). Admin toàn quyền.
  if ("status" in b && u.role !== "Admin" && String(b.status) !== String(r.status || "")) {
    const validSet = new Set((getSetting("cardCountStatuses", ["Live Bill", "Sai bill"]) || []).map((s) => String(s).toLowerCase()));
    const curIsValid = validSet.has(String(r.status || "").toLowerCase());
    const newIsValid = validSet.has(String(b.status || "").toLowerCase());
    if (curIsValid && !newIsValid)
      return res.status(403).json({ error: "Thẻ hợp lệ đã khóa — chỉ đổi trong nhóm hợp lệ (Admin mới đổi khác)." });
  }
  const sets = [], vals = [];
  if ("content" in b && (isOwner || u.role === "Admin")) { sets.push("content=?"); vals.push(b.content); }
  if ("status" in b && (isOwner || isManager)) { sets.push("status=?"); vals.push(b.status); }
  if ("card" in b && isManager) { sets.push("card_value=?"); vals.push(String(b.card || "").trim()); }
  if (sets.length) { sets.push("updated_at=?"); vals.push(Date.now()); db.prepare(`UPDATE card_requests SET ${sets.join(",")} WHERE id=?`).run(...vals, r.id); }
  // notify: card issued → requester; status changed → card managers
  if ("card" in b && b.card && !r.card_value)
    notify([r.requester_id], "card-issued", `✅ Thẻ đã được cấp cho yêu cầu của bạn: ${b.card}`);
  if ("status" in b && b.status && b.status !== r.status)
    notify(cardManagersForRequester(r.requester_id), "card-status", `🔄 Trạng thái thẻ "${r.card_value || r.content || r.requester_name}" → ${b.status} (NV ${r.requester_name})`, "", userTeams(r.requester_id));
  const updated = db.prepare("SELECT * FROM card_requests WHERE id=?").get(r.id);
  res.json({ request: isManager ? cardOutFull(updated) : cardOut(updated) });
});

app.delete("/api/card-requests/:id", requireAuth, blockLister, (req, res) => {
  const r = db.prepare("SELECT * FROM card_requests WHERE id=?").get(req.params.id);
  if (!r) return res.json({ ok: true });
  if (r.requester_id !== req.user.id && req.user.role !== "Admin") return res.status(403).json({ error: "Không có quyền" });
  // Once a card has been issued, employees can't delete (kept for reconciliation).
  // Admin can always delete.
  if (r.card_value && req.user.role !== "Admin")
    return res.status(409).json({ error: "Đã cấp thẻ — không thể xóa (giữ lại để đối chiếu)" });
  db.prepare("DELETE FROM card_requests WHERE id=?").run(r.id);
  res.json({ ok: true });
});

// Team card stats (read-only) — teammates' card usage with the CARD VALUE HIDDEN.
app.get("/api/team-card-stats", requireAuth, (req, res) => {
  const u = req.user;
  if (!["Admin", "Leader", "Member"].includes(u.role)) return res.json({ items: [] });
  let filter = null;   // null = all (Admin); else set of teammate ids
  if (u.role !== "Admin") {
    const teams = u.teamIds || [];
    if (!teams.length) return res.json({ items: [] });
    const ids = db.prepare("SELECT id, team_ids FROM users").all()
      .filter((x) => JSON.parse(x.team_ids || "[]").some((t) => teams.includes(t))).map((x) => x.id);
    filter = new Set(ids);
  }
  const month = req.query.month || getActiveMonth();
  const countSet = new Set((getSetting("cardCountStatuses", ["Live Bill", "Sai bill"]) || []).map((s) => String(s).toLowerCase()));
  let rows = db.prepare("SELECT * FROM card_requests ORDER BY created_at DESC").all();
  if (filter) rows = rows.filter((r) => filter.has(r.requester_id));
  rows = rows.filter((r) => countSet.has(String(r.status || "").toLowerCase()));   // chỉ Live Bill / Sai bill
  // Hiển thị mọi thẻ Live/Sai bill, không phụ thuộc đã add vào Sheet Con: gắn theo tháng dùng-lần-đầu,
  // nếu chưa dùng thì theo tháng tạo yêu cầu.
  if (month && month !== "all") { const firstM = cardFirstMonths(); rows = rows.filter((r) => (firstM[r.card_value] || ymOf(r.created_at)) === month); }
  const items = rows.map((r) => ({
    id: r.id, code: cardCode(r.seq), content: r.content, requesterName: r.requester_name, status: r.status,
    hasCard: !!r.card_value, stats: cardStats(r.card_value),   // stats computed server-side; card value NOT sent
  }));
  res.json({ items });
});

// ── Payouts (per eBay account / store) ────────────────────────────────────────
function payoutOut(p) {
  return {
    id: p.id, store: p.store, username: p.username, bank: p.bank, amount: p.amount,
    date: p.date, bankName: p.bank_name, note: p.note, createdBy: p.created_by, createdAt: p.created_at,
  };
}
// Admin = all; Lister = own stores; others = none.
app.get("/api/payouts", requireAuth, (req, res) => {
  const stores = allowedStores(req.user);
  let rows;
  if (stores === null) rows = db.prepare("SELECT * FROM payouts ORDER BY date DESC, created_at DESC").all();
  else if (!stores.length) rows = [];
  else {
    const ph = stores.map(() => "?").join(",");
    rows = db.prepare(`SELECT * FROM payouts WHERE store IN (${ph}) ORDER BY date DESC, created_at DESC`).all(...stores);
  }
  res.json({ payouts: rows.map(payoutOut) });
});
app.post("/api/payouts", requireAuth, (req, res) => {
  const b = req.body || {};
  const store = String(b.store || "").trim();
  if (!store) return res.status(400).json({ error: "Chưa chọn tài khoản eBay (store)" });
  if (!ensureStoreForUser(req.user, store)) return res.status(403).json({ error: "Store này đã tồn tại, nhờ Admin gán cho bạn" });
  const id = newId("po");
  db.prepare(`INSERT INTO payouts (id,store,username,bank,amount,date,bank_name,note,created_by,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, store, b.username || "", b.bank || "", Number(b.amount) || 0, b.date || "", b.bankName || "", b.note || "", req.user.id, Date.now());
  res.json({ payout: payoutOut(db.prepare("SELECT * FROM payouts WHERE id=?").get(id)) });
});
app.put("/api/payouts/:id", requireAuth, (req, res) => {
  const p = db.prepare("SELECT * FROM payouts WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Không tìm thấy payout" });
  if (!canTouchStore(req.user, p.store)) return res.status(403).json({ error: "Không có quyền" });
  const b = req.body || {};
  if ("store" in b && !canTouchStore(req.user, String(b.store))) return res.status(403).json({ error: "Không có quyền với store mới" });
  const map = { store: "store", username: "username", bank: "bank", amount: "amount", date: "date", bankName: "bank_name", note: "note" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) if (k in b) { sets.push(`${col}=?`); vals.push(col === "amount" ? (Number(b[k]) || 0) : b[k]); }
  if (sets.length) db.prepare(`UPDATE payouts SET ${sets.join(",")} WHERE id=?`).run(...vals, p.id);
  res.json({ payout: payoutOut(db.prepare("SELECT * FROM payouts WHERE id=?").get(p.id)) });
});
app.delete("/api/payouts/:id", requireAuth, (req, res) => {
  const p = db.prepare("SELECT * FROM payouts WHERE id=?").get(req.params.id);
  if (!p) return res.json({ ok: true });
  if (!canTouchStore(req.user, p.store)) return res.status(403).json({ error: "Không có quyền" });
  db.prepare("DELETE FROM payouts WHERE id=?").run(p.id);
  res.json({ ok: true });
});

// ── Expenses (manual cost entries, Admin only) ────────────────────────────────
// Two currencies kept separate: VND | USDT. Categories are free text (suggested
// from teams + a few defaults on the client).
function expenseOut(e) {
  return {
    id: e.id, date: e.date, category: e.category, currency: e.currency,
    amount: e.amount, note: e.note, kind: e.kind || "expense",
    createdBy: e.created_by, createdAt: e.created_at,
  };
}
const EXP_CURRENCIES = ["VND", "USDT", "USD"];
const EXP_KINDS = ["expense", "profit"];
app.get("/api/expenses", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM expenses ORDER BY date DESC, created_at DESC").all();
  res.json({ expenses: rows.map(expenseOut) });
});
app.post("/api/expenses", requireAdmin, (req, res) => {
  const b = req.body || {};
  const currency = EXP_CURRENCIES.includes(b.currency) ? b.currency : "VND";
  const kind = EXP_KINDS.includes(b.kind) ? b.kind : "expense";
  const amount = Number(b.amount) || 0;
  if (amount <= 0) return res.status(400).json({ error: "Nhập số tiền hợp lệ" });
  const id = newId("exp");
  db.prepare(`INSERT INTO expenses (id,date,category,currency,amount,note,kind,created_by,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, b.date || "", String(b.category || "").trim(), currency, amount, b.note || "", kind, req.user.id, Date.now());
  res.json({ expense: expenseOut(db.prepare("SELECT * FROM expenses WHERE id=?").get(id)) });
});
app.put("/api/expenses/:id", requireAdmin, (req, res) => {
  const e = db.prepare("SELECT * FROM expenses WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "Không tìm thấy khoản chi" });
  const b = req.body || {};
  const map = { date: "date", category: "category", currency: "currency", amount: "amount", note: "note", kind: "kind" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) if (k in b) {
    let v = b[k];
    if (col === "amount") v = Number(v) || 0;
    if (col === "currency") v = EXP_CURRENCIES.includes(v) ? v : "VND";
    if (col === "kind") v = EXP_KINDS.includes(v) ? v : "expense";
    sets.push(`${col}=?`); vals.push(v);
  }
  if (sets.length) db.prepare(`UPDATE expenses SET ${sets.join(",")} WHERE id=?`).run(...vals, e.id);
  res.json({ expense: expenseOut(db.prepare("SELECT * FROM expenses WHERE id=?").get(e.id)) });
});
app.delete("/api/expenses/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM expenses WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Blacklist (difficult buyers, eBay usernames) — Admin + Lister ─────────────
function adminOrLister(req, res, next) {
  if (req.user.role !== "Admin" && req.user.role !== "Lister")
    return res.status(403).json({ error: "Không có quyền truy cập danh sách đen" });
  next();
}
app.get("/api/blacklist", requireAuth, adminOrLister, (req, res) => {
  const names = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  const rows = db.prepare("SELECT * FROM blacklist ORDER BY created_at DESC").all();
  res.json({ blacklist: rows.map((b) => ({
    id: b.id, username: b.username, reason: b.reason,
    createdBy: b.created_by, createdByName: names[b.created_by] || "—", createdAt: b.created_at,
  })) });
});
app.post("/api/blacklist", requireAuth, adminOrLister, (req, res) => {
  const username = String(req.body.username || "").trim();
  if (!username) return res.status(400).json({ error: "Thiếu username khách hàng" });
  if (db.prepare("SELECT id FROM blacklist WHERE LOWER(username)=LOWER(?)").get(username))
    return res.status(409).json({ error: "Username đã có trong danh sách đen" });
  const id = newId("bl");
  db.prepare("INSERT INTO blacklist (id,username,reason,created_by,created_at) VALUES (?,?,?,?,?)")
    .run(id, username, String(req.body.reason || ""), req.user.id, Date.now());
  res.json({ ok: true, id });
});
app.put("/api/blacklist/:id", requireAuth, adminOrLister, (req, res) => {
  const b = db.prepare("SELECT * FROM blacklist WHERE id=?").get(req.params.id);
  if (!b) return res.status(404).json({ error: "Không tìm thấy" });
  const body = req.body || {};
  const sets = [], vals = [];
  if ("username" in body) {
    const un = String(body.username || "").trim();
    if (!un) return res.status(400).json({ error: "Username trống" });
    const dup = db.prepare("SELECT id FROM blacklist WHERE LOWER(username)=LOWER(?) AND id!=?").get(un, b.id);
    if (dup) return res.status(409).json({ error: "Username đã tồn tại" });
    sets.push("username=?"); vals.push(un);
  }
  if ("reason" in body) { sets.push("reason=?"); vals.push(String(body.reason || "")); }
  if (sets.length) db.prepare(`UPDATE blacklist SET ${sets.join(",")} WHERE id=?`).run(...vals, b.id);
  res.json({ ok: true });
});
app.delete("/api/blacklist/:id", requireAuth, adminOrLister, (req, res) => {
  db.prepare("DELETE FROM blacklist WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Leaderboard: rank order-processing members ────────────────────────────────
// Metrics per member (by orders they claimed): số đơn, số thẻ dùng, đơn/thẻ,
// profit (đơn Đã Up), profit/thẻ. Visible to all order-processing roles.
app.get("/api/leaderboard", requireAuth, (req, res) => {
  const month = req.query.month || getActiveMonth();
  const nameById = Object.fromEntries(db.prepare("SELECT id,name FROM users").all().map((u) => [u.id, u.name]));
  const firstM = cardFirstMonths();
  const countSet = new Set((getSetting("cardCountStatuses", ["Live Bill", "Sai bill"]) || []).map((s) => String(s).toLowerCase()));

  // Đã Up orders, scoped to the selected month
  const orders = (month && month !== "all")
    ? db.prepare("SELECT id, claimed_by, claimed_name, profit FROM orders WHERE claimed_by!='' AND master_status='Đã Up' AND period=?").all(month)
    : db.prepare("SELECT id, claimed_by, claimed_name, profit FROM orders WHERE claimed_by!='' AND master_status='Đã Up'").all();

  // Cancelled orders (for Fail rate). failSet = reasons that count as processor fault.
  const failSet = new Set((getSetting("failCancelReasons", ["Lỗi xử lý (NV)"]) || []).map((s) => String(s).toLowerCase()));
  const cancels = (month && month !== "all")
    ? db.prepare("SELECT claimed_by, claimed_name, cancel_reason FROM orders WHERE claimed_by!='' AND master_status='Đã Cancel' AND period=?").all(month)
    : db.prepare("SELECT claimed_by, claimed_name, cancel_reason FROM orders WHERE claimed_by!='' AND master_status='Đã Cancel'").all();

  const mkUser = (id, name) => ({ id, name: nameById[id] || name || "—", orders: 0, profit: 0, cardSet: new Set(), cancels: 0, failCancels: 0 });
  const byUser = {};
  for (const o of orders) {
    const u = byUser[o.claimed_by] || (byUser[o.claimed_by] = mkUser(o.claimed_by, o.claimed_name));
    u.orders++; u.profit += o.profit || 0;
  }
  for (const o of cancels) {
    const u = byUser[o.claimed_by] || (byUser[o.claimed_by] = mkUser(o.claimed_by, o.claimed_name));
    u.cancels++;
    if (o.cancel_reason && failSet.has(String(o.cancel_reason).toLowerCase())) u.failCancels++;
  }
  // Số thẻ = TẤT CẢ thẻ NV được cấp ở Mua thẻ (theo người yêu cầu) có trạng thái HỢP LỆ
  // (Live Bill / Sai bill). Gắn vào tháng dùng-lần-đầu (hoặc tháng tạo yêu cầu nếu chưa dùng).
  // KHÔNG phụ thuộc việc gán thẻ vào Sheet Con.
  for (const c of db.prepare("SELECT requester_id, requester_name, card_value, status, created_at FROM card_requests WHERE card_value!=''").all()) {
    if (!countSet.has(String(c.status || "").toLowerCase())) continue;
    const cm = firstM[c.card_value] || ymOf(c.created_at);
    if (month !== "all" && cm !== month) continue;
    const u = byUser[c.requester_id] || (byUser[c.requester_id] = mkUser(c.requester_id, c.requester_name));
    u.cardSet.add(c.card_value);
  }
  const round = (n) => Math.round(n * 100) / 100;
  const rows = Object.values(byUser).map((u) => {
    const cards = u.cardSet.size;
    const handled = u.orders + u.cancels;   // tổng đơn đã chốt (Đã Up + Đã Cancel)
    return {
      id: u.id, name: u.name, orders: u.orders, cards, profit: round(u.profit),
      ordersPerCard: cards ? round(u.orders / cards) : 0,
      profitPerCard: cards ? round(u.profit / cards) : 0,
      failCancels: u.failCancels, handled,
      failRate: handled ? round((100 * u.failCancels) / handled) : 0,
    };
  });
  rows.sort((a, b) => b.orders - a.orders);
  res.json({ leaderboard: rows });
});

// ── Tracking (AfterShip) ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getAftership = () => {
  const c = getSetting("aftership", {});
  const keys = Array.isArray(c.keys) ? c.keys.filter(Boolean) : (c.apiKey ? [c.apiKey] : []);
  return { enabled: !!c.enabled, keys };
};
const FREE_LIMIT = 50;   // AfterShip free shipments / account / month
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const keyUsage = (key) => db.prepare("SELECT COUNT(*) c FROM shipments WHERE account=? AND created_at>=?").get(key, monthStart()).c;
function pickKey(keys) {   // least-used key still under the monthly limit
  let best = null, bestU = Infinity;
  for (const k of keys) { const u = keyUsage(k); if (u < FREE_LIMIT && u < bestU) { best = k; bestU = u; } }
  return best;
}

async function asRegister(tn, key) {                  // register a tracking on a specific key (uses 1 quota)
  try {
    const r = await fetch("https://api.aftership.com/v4/trackings", {
      method: "POST", headers: { "aftership-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ tracking: { tracking_number: tn } }),
    });
    const d = await r.json().catch(() => ({}));
    const code = d && d.meta && d.meta.code;
    const t = d && d.data && d.data.tracking;
    if (t) return { ok: true, slug: t.slug || "", tag: t.tag || "Pending" };
    if (code === 4003) return { ok: false, exists: true };   // already exists under THIS key
    if (r.status === 402 || r.status === 429 || code === 4101 || code === 4102) return { ok: false, exhausted: true };
    return { ok: false };
  } catch { return { ok: false }; }
}
// Try keys least-used-first; on quota/error rotate to the next key.
async function registerWithRotation(tn, keys) {
  const cands = keys.map((k) => ({ k, u: keyUsage(k) })).filter((x) => x.u < FREE_LIMIT)
    .sort((a, b) => a.u - b.u).map((x) => x.k);
  for (const key of cands) {
    const reg = await asRegister(tn, key);
    if (reg.ok) return { slug: reg.slug, tag: reg.tag, account: key };
    if (reg.exists) return { slug: "", tag: "Pending", account: key };
    await sleep(250);   // exhausted / error → rotate to next key
  }
  return null;          // all keys full or failed
}
async function asStatus(slug, tn, key) {               // poll status (no quota cost)
  if (!key) return null;
  try {
    const url = slug
      ? `https://api.aftership.com/v4/trackings/${slug}/${encodeURIComponent(tn)}`
      : `https://api.aftership.com/v4/trackings?keyword=${encodeURIComponent(tn)}`;
    const r = await fetch(url, { headers: { "aftership-api-key": key } });
    const d = await r.json().catch(() => ({}));
    const t = slug ? (d.data && d.data.tracking) : (d.data && d.data.trackings && d.data.trackings[0]);
    if (!t) return null;
    const cp = t.checkpoints || [];
    return { slug: t.slug || slug, tag: t.tag || "", message: cp.length ? (cp[cp.length - 1].message || "") : "" };
  } catch { return null; }
}

// Register new tracking numbers (distributed across keys) + refresh non-delivered ones.
let trackingBusy = false;
async function refreshTrackings() {
  const cfg = getAftership();
  if (!cfg.enabled || !cfg.keys.length || trackingBusy) return;
  trackingBusy = true;
  try {
    const tns = [...new Set(db.prepare(
      "SELECT DISTINCT p.tracking AS t FROM purchases p JOIN orders o ON o.id=p.order_id WHERE p.tracking!='' AND o.master_status='Đã Up'")
      .all().map((r) => r.t))];
    for (const tn of tns) {
      let sh = db.prepare("SELECT * FROM shipments WHERE tracking_number=?").get(tn);
      if (!sh) {
        const reg = await registerWithRotation(tn, cfg.keys);
        if (!reg) continue;                           // all keys full/failed → retry next run
        db.prepare("INSERT OR IGNORE INTO shipments (tracking_number,slug,tag,message,checked_at,registered,account,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(tn, reg.slug, reg.tag, "", Date.now(), 1, reg.account, Date.now());
        sh = db.prepare("SELECT * FROM shipments WHERE tracking_number=?").get(tn);
        await sleep(350);
      }
      if (sh && sh.tag !== "Delivered" && sh.account) {
        const st = await asStatus(sh.slug, tn, sh.account);
        if (st) db.prepare("UPDATE shipments SET slug=?, tag=?, message=?, checked_at=?, registered=1 WHERE tracking_number=?")
          .run(st.slug || sh.slug, st.tag || sh.tag, st.message || sh.message, Date.now(), tn);
        await sleep(350);
      }
    }
  } finally { trackingBusy = false; }
}
setInterval(() => refreshTrackings().catch(() => {}), 3 * 60 * 60 * 1000);   // every 3h
setTimeout(() => refreshTrackings().catch(() => {}), 20000);

// Tracking list for the current user (Admin = all Đã Up; Leader/Member = own teams).
app.get("/api/tracking", requireAuth, (req, res) => {
  const u = req.user;
  const cfg = getAftership();
  const meta = {
    aftership: cfg.enabled && cfg.keys.length > 0,
    quota: { keys: cfg.keys.length, limit: cfg.keys.length * FREE_LIMIT, used: cfg.keys.reduce((s, k) => s + keyUsage(k), 0) },
  };
  let orders;
  if (u.role === "Admin") orders = db.prepare("SELECT id,store,team FROM orders WHERE master_status='Đã Up'").all();
  else if (u.role === "Leader" || u.role === "Member") {
    const t = u.teamIds || [];
    if (!t.length) return res.json({ items: [], ...meta });
    const ph = t.map(() => "?").join(",");
    orders = db.prepare(`SELECT id,store,team FROM orders WHERE master_status='Đã Up' AND team IN (${ph})`).all(...t);
  } else return res.json({ items: [], ...meta });

  const oMap = Object.fromEntries(orders.map((o) => [o.id, o]));
  const ids = orders.map((o) => o.id);
  if (!ids.length) return res.json({ items: [], ...meta });
  const ph = ids.map(() => "?").join(",");
  const purs = db.prepare(`SELECT order_id, tracking, order_number FROM purchases WHERE tracking!='' AND order_id IN (${ph})`).all(...ids);
  const items = purs.map((p) => {
    const sh = db.prepare("SELECT * FROM shipments WHERE tracking_number=?").get(p.tracking);
    const o = oMap[p.order_id];
    return {
      trackingNumber: p.tracking, orderId: p.order_id, store: o.store, orderNumber: p.order_number,
      tag: sh ? sh.tag : "", message: sh ? sh.message : "", checkedAt: sh ? sh.checked_at : 0,
    };
  });
  res.json({ items, ...meta });
});

app.post("/api/tracking/refresh", requireAuth, async (req, res) => {
  const c = getAftership();
  if (!c.enabled || !c.keys.length) return res.status(400).json({ error: "Admin chưa cấu hình AfterShip (cần ít nhất 1 API key)" });
  await refreshTrackings();
  res.json({ ok: true });
});

// ── Serve built client in production ──────────────────────────────────────────
const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, () => console.log(`[order-hub] API on http://localhost:${PORT}`));
