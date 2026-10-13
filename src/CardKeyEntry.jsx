import React, { useEffect, useState } from "react";
import { Button } from "./ui.jsx";
import { onLanKeyChange, lanKeyReady, isManualKey, setManualKey, clearManualKey } from "./cardKeyLan.js";

// CÁCH B — ô NHẬP / GỠ khóa thẻ ngay trên trình duyệt (cho Leader/người mua thẻ làm từ xa).
// Khóa chỉ trong RAM phiên này, KHÔNG gửi VPS, KHÔNG lưu đĩa; có thể GỠ tức thì bất kỳ lúc nào.
export default function CardKeyEntry({ currentUser }) {
  const [ready, setReady] = useState(lanKeyReady());
  const [manual, setManual] = useState(isManualKey());
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onLanKeyChange(() => { setReady(lanKeyReady()); setManual(isManualKey()); }), []);

  // Chỉ hiện cho người cần xem/cấp thẻ từ xa.
  const canUse = currentUser.role === "Admin" || currentUser.role === "Leader" || currentUser.canBuyCard;
  if (!canUse) return null;

  // Đã mở khóa bằng LAN (ở văn phòng) → không cần gì. Chỉ hiện nút GỠ khi khóa do nhập tay.
  if (ready && !manual) return null;

  async function unlock() {
    const k = key.trim();
    if (!k) return;
    setBusy(true); setMsg("");
    const r = await setManualKey(k);
    setBusy(false);
    if (r.ok) setKey("");           // emit → ready → đổi sang trạng thái đã mở
    else setMsg(r.error);
  }

  if (ready && manual) {
    return (
      <div style={{ background: "#e9f7ef", border: "1px solid #27ae60", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "#1e7e46" }}>🔓 Đã mở khóa thẻ (khóa nhập tay, chỉ trong trình duyệt này)</span>
          <div className="spacer" />
          <Button variant="danger" sm onClick={clearManualKey}>🔒 Gỡ khóa ngay</Button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Khóa không gửi lên máy chủ, không lưu đĩa, tự mất khi đóng trình duyệt. Rời máy nên bấm “Gỡ khóa ngay”.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff6e6", border: "1px solid #e0a300", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: "#9a6b00", marginBottom: 6 }}>
        🔒 Thẻ đang khóa — nhập khóa thẻ để xem/cấp thẻ từ xa
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Chỉ dành cho người được giao khóa. Khóa chỉ nằm trong trình duyệt phiên này (không gửi máy chủ, không lưu đĩa) và có thể gỡ bất kỳ lúc nào.
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="input" type="password" autoComplete="off" style={{ maxWidth: 440 }} value={key}
          placeholder="Dán khóa thẻ…" onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} />
        <Button variant="primary" disabled={busy} onClick={unlock}>{busy ? "Đang mở…" : "🔓 Mở khóa"}</Button>
      </div>
      {msg && <div style={{ color: "var(--red)", marginTop: 6, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
