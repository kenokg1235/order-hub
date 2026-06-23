import React, { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import { Button } from "./ui.jsx";
import Notifications from "./Notifications.jsx";
import Presence from "./Presence.jsx";
import Login from "./pages/Login.jsx";
import Users from "./pages/Users.jsx";
import Teams from "./pages/Teams.jsx";
import Settings from "./pages/Settings.jsx";
import Master from "./pages/Master.jsx";
import TeamSheet from "./pages/TeamSheet.jsx";
import Requests from "./pages/Requests.jsx";
import Cards from "./pages/Cards.jsx";
import CardStats from "./pages/CardStats.jsx";
import Stores from "./pages/Stores.jsx";
import Payout from "./pages/Payout.jsx";
import Expenses from "./pages/Expenses.jsx";
import Blacklist from "./pages/Blacklist.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Tracking from "./pages/Tracking.jsx";
import Placeholder from "./pages/Placeholder.jsx";

// Nav model. `access(user)` decides visibility. Phase 1 wires the SYSTEM group;
// order/card pages are placeholders until their phases land.
const NAV = [
  { group: "ĐƠN HÀNG", items: [
    { id: "master",  icon: "📊", label: "Sheet Tổng",   access: (u) => u.role === "Admin" || u.role === "Lister" || (u.role === "Leader" && u.canMaster) },
    { id: "blacklist", icon: "⛔", label: "Danh sách đen", access: (u) => u.role === "Admin" || u.role === "Lister" },
    { id: "team",    icon: "📄", label: "Sheet Con",    access: (u) => ["Admin", "Leader", "Member"].includes(u.role) },
    { id: "tracking",    icon: "🚚", label: "Tracking",    access: (u) => ["Admin", "Leader", "Member"].includes(u.role) },
    { id: "leaderboard", icon: "🏆", label: "Leaderboard", access: (u) => ["Admin", "Leader", "Member"].includes(u.role) },
  ]},
  { group: "FINANCE", items: [
    { id: "payout",  icon: "💰", label: "Payout",       access: (u) => u.role === "Admin" || u.role === "Lister" },
    { id: "expenses", icon: "💸", label: "Thống kê chi phí", access: (u) => u.role === "Admin" },
  ]},
  { group: "THẺ", items: [
    // Lister is restricted to Sheet Tổng only — no card section.
    { id: "requests", icon: "✍️", label: "Yêu cầu thẻ",  access: (u) => u.role !== "Lister" },
    { id: "cards",    icon: "🎴", label: "Mua thẻ",      access: (u) => u.role !== "Lister" && (u.role === "Admin" || u.role === "Buyer" || u.canBuyCard) },
    { id: "card-stats", icon: "📊", label: "Thống kê thẻ", access: (u) => ["Admin", "Leader", "Member"].includes(u.role) },
  ]},
  { group: "HỆ THỐNG", items: [
    { id: "users",    icon: "🔐", label: "Người dùng",   access: (u) => u.role === "Admin" },
    { id: "teams",    icon: "👥", label: "Teams",        access: (u) => u.role === "Admin" },
    { id: "stores",   icon: "🏪", label: "Stores",       access: (u) => u.role === "Admin" },
    { id: "settings", icon: "⚙️", label: "Cấu hình",     access: (u) => u.role === "Admin" },
  ]},
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("team");
  const [teams, setTeams] = useState([]);

  async function loadTeams() {
    try { setTeams((await api.get("/api/teams")).teams); } catch {}
  }
  // Lấy lại thông tin user (vd khi Lister tự thêm store mới → cập nhật storeNames).
  async function refreshUser() {
    try { const { user } = await api.get("/api/auth/me"); setUser(user); } catch {}
  }

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { const { user } = await api.get("/api/auth/me"); setUser(user); }
        catch { setToken(""); }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (user) loadTeams(); }, [user]);

  // Pick a sensible default landing page per role once logged in.
  useEffect(() => {
    if (user) setPage(["Admin", "Lister"].includes(user.role) ? "master" : user.role === "Buyer" ? "requests" : "team");
  }, [user]);

  async function logout() {
    try { await api.post("/api/auth/logout"); } catch {}
    setToken(""); setUser(null);
  }

  if (loading) return <div style={{ padding: 40 }} className="muted">Đang tải…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const visibleNav = NAV
    .map((g) => ({ ...g, items: g.items.filter((it) => it.access(user)) }))
    .filter((g) => g.items.length);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "var(--panel)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "18px 18px 10px", fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>
          Order Hub
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {visibleNav.map((g) => (
            <div key={g.group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
                color: "var(--muted)", padding: "4px 8px" }}>{g.group}</div>
              {g.items.map((it) => (
                <div key={it.id} onClick={() => setPage(it.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
                    borderRadius: 8, cursor: "pointer", fontWeight: page === it.id ? 600 : 500,
                    background: page === it.id ? "var(--primary)" : "transparent",
                    color: page === it.id ? "#fff" : "var(--text)", marginBottom: 2,
                  }}>
                  <span>{it.icon}</span>{it.label}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 600 }}>{user.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{user.role}</div>
          <Presence currentUser={user} />
          <div style={{ marginBottom: 8 }}><Notifications /></div>
          <Button sm onClick={logout} style={{ width: "100%" }}>⏻ Đăng xuất</Button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>
        {page === "users"    && <Users teams={teams} />}
        {page === "teams"    && <Teams teams={teams} reloadTeams={loadTeams} />}
        {page === "stores"   && <Stores />}
        {page === "payout"   && <Payout currentUser={user} refreshUser={refreshUser} />}
        {page === "expenses" && <Expenses teams={teams} />}
        {page === "blacklist" && <Blacklist />}
        {page === "leaderboard" && <Leaderboard currentUser={user} />}
        {page === "tracking" && <Tracking />}
        {page === "settings" && <Settings />}
        {page === "master"   && <Master currentUser={user} teams={teams} refreshUser={refreshUser} />}
        {page === "team"     && <TeamSheet currentUser={user} teams={teams} />}
        {page === "requests" && <Requests currentUser={user} />}
        {page === "cards"    && <Cards currentUser={user} />}
        {page === "card-stats" && <CardStats />}
      </main>
    </div>
  );
}
