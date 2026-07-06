import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Badge } from "../ui.jsx";

// Company-wide ranking of order-processing members. Everyone can view.
export default function Leaderboard({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState("orders");
  const [openStart, setOpenStart] = useState("");
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [periodSel, setPeriodSel] = useState("current");   // "all" | "current" | "c<idx>"
  const [err, setErr] = useState("");

  const fmtP = (d) => { if (!d) return "đầu"; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };
  async function loadRows(from, to) {
    try { setRows((await api.get(`/api/leaderboard?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}`)).leaderboard); }
    catch (e) { setErr(e.message); }
  }
  async function loadPeriods() {
    try { const r = await api.get("/api/expense-periods"); setOpenStart(r.openStart || ""); setClosedPeriods(r.closed || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { loadPeriods(); }, []);
  useEffect(() => {
    if (periodSel === "all") loadRows("", "");
    else if (periodSel === "current") loadRows(openStart || "", "");
    else { const p = closedPeriods[Number(String(periodSel).slice(1))]; if (p) loadRows(p.from || "", p.to || ""); }
  }, [periodSel, openStart, closedPeriods]);

  const money = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const cols = [
    { k: "orders", label: "Số đơn (Đã Up)" },
    { k: "cards", label: "Số thẻ" },
    { k: "ordersPerCard", label: "Đơn / Thẻ" },
    { k: "profit", label: "Profit", money: true },
    { k: "profitPerCard", label: "Profit / Thẻ", money: true },
    { k: "failCancels", label: "Đơn lỗi (NV)" },
    { k: "failRate", label: "Fail rate", pct: true },
  ];
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)), [rows, sortKey]);
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1);

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>🏆 Leaderboard</h2>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 240 }} value={periodSel} onChange={(e) => setPeriodSel(e.target.value)} title="Kỳ (khoảng ngày, dùng chung với Thống kê chi phí)">
          <option value="current">📆 Kỳ hiện tại ({fmtP(openStart)} → nay)</option>
          {closedPeriods.map((p, i) => <option key={i} value={"c" + i}>🔒 {fmtP(p.from)} → {fmtP(p.to)}</option>).reverse()}
          <option value="all">📅 Tất cả</option>
        </select>
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Theo <b>từng kỳ</b> (khoảng ngày, dùng chung với Thống kê chi phí — theo <b>ngày tạo</b>): Số đơn & Profit tính đơn <b>Đã Up</b>; <b>Số thẻ</b> = thẻ NV được cấp ở <b>Mua thẻ</b> có trạng thái <b>hợp lệ (Live Bill / Sai bill)</b>, tính theo người yêu cầu (không phụ thuộc gán vào Sheet Con). <b>Fail rate</b> = đơn cancel do lỗi NV ÷ tổng đơn đã chốt. Bấm tiêu đề cột để đổi tiêu chí.
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
                  <td key={c.k} style={{ fontWeight: c.k === sortKey ? 700 : 400,
                    color: c.k === "failRate" && r.failRate > 0 ? "var(--red)" : undefined }}>
                    {c.money ? money(r[c.k]) : c.pct ? `${r[c.k] || 0}%` : r[c.k]}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={2 + cols.length} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Chưa có dữ liệu — thành viên cần nhận & xử lý đơn trước.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
