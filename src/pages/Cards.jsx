import React, { useEffect, useState } from "react";
import { Badge } from "../ui.jsx";
import { api } from "../api.js";
import { useFormulaBar } from "../useFormulaBar.jsx";

// Sheet Mua thẻ — Admin + card-buyers issue cards against requests and see stats.
export default function Cards() {
  const [reqs, setReqs] = useState([]);
  const [cardStatuses, setCardStatuses] = useState([]);
  const [err, setErr] = useState("");
  const { cellProps, Bar } = useFormulaBar();

  async function load() {
    try {
      setReqs((await api.get("/api/card-requests")).requests);
      setCardStatuses((await api.get("/api/settings")).settings.cardStatuses || []);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function update(id, body) {
    try { const { request } = await api.put(`/api/card-requests/${id}`, body); setReqs((p) => p.map((r) => r.id === id ? request : r)); }
    catch (e) { setErr(e.message); }
  }

  const totalProfit = reqs.reduce((s, r) => s + (r.stats?.profit || 0), 0);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Mua thẻ</h2>
        <Badge color="blue">{reqs.length} thẻ/yêu cầu</Badge>
        <div className="spacer" />
        <Badge color="green">Tổng profit: ${Math.round(totalProfit * 100) / 100}</Badge>
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <Bar />

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 1000 }}>
          <thead><tr>
            <th>ID lệnh</th><th>Thẻ</th><th>Yêu cầu</th><th>NV yêu cầu</th><th>Trạng thái</th>
            <th>Đơn đã xử lý (ID Order)</th><th>Thống kê</th>
          </tr></thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.code}</td>
                <td>
                  <input className="input" style={{ padding: "5px 8px", width: 160 }} defaultValue={r.card}
                    placeholder="Nhập thẻ cấp…" {...cellProps("Thẻ", (v) => { if (v !== r.card) update(r.id, { card: v }); })} />
                </td>
                <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{r.content || <span className="muted">—</span>}</td>
                <td>{r.requesterName}</td>
                <td>
                  <select className="input" style={{ padding: "5px 8px", minWidth: 120 }} value={r.status}
                    onChange={(e) => update(r.id, { status: e.target.value })}>
                    <option value="">— trống —</option>
                    {cardStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ maxWidth: 240, whiteSpace: "normal", fontSize: 12 }}>
                  {r.stats?.orders?.length ? r.stats.orders.join(", ") : <span className="muted">—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div>💰 <b>${r.stats?.profit || 0}</b></div>
                  <div className="muted" style={{ fontSize: 12 }}>✅ {r.stats?.completed || 0} đơn Đã Up</div>
                </td>
              </tr>
            ))}
            {reqs.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }} className="muted">
                Chưa có yêu cầu thẻ nào. Nhân viên tạo yêu cầu ở trang “Yêu cầu thẻ”.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 Cột Thẻ bạn nhập sẽ là thẻ hợp lệ để nhân viên dùng ở Sheet Con. Profit chia theo tỉ lệ số tiền mỗi thẻ, chỉ tính đơn “Đã Up”.
      </div>
    </div>
  );
}
