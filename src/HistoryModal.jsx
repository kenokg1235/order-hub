import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Modal, Button, Badge } from "./ui.jsx";

// Field internal name → nhãn hiển thị.
const FIELD_LABELS = {
  size: "Size", color: "Màu", profit: "Profit", deadline: "Thời hạn",
  masterStatus: "Trạng thái tổng", masterNote: "Note tổng", cancelReason: "Lý do Cancel",
  team: "Team", address: "Địa chỉ", custPhone: "SĐT khách", qty: "SL", product: "Sản phẩm", link: "Link",
  note1: "Note 1", note2: "Note 2", note3: "Note 3", note4: "Note 4", claimedBy: "Người nhận",
  card: "Thẻ", amount: "Số tiền", tracking: "Tracking", orderNumber: "Order#",
  email: "Email", phone: "Phone", zip: "Zip", processStatus: "TT xử lý",
};

// Lịch sử chỉnh sửa của 1 đơn (gồm các ô đơn + các ô thẻ). Lọc theo từng ô.
export default function HistoryModal({ orderId, orderLabel, onClose }) {
  const [rows, setRows] = useState(null);
  const [field, setField] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try { setRows((await api.get(`/api/orders/${orderId}/history`)).history); }
      catch (e) { setErr(e.message); setRows([]); }
    })();
  }, [orderId]);

  const lbl = (f) => FIELD_LABELS[f] || f;
  const fmt = (ts) => { const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const fields = rows ? [...new Set(rows.map((r) => r.field))] : [];
  const shown = (rows || []).filter((r) => !field || r.field === field);
  const val = (v) => (v === "" || v == null ? <span className="muted">(trống)</span> : v);

  return (
    <Modal title={`🕘 Lịch sử chỉnh sửa${orderLabel ? " — đơn " + orderLabel : ""}`} onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}>
      {err && <div style={{ color: "var(--red)", marginBottom: 8 }}>{err}</div>}
      {!rows && <div className="muted">Đang tải…</div>}
      {rows && (
        <div style={{ minWidth: 540 }}>
          <div className="row" style={{ marginBottom: 10, gap: 8 }}>
            <span className="muted">Lọc theo ô:</span>
            <select className="input" style={{ maxWidth: 200 }} value={field} onChange={(e) => setField(e.target.value)}>
              <option value="">Tất cả ô ({rows.length})</option>
              {fields.map((f) => <option key={f} value={f}>{lbl(f)}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: "55vh", overflow: "auto" }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead><tr><th>Ô</th><th>Thay đổi</th><th>Người sửa</th><th>Thời gian</th></tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}><Badge color={r.entity === "purchase" ? "amber" : "blue"}>{lbl(r.field)}</Badge></td>
                    <td style={{ fontSize: 12.5 }}>
                      <span style={{ color: "var(--muted)", textDecoration: "line-through" }}>{val(r.oldValue)}</span>
                      {" → "}<b>{val(r.newValue)}</b>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.userName}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 22 }}>
                    Chưa có lịch sử chỉnh sửa{field ? " cho ô này" : ""}.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
