// Authentication helpers: token sessions + role guards.
import crypto from "crypto";
import db from "./db.js";

export function newId(prefix = "id") {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)")
    .run(token, userId, Date.now());
  return token;
}

export function destroySession(token) {
  db.prepare("DELETE FROM sessions WHERE token=?").run(token);
}

// Returns the user row for a request, or null. Strips password hash.
export function userFromReq(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const sess = db.prepare("SELECT user_id FROM sessions WHERE token=?").get(token);
  if (!sess) return null;
  const u = db.prepare("SELECT * FROM users WHERE id=? AND active=1").get(sess.user_id);
  if (!u) return null;
  return publicUser(u);
}

export function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    teamIds: JSON.parse(u.team_ids || "[]"),
    storeNames: JSON.parse(u.store_names || "[]"),
    mutedTeams: JSON.parse(u.muted_teams || "[]"),
    canBuyCard: !!u.can_buy_card, canMaster: !!u.can_master, active: !!u.active,
  };
}

// Which stores can this user touch on the master sheet?
// Admin = all (null = no filter). Lister = assigned stores. Others = none.
export function allowedStores(user) {
  if (user.role === "Admin") return null;          // null → all
  if (user.role === "Leader" && user.canMaster) return null;   // Leader được cấp quyền Sheet Tổng → xem tất cả
  if (user.role === "Lister") return user.storeNames || [];
  return [];                                        // no master-sheet access
}

// Express middleware factory.
export function requireAuth(req, res, next) {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: "Chưa đăng nhập" });
  req.user = u;
  next();
}

export function requireAdmin(req, res, next) {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: "Chưa đăng nhập" });
  if (u.role !== "Admin") return res.status(403).json({ error: "Chỉ Admin" });
  req.user = u;
  next();
}
