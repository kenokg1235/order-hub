import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Buổi làm việc — Admin bấm bắt đầu/kết thúc; thống kê thẻ + đơn xử lý trong buổi.
export default function WorkSessions() {
  const [active, setActive] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    try { const r = await api.get("/api/work-sessions"); setActive(r.active); setSessions(r.sessions || []); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  // Buổi đang mở → cập nhật số liệu 20s cho tươi.
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const fmt = (ts) => { if (!ts) return "—"; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const dur = (s, e) => { const ms = (e || Date.now()) - s; const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000); return h ? `${h}h${p2(m)}` : `${m} phút`; };
  const p2 = (n) => String(n).padStart(2, "0");

  async function start() { try { await api.post("/api/work-sessions/start", {}); load(); } catch (e) { setErr(e.message); } }
  async function end() { if (!confirm("Kết thúc buổi làm việc hiện tại?")) return; try { await api.post("/api/work-sessions/end", {}); load(); } catch (e) { setErr(e.message); } }
  async function remove(s) { if (!confirm("Xóa buổi này khỏi lịch sử?")) return; try { await api.del(`/api/work-sessions/${s.id}`); load(); } catch (e) { setErr(e.message); } }

  const StatCards = ({ st }) => (
    <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 10 }}>
      <div className="card" style={{ padding: "10px 18px", minWidth: 140 }}>
        <div className="muted" style={{ fontSize: 12 }}>✅ Đơn Đã Up</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#16a34a" }}>{st.up}</div>
      </div>
      <div className="card" style={{ padding: "10px 18px", minWidth: 140 }}>
        <div className="muted" style={{ fontSize: 12 }}>🎴 Số thẻ đã nhập</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--primary)" }}>{st.cards}</div>
      </div>
      <div className="card" style={{ padding: "10px 18px", minWidth: 140 }}>
        <div className="muted" style={{ fontSize: 12 }}>✕ Đơn Đã Cancel</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--red)" }}>{st.cancel}</div>
      </div>
    </div>
  );
  const ByUser = ({ st }) => st.byUser && st.byUser.length ? (
    <table className="tbl" style={{ marginTop: 10, minWidth: 320 }}>
      <thead><tr><th>Nhân viên</th><th style={{ textAlign: "right" }}>Đơn Đã Up</th><th style={{ textAlign: "right" }}>Số thẻ</th></tr></thead>
      <tbody>
        {st.byUser.map((u, i) => (
          <tr key={i}><td>{u.name || "—"}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{u.up}</td><td style={{ textAlign: "right" }}>{u.cards}</td></tr>
        ))}
      </tbody>
    </table>
  ) : <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Chưa có hoạt động trong buổi.</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 6px" }}>⏱️ Buổi làm việc</h2>
      <div className="muted" style={{ marginBottom: 14 }}>Bấm <b>Bắt đầu buổi</b> khi vào ca, <b>Kết thúc buổi</b> khi hết ca. Số thẻ & đơn được tính trong khoảng thời gian buổi đó.</div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Buổi hiện tại */}
      <div className="card" style={{ padding: 16, marginBottom: 18, borderColor: active ? "#16a34a" : undefined, background: active ? "var(--green-bg)" : undefined }}>
        {active ? (
          <>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <Badge color="green">🟢 ĐANG MỞ BUỔI</Badge>
              <span>Bắt đầu <b>{fmt(active.startedAt)}</b> · đã <b>{dur(active.startedAt, 0)}</b> · mở bởi {active.startedByName}</span>
              <div className="spacer" />
              <Button variant="danger" onClick={end}>⏹ Kết thúc buổi</Button>
            </div>
            <StatCards st={active.stats} />
            <ByUser st={active.stats} />
          </>
        ) : (
          <div className="row" style={{ gap: 12 }}>
            <span className="muted">Chưa có buổi nào đang mở.</span>
            <div className="spacer" />
            <Button variant="primary" onClick={start}>▶ Bắt đầu buổi</Button>
          </div>
        )}
      </div>

      {/* Lịch sử buổi */}
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Lịch sử buổi ({sessions.length})</div>
      {sessions.length === 0 && <div className="muted">Chưa có buổi nào kết thúc.</div>}
      {sessions.map((s) => (
        <div key={s.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <b>{fmt(s.startedAt)} → {fmt(s.endedAt)}</b>
            <Badge color="blue">{dur(s.startedAt, s.endedAt)}</Badge>
            <span className="muted" style={{ fontSize: 12 }}>mở bởi {s.startedByName}</span>
            <div className="spacer" />
            <span>✅ <b>{s.stats.up}</b> đơn · 🎴 <b>{s.stats.cards}</b> thẻ{s.stats.cancel ? ` · ✕ ${s.stats.cancel} cancel` : ""}</span>
            <Button sm variant="danger" onClick={() => remove(s)} style={{ marginLeft: 6 }}>✕</Button>
          </div>
          {s.stats.byUser && s.stats.byUser.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {s.stats.byUser.map((u) => `${u.name}: ${u.up} đơn / ${u.cards} thẻ`).join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
