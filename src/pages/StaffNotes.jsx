import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Tổng hợp note của NV xử lý đơn → Listing xử lý với khách.
// Note để càng lâu chưa xử lý thì mức cảnh báo càng tăng.
export default function StaffNotes() {
  const [notes, setNotes] = useState([]);
  const [tab, setTab] = useState("open");     // open | done | all
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());

  async function load() {
    try { setNotes((await api.get("/api/staff-notes")).notes); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  // Tự cập nhật danh sách + đồng hồ (để mức cảnh báo tăng theo thời gian thực).
  useEffect(() => {
    const t1 = setInterval(load, 15000);
    const t2 = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  // Mức cảnh báo theo số giờ chưa xử lý.
  const LEVELS = [
    { max: 4,        label: "Mới",        bg: "#f1f5f9", fg: "#475569", bar: "#94a3b8" },
    { max: 24,       label: "Chờ >4h",    bg: "#fff8e1", fg: "#a16207", bar: "#eab308" },
    { max: 48,       label: "Trễ >1 ngày", bg: "#fff3cd", fg: "#b45309", bar: "#f59e0b" },
    { max: Infinity, label: "GẤP >2 ngày", bg: "#fdeaea", fg: "#b91c1c", bar: "#dc2626" },
  ];
  const hoursOf = (ts) => (ts ? (now - ts) / 3600000 : 0);
  const levelOf = (ts) => LEVELS.findIndex((l) => hoursOf(ts) < l.max);
  const ageText = (ts) => {
    if (!ts) return "—";
    const h = hoursOf(ts);
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} phút`;
    if (h < 24) return `${Math.round(h)} giờ`;
    return `${Math.floor(h / 24)} ngày ${Math.round(h % 24)} giờ`;
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes
      .filter((n) => (tab === "all" ? true : tab === "done" ? n.done : !n.done))
      .filter((n) => !s || [n.orderNo, n.id, n.store, n.staffNote, n.product, n.claimedName].some((v) => String(v || "").toLowerCase().includes(s)))
      .sort((a, b) => (a.done === b.done ? (a.noteAt || 0) - (b.noteAt || 0) : a.done ? 1 : -1));  // chưa xử lý & lâu nhất lên đầu
  }, [notes, tab, q, now]);

  const openCount = notes.filter((n) => !n.done).length;
  const urgentCount = notes.filter((n) => !n.done && levelOf(n.noteAt) >= 2).length;

  async function setDone(n, done) {
    try {
      await api.post(`/api/staff-notes/${n.id}/done`, { done });
      setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, done } : x)));
    } catch (e) { setErr(e.message); }
  }

  const TABS = [["open", `Chưa xử lý (${openCount})`], ["done", "Đã xử lý"], ["all", "Tất cả"]];

  return (
    <div>
      <div className="row" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>📌 Note từ NV xử lý</h2>
        <Badge color="blue">{openCount} chưa xử lý</Badge>
        {urgentCount > 0 && <Badge color="red">🚨 {urgentCount} quá hạn</Badge>}
        <div className="spacer" />
        {TABS.map(([k, label]) => (
          <Button key={k} sm variant={tab === k ? "primary" : ""} onClick={() => setTab(k)}>{label}</Button>
        ))}
        <input className="input" style={{ maxWidth: 220 }} placeholder="🔍 Tìm ID đơn / store / nội dung…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Note do nhân viên xử lý đơn ghi ở Sheet Con. Xử lý với khách xong thì bấm <b>✓ Đã xử lý</b>.
        Note chưa xử lý càng lâu thì mức cảnh báo càng tăng (Mới → &gt;4h → &gt;1 ngày → &gt;2 ngày).
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {list.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <span className="muted">{tab === "open" ? "🎉 Không còn note nào chưa xử lý." : "Không có note nào."}</span>
        </div>
      )}

      {list.map((n) => {
        const lv = LEVELS[levelOf(n.noteAt)];
        return (
          <div key={n.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden",
            borderColor: n.done ? undefined : lv.bar,
            boxShadow: n.done ? undefined : `inset 5px 0 0 0 ${lv.bar}`,
            background: n.done ? undefined : lv.bg, opacity: n.done ? 0.65 : 1 }}>
            <div style={{ padding: "10px 14px" }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 15 }}>{n.orderNo}</b>
                <Badge color="blue">{n.store}</Badge>
                {n.masterStatus && <Badge>{n.masterStatus}</Badge>}
                {n.deadline && <span className="muted" style={{ fontSize: 12 }}>⏳ {n.deadline}</span>}
                {n.link && <a href={n.link} target="_blank" rel="noreferrer" title="Mở đơn trên eBay">🔗</a>}
                <div className="spacer" />
                {!n.done && (
                  <span style={{ background: lv.bar, color: "#fff", fontWeight: 700, fontSize: 11,
                    padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    {lv.label} · {ageText(n.noteAt)}
                  </span>
                )}
                {n.done
                  ? <Button sm onClick={() => setDone(n, false)} title="Mở lại">↩ Mở lại</Button>
                  : <Button sm variant="primary" onClick={() => setDone(n, true)}>✓ Đã xử lý</Button>}
              </div>

              <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "pre-wrap", color: n.done ? "var(--muted)" : lv.fg }}>
                {n.staffNote}
              </div>

              <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: "wrap", fontSize: 12 }} >
                <span className="muted">NV xử lý: <b>{n.claimedName || "—"}</b></span>
                <span className="muted">SP: {n.product || "—"}</span>
                {n.custPhone && <span className="muted">SĐT: {n.custPhone}</span>}
                <span className="muted">Ghi lúc: {n.noteAt ? new Date(n.noteAt).toLocaleString("vi") : "—"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
