import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Badge } from "../ui.jsx";

// Company-wide ranking of order-processing members. Everyone can view.
export default function Leaderboard({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState("orders");
  const [months, setMonths] = useState([]);
  const [activeMonth, setActiveMonth] = useState("");
  const [month, setMonth] = useState("");
  const [err, setErr] = useState("");

  async function loadRows(m) {
    try { setRows((await api.get(`/api/leaderboard?month=${encodeURIComponent(m || month)}`)).leaderboard); } catch (e) { setErr(e.message); }
  }
  useEffect(() => {
    (async () => {
      try { const mo = await api.get("/api/months"); setMonths(mo.months); setActiveMonth(mo.activeMonth); setMonth((c) => c || mo.activeMonth); }
      catch (e) { setErr(e.message); }
    })();
  }, []);
  useEffect(() => { if (month) loadRows(month); }, [month]);

  const money = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const cols = [
    { k: "orders", label: "Số đơn (Đã Up)" },
    { k: "cards", label: "Số thẻ" },
    { k: "ordersPerCard", label: "Đơn / Thẻ" },
    { k: "profit", label: "Profit", money: true },
    { k: "profitPerCard", label: "Profit / Thẻ", money: true },
  ];
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)), [rows, sortKey]);
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1);

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>🏆 Leaderboard</h2>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>📅 {m}{m === activeMonth ? " • hiện tại" : ""}</option>)}
          <option value="all">Tất cả tháng</option>
        </select>
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Theo <b>từng tháng</b>: Số đơn & Profit tính đơn <b>Đã Up</b> trong tháng; Số thẻ chỉ tính thẻ <b>Live Bill / Sai bill</b> dùng <b>lần đầu trong tháng đó</b> (dùng lại thẻ tháng cũ không cộng). Bấm tiêu đề cột để đổi tiêu chí.
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 60, textAlign: "center" }}>Hạng</th>
            <th>Thành viên</th>
            {cols.map((c) => (
              <th key={c.k} onClick={() => setSortKey(c.k)}
                style={{ cursor: "pointer", whiteSpace: "nowrap", color: sortKey === c.k ? "var(--primary)" : undefined }}>
                {c.label}{sortKey === c.k ? " ▾" : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} style={{ background: r.id === currentUser.id ? "var(--primary-bg)" : (i < 3 ? "#fffdf3" : undefined) }}>
                <td style={{ fontSize: 18, textAlign: "center" }}>{medal(i)}</td>
                <td style={{ fontWeight: 600 }}>
                  {r.name} {r.id === currentUser.id && <Badge color="blue">bạn</Badge>}
                </td>
                {cols.map((c) => (
                  <td key={c.k} style={{ fontWeight: c.k === sortKey ? 700 : 400 }}>
                    {c.money ? money(r[c.k]) : r[c.k]}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Chưa có dữ liệu — thành viên cần nhận & xử lý đơn trước.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
