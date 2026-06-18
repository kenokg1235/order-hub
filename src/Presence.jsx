import React, { useEffect, useState } from "react";
import { api } from "./api.js";

const roleLabel = { Admin: "Admin", Leader: "Leader", Lister: "Listing", Member: "Member", Buyer: "Mua thẻ" };

// Hiển thị thành viên đang online (hoạt động trong 2 phút gần đây). Poll mỗi 30s.
export default function Presence({ currentUser }) {
  const [online, setOnline] = useState([]);
  const [open, setOpen] = useState(false);

  async function load() { try { setOnline((await api.get("/api/presence")).online); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  return (
    <div style={{ marginBottom: 8 }}>
      <button className="btn sm" style={{ width: "100%", position: "relative" }} onClick={() => setOpen((o) => !o)}>
        🟢 Online ({online.length})
      </button>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 6, background: "#fff" }}>
          {online.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 4 }}>Chưa có ai online</div>}
          {online.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 4px", fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#16a34a", flexShrink: 0 }} />
              <span style={{ fontWeight: u.id === currentUser.id ? 700 : 500 }}>
                {u.name}{u.id === currentUser.id ? " (bạn)" : ""}
              </span>
              <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>{roleLabel[u.role] || u.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
