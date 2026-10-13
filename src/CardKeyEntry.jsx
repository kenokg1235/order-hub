import React, { useEffect, useState } from "react";
import { Button } from "./ui.jsx";
import { onLanKeyChange, lanKeyReady, isManualKey, setManualKey, clearManualKey } from "./cardKeyLan.js";

// CÁCH B — ô nhập/gỡ "Key" trên trình duyệt (người tin cậy làm từ xa). Nhãn đặt ở Cấu hình.
// Khóa chỉ trong RAM phiên này, không gửi máy chủ, không lưu đĩa; gỡ được tức thì.
export default function CardKeyEntry({ currentUser, label }) {
  const [ready, setReady] = useState(lanKeyReady());
  const [manual, setManual] = useState(isManualKey());
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onLanKeyChange(() => { setReady(lanKeyReady()); setManual(isManualKey()); }), []);

  const L = (label && String(label).trim()) || "Key";
  const canUse = currentUser.role === "Admin" || currentUser.role === "Leader" || currentUser.canBuyCard;
  if (!canUse) return null;
  if (ready && !manual) return null;       // mở bằng LAN ở văn phòng → không hiện gì

  async function unlock() {
    const k = key.trim();
    if (!k) return;
    setBusy(true); setMsg("");
    const r = await setManualKey(k);
    setBusy(false);
    if (r.ok) setKey(""); else setMsg(r.error);
  }

  // Đã mở bằng khóa nhập tay → chỉ còn nút gỡ gọn.
  if (ready && manual) {
    return (
      <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 13 }}>{L} ✓</span>
        <Button variant="danger" sm onClick={clearManualKey}>Gỡ</Button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 13 }}>{L}</span>
      <input className="input" type="password" autoComplete="off" style={{ maxWidth: 320 }} value={key}
        onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} />
      <Button variant="primary" sm disabled={busy} onClick={unlock}>{busy ? "…" : "OK"}</Button>
      {msg && <span style={{ color: "var(--red)", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
