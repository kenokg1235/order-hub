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
  const [totals, setTotals] = useState(null);
  const [detail, setDetail] = useState(null);   // { name, upList } — đối chiếu đơn đã tính
  const [err, setErr] = useState("");

  const fmtP = (d) => { if (!d) return "đầu"; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };
  async function loadRows(from, to, all) {
    try {
      const url = `/api/leaderboard?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}${all ? "&month=all" : ""}`;
      const r = await api.get(url);
      setRows(r.leaderboard); setTotals(r.totals || null);
    } catch (e) { setErr(e.message); }
  }
  async function loadPeriods() {
    try { const r = await api.get("/api/expense-periods"); setOpenStart(r.openStart || ""); setClosedPeriods(r.closed || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { loadPeriods(); }, []);
  useEffect(() => {
    if (periodSel === "all") loadRows("", "", true);
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
        Theo <b>từng kỳ</b> (dùng chung kỳ với Thống kê chi phí). <b>Số đơn (Đã Up) &amp; Profit</b> tính theo <b>tháng lịch của đơn</b> — khớp đúng bảng ở <b>Sheet Tổng</b>. <b>Số thẻ</b> tính theo <b>khoảng ngày của kỳ</b> (kể từ ngày chốt kỳ), là thẻ NV được cấp ở Mua thẻ có trạng thái <b>hợp lệ (Live Bill / Sai bill)</b>, theo người yêu cầu. <b>Fail rate</b> = đơn cancel do lỗi NV ÷ tổng đơn đã chốt. Bấm tiêu đề cột để đổi tiêu chí; bấm số ở cột Số đơn để xem danh sách đơn đã tính.
      </div>
      {totals && (
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Badge color="green">✅ Tổng đơn Đã Up trong kỳ: {totals.up}</Badge>
          <Badge color="blue">Đã tính cho NV: {totals.up - totals.unclaimedUp}</Badge>
          {totals.unclaimedUp > 0 && (
            <Badge color="amber" title="Đơn Đã Up nhưng không có người nhận → không tính cho ai trong bảng">
              ⚠ {totals.unclaimedUp} đơn chưa có người nhận (không vào bảng)
            </Badge>
          )}
        </div>
      )}
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
                    color: c.k === "failRate" && r.failRate > 0 ? "var(--red)" : undefined,
                    cursor: c.k === "orders" ? "pointer" : undefined,
                    textDecoration: c.k === "orders" && r.orders > 0 ? "underline dotted" : undefined }}
                    title={c.k === "orders" ? "Bấm để xem danh sách đơn đã tính trong kỳ" : undefined}
                    onClick={c.k === "orders" ? () => setDetail({ name: r.name, upList: r.upList || [] }) : undefined}>
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

      {detail && (
        <div className="card" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <b>Đơn Đã Up đã tính trong kỳ — {detail.name}</b>
            <Badge color="blue">{detail.upList.length} đơn</Badge>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setDetail(null)}>✕</button>
          </div>
          <div style={{ maxHeight: 340, overflow: "auto" }}>
            <table className="tbl" style={{ minWidth: 480 }}>
              <thead><tr><th>ID Order</th><th>Ngày chốt (Đã Up)</th><th>Tháng lịch của đơn</th><th style={{ textAlign: "right" }}>Profit</th></tr></thead>
              <tbody>
                {detail.upList.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.id}</td>
                    <td>{o.at ? new Date(o.at).toLocaleString("vi") : <span className="muted">—</span>}</td>
                    <td>{o.period || <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>{money(o.profit)}</td>
                  </tr>
                ))}
                {detail.upList.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 18 }}>Không có đơn nào.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, padding: "8px 14px" }}>
            💡 So với Sheet Tổng: Sheet Tổng lọc theo <b>tháng lịch</b> của đơn, còn đây tính theo <b>ngày chốt</b> nằm trong kỳ. Đơn có "Tháng lịch" khác tháng bạn đang xem chính là phần chênh lệch.
          </div>
        </div>
      )}
    </div>
  );
}
