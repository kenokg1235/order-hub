import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Xin đơn — xem các yêu cầu xin nhận đơn: gửi tới mình (để duyệt), mình đã gửi, và (Admin/Leader) của cả team.
// Duyệt/từ chối dùng lại API của Sheet Con: chủ đơn hoặc Admin duyệt; người xin tự hủy được.
const STATUS = {
  pending: { l: "Chờ duyệt", c: "amber" },
  approved: { l: "Đã duyệt", c: "green" },
  rejected: { l: "Từ chối", c: "red" },
  canceled: { l: "Đã hủy", c: "" },
};

export default function ClaimRequests({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [reqs, setReqs] = useState([]);
  const [showAll, setShowAll] = useState(false);   // false = chỉ chờ duyệt; true = kèm lịch sử
  const [who, setWho] = useState("");              // "" = tất cả | "toMe" | "mine"
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try { setReqs((await api.get(`/api/claim-requests?status=${showAll ? "all" : "pending"}`)).requests); setErr(""); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [showAll]);

  const isToMe = (r) => r.currentOwnerId === currentUser.id;
  const isMine = (r) => r.requesterId === currentUser.id;
  const shown = useMemo(() => reqs.filter((r) => who === "toMe" ? isToMe(r) : who === "mine" ? isMine(r) : true), [reqs, who]);
  const pendingToMe = reqs.filter((r) => r.status === "pending" && isToMe(r)).length;

  async function act(r, action) {
    if (action === "approve" && !confirm(`Chuyển đơn ${r.orderNo || r.orderId} cho ${r.requesterName}?`)) return;
    setBusy(r.id);
    try { await api.post(`/api/claim-requests/${r.id}/${action}`, {}); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }
  const fmt = (t) => t ? new Date(t).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Xin đơn</h2>
        {pendingToMe > 0 && <Badge color="amber">{pendingToMe} chờ bạn duyệt</Badge>}
        <Badge color="blue">{shown.length} yêu cầu</Badge>
        <div className="spacer" />
        <select className="input" style={{ width: "auto" }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">{isAdmin || currentUser.role === "Leader" ? "Tất cả yêu cầu" : "Tất cả của tôi"}</option>
          <option value="toMe">Xin đơn của tôi</option>
          <option value="mine">Tôi đã xin</option>
        </select>
        <label className="row" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Hiện cả đã xử lý
        </label>
        <Button sm onClick={load}>↻</Button>
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 900 }}>
          <thead><tr>
            <th>Lúc xin</th><th>Đơn</th><th>Store</th><th>Sản phẩm</th><th>Người xin</th><th>Chủ đơn hiện tại</th><th>Trạng thái</th><th></th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 20 }}>
              {showAll ? "Không có yêu cầu nào." : "Không có yêu cầu nào đang chờ duyệt."}</td></tr>}
            {shown.map((r) => {
              const st = STATUS[r.status] || { l: r.status, c: "" };
              const canDecide = r.status === "pending" && !r.orderGone && (isAdmin || isToMe(r));
              const canCancel = r.status === "pending" && isMine(r) && !canDecide;
              return (
                <tr key={r.id} style={r.status === "pending" && isToMe(r) ? { background: "var(--amber-bg, #fff7e6)" } : undefined}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(r.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{r.orderGone ? <span className="muted">(đơn đã xóa)</span> : (r.orderNo || r.orderId)}</td>
                  <td>{r.store}</td>
                  <td style={{ maxWidth: 260, whiteSpace: "normal", fontSize: 13 }}>{r.product}</td>
                  <td>{isMine(r) ? <b>Bạn</b> : r.requesterName}</td>
                  <td>{isToMe(r) ? <b>Bạn</b> : (r.currentOwnerName || <span className="muted">—</span>)}</td>
                  <td>
                    <Badge color={st.c}>{st.l}</Badge>
                    {r.resolvedAt > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{fmt(r.resolvedAt)}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canDecide && <>
                      <Button sm variant="primary" disabled={busy === r.id} onClick={() => act(r, "approve")}>✓ Duyệt</Button>
                      <Button sm variant="danger" disabled={busy === r.id} onClick={() => act(r, "reject")} style={{ marginLeft: 4 }}>✕ Từ chối</Button>
                    </>}
                    {canCancel && <Button sm disabled={busy === r.id} onClick={() => act(r, "reject")}>Hủy yêu cầu</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Chủ đơn hoặc Admin mới duyệt được. Duyệt → đơn chuyển sang người xin, các yêu cầu khác cùng đơn tự bị từ chối.
      </div>
    </div>
  );
}
