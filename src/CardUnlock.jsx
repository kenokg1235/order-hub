import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Button } from "./ui.jsx";

// Banner nhắc MỞ KHÓA THẺ. Sau mỗi lần server khởi động, khóa thẻ KHÔNG lưu trên đĩa
// (bảo mật) → Admin phải nhập khóa để xem/cấp thẻ cho phiên chạy đó.
export default function CardUnlock({ currentUser }) {
  const [locked, setLocked] = useState(false);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function check() {
    if (busyRef.current) return;
    busyRef.current = true;
    try { const r = await api.get("/api/cards/lock-status"); setLocked(!!r.locked); } catch {} finally { busyRef.current = false; }
  }
  useEffect(() => { check(); const t = setInterval(() => { if (!document.hidden) check(); }, 60000); return () => clearInterval(t); }, []);

  async function unlock() {
    if (!key.trim()) return;
    setBusy(true); setMsg("");
    try {
      await api.post("/api/cards/unlock", { key: key.trim() });
      setKey(""); setLocked(false);
      setTimeout(() => window.location.reload(), 300);   // tải lại để mọi chỗ hiện thẻ đã giải mã
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (!locked) return null;
  const isAdmin = currentUser.role === "Admin";

  return (
    <div style={{ background: "#fff6e6", border: "1px solid #e0a300", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: "#9a6b00", marginBottom: isAdmin ? 8 : 0 }}>
        🔒 Thẻ đang khóa — số thẻ chưa thể xem/cấp cho tới khi nhập khóa.
      </div>
      {isAdmin ? (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Khóa thẻ KHÔNG lưu trên server (bảo mật). Nhập khóa thẻ để mở cho phiên chạy này.
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" type="password" style={{ maxWidth: 440 }} value={key} autoComplete="off"
              placeholder="Dán khóa thẻ (ORDERHUB_CARD_KEY)…"
              onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} />
            <Button variant="primary" disabled={busy} onClick={unlock}>{busy ? "Đang mở…" : "🔓 Mở khóa thẻ"}</Button>
          </div>
          {msg && <div style={{ color: "var(--red)", marginTop: 6, fontSize: 13 }}>{msg}</div>}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>Nhờ Admin nhập khóa thẻ để xem/cấp thẻ.</div>
      )}
    </div>
  );
}
