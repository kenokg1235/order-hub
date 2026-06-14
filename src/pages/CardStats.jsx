import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge } from "../ui.jsx";

// Team-scoped card statistics. The actual card value is HIDDEN (security);
// teammates only see request / status / orders handled / profit stats.
export default function CardStats() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [months, setMonths] = useState([]);
  const [activeMonth, setActiveMonth] = useState("");
  const [month, setMonth] = useState("");
  const [err, setErr] = useState("");

  async function loadItems(m) {
    try { setItems((await api.get(`/api/team-card-stats?month=${encodeURIComponent(m || month)}`)).items); } catch (e) { setErr(e.message); }
  }
  useEffect(() => {
    (async () => {
      try { const mo = await api.get("/api/months"); setMonths(mo.months); setActiveMonth(mo.activeMonth); setMonth((c) => c || mo.activeMonth); }
      catch (e) { setErr(e.message); }
    })();
  }, []);
  useEffect(() => { if (month) loadItems(month); }, [month]);

  const money = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const filtered = items.filter((r) => {
    const s = q.trim().toLowerCase();
    return !s || [r.content, r.requesterName, r.status].some((v) => String(v || "").toLowerCase().includes(s));
  });
  const totalProfit = items.reduce((s, r) => s + (r.stats?.profit || 0), 0);

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Thống kê thẻ (team)</h2>
        <Badge color="green">Tổng profit: {money(totalProfit)}</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>📅 {m}{m === activeMonth ? " • hiện tại" : ""}</option>)}
          <option value="all">Tất cả tháng</option>
        </select>
        <input className="input" style={{ maxWidth: 220 }} placeholder="🔍 Tìm yêu cầu / NV / trạng thái…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>Xem thống kê thẻ của thành viên trong team. 🔒 Giá trị thẻ được ẩn vì bảo mật.</div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 920 }}>
          <thead><tr>
            <th>ID lệnh</th><th>Thẻ</th><th>Yêu cầu</th><th>NV yêu cầu</th><th>Trạng thái</th><th>Đơn đã xử lý (ID Order)</th><th>Thống kê</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.code}</td>
                <td>{r.hasCard ? <span className="badge" title="Giá trị thẻ ẩn">🔒 ••••</span> : <span className="muted">chưa cấp</span>}</td>
                <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{r.content || <span className="muted">—</span>}</td>
                <td>{r.requesterName}</td>
                <td>{r.status || <span className="muted">—</span>}</td>
                <td style={{ maxWidth: 240, whiteSpace: "normal", fontSize: 12 }}>
                  {r.stats?.orders?.length ? r.stats.orders.join(", ") : <span className="muted">—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div>💰 <b>{money(r.stats?.profit)}</b></div>
                  <div className="muted" style={{ fontSize: 12 }}>✅ {r.stats?.completed || 0} đơn Đã Up</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có dữ liệu thẻ của team.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
