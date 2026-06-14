import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Button } from "./ui.jsx";

// Bell + badge in the sidebar footer. Opens a panel with notifications and the
// Telegram linking flow. Polls the unread count every 30s.
export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [unread, setUnread] = useState(0);
  const [tg, setTg] = useState({ linked: false, enabled: false });
  const [link, setLink] = useState(null);   // { code, botUsername }
  const [msg, setMsg] = useState("");

  async function loadCount() {
    try { const d = await api.get("/api/notifications"); setList(d.notifications); setUnread(d.unread); } catch {}
  }
  async function loadTg() { try { setTg(await api.get("/api/telegram/status")); } catch {} }
  useEffect(() => { loadCount(); loadTg(); const t = setInterval(loadCount, 30000); return () => clearInterval(t); }, []);

  function toggle() { const n = !open; setOpen(n); if (n) { loadCount(); loadTg(); } }
  async function markRead() { try { await api.post("/api/notifications/read", {}); setUnread(0); setList((l) => l.map((n) => ({ ...n, read: true }))); } catch {} }
  async function clearRead() { try { await api.post("/api/notifications/clear-read", {}); loadCount(); } catch {} }
  async function delOne(id) { try { await api.del(`/api/notifications/${id}`); setList((l) => l.filter((n) => n.id !== id)); loadCount(); } catch {} }
  async function startLink() { setMsg(""); try { setLink(await api.post("/api/telegram/start-link", {})); } catch (e) { setMsg(e.message); } }
  async function checkLink() {
    setMsg("Đang kiểm tra…");
    try {
      const r = await api.post("/api/telegram/check-link", {});
      if (r.linked) { setMsg(""); setLink(null); loadTg(); }
      else setMsg("Chưa thấy tin nhắn — gửi mã cho bot rồi bấm Kiểm tra lại.");
    } catch (e) { setMsg(e.message); }
  }
  async function unlink() { try { await api.post("/api/telegram/unlink", {}); loadTg(); } catch {} }

  return (
    <>
      <button className="btn sm" onClick={toggle} style={{ position: "relative", width: "100%" }}>
        🔔 Thông báo
        {unread > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "var(--red)",
          color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{unread}</span>}
      </button>

      {open && (
        <div style={{ position: "fixed", left: 12, bottom: 118, width: 330, maxHeight: "64vh", overflow: "auto", zIndex: 100,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 50px rgba(0,0,0,.22)" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
            <b>Thông báo</b><div style={{ flex: 1 }} />
            {unread > 0 && <button className="btn sm" onClick={markRead}>Đánh dấu đã đọc</button>}
            {list.some((n) => n.read) && <button className="btn sm" style={{ marginLeft: 6 }} onClick={clearRead}>🗑 Xóa đã đọc</button>}
            <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div style={{ padding: 8 }}>
            {list.length === 0 && <div className="muted" style={{ padding: 10 }}>Chưa có thông báo</div>}
            {list.map((n) => (
              <div key={n.id} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 4, display: "flex", gap: 6,
                background: n.read ? "transparent" : "var(--primary-bg)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.message}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{new Date(n.createdAt).toLocaleString("vi")}</div>
                </div>
                <button onClick={() => delOne(n.id)} title="Xóa thông báo này"
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, alignSelf: "flex-start" }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
            {!tg.enabled ? (
              <div className="muted" style={{ fontSize: 12 }}>Telegram chưa được Admin bật (Cấu hình → Telegram).</div>
            ) : tg.linked ? (
              <div className="row"><span className="badge green">✓ Đã liên kết Telegram</span><div style={{ flex: 1 }} />
                <button className="btn sm" onClick={unlink}>Hủy</button></div>
            ) : link ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4 }}>1. Mở bot {link.botUsername
                  ? <a href={`https://t.me/${link.botUsername}`} target="_blank" rel="noreferrer"><b>@{link.botUsername}</b></a>
                  : "Telegram của bạn"}</div>
                <div>2. Gửi cho bot mã: <code style={{ background: "#eef1f4", padding: "2px 6px", borderRadius: 4 }}>{link.code}</code></div>
                <div style={{ marginTop: 8 }}><Button sm variant="primary" onClick={checkLink}>Tôi đã gửi — Kiểm tra</Button></div>
                {msg && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{msg}</div>}
              </div>
            ) : (
              <>
                <Button sm onClick={startLink} style={{ width: "100%" }}>🔗 Liên kết Telegram để nhận thông báo</Button>
                {msg && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{msg}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
