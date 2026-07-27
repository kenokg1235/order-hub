import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Task — Lister thêm hạng mục cần Admin kiểm tra; Admin thêm task theo dõi/xử lý case.
export default function Tasks({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [tasks, setTasks] = useState([]);
  const [na, setNa] = useState({ title: "", note: "", priority: "normal" });
  const [tab, setTab] = useState("open");   // open | done | all
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try { setTasks((await api.get("/api/tasks")).tasks); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const canEdit = (t) => isAdmin || t.createdBy === currentUser.id;
  const fmt = (ts) => { if (!ts) return ""; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks
      .filter((t) => (tab === "all" ? true : tab === "done" ? t.done : !t.done))
      .filter((t) => !s || [t.title, t.note, t.createdByName].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [tasks, tab, q]);
  const openCount = tasks.filter((t) => !t.done).length;

  async function add() {
    if (!na.title.trim()) { setErr("Nhập nội dung task"); return; }
    try { await api.post("/api/tasks", na); setNa({ title: "", note: "", priority: "normal" }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function setDone(t, done) {
    try { const { task } = await api.post(`/api/tasks/${t.id}/done`, { done }); setTasks((p) => p.map((x) => x.id === t.id ? task : x)); }
    catch (e) { setErr(e.message); }
  }
  async function save(t, field, value) {
    if (String(value) === String(t[field] ?? "")) return;
    try { const { task } = await api.put(`/api/tasks/${t.id}`, { [field]: value }); setTasks((p) => p.map((x) => x.id === t.id ? task : x)); }
    catch (e) { setErr(e.message); }
  }
  async function togglePriority(t) {
    try { const { task } = await api.put(`/api/tasks/${t.id}`, { priority: t.priority === "high" ? "normal" : "high" }); setTasks((p) => p.map((x) => x.id === t.id ? task : x)); }
    catch (e) { setErr(e.message); }
  }
  async function remove(t) {
    if (!confirm("Xóa task này?")) return;
    try { await api.del(`/api/tasks/${t.id}`); setTasks((p) => p.filter((x) => x.id !== t.id)); } catch (e) { setErr(e.message); }
  }

  const TABS = [["open", `Chưa xong (${openCount})`], ["done", "Đã xong"], ["all", "Tất cả"]];

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="row" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>✅ Task</h2>
        <Badge color="blue">{openCount} chưa xong</Badge>
        <div className="spacer" />
        {TABS.map(([k, label]) => (
          <Button key={k} sm variant={tab === k ? "primary" : ""} onClick={() => setTab(k)}>{label}</Button>
        ))}
        <input className="input" style={{ maxWidth: 200 }} placeholder="🔍 Tìm task…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Listing thêm hạng mục cần Admin kiểm tra · Admin thêm task theo dõi/xử lý case. Xong thì bấm <b>✓</b>. Đánh dấu <b>⚑</b> để ưu tiên cao.
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="label">Task mới</label>
            <input className="input" style={{ width: "100%" }} placeholder="Nội dung cần kiểm tra / theo dõi…" value={na.title}
              onChange={(e) => setNa((p) => ({ ...p, title: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Ghi chú (tùy chọn)</label>
            <input className="input" style={{ width: "100%" }} placeholder="chi tiết…" value={na.note}
              onChange={(e) => setNa((p) => ({ ...p, note: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <label className="row" style={{ gap: 5, cursor: "pointer", paddingBottom: 6 }}>
            <input type="checkbox" checked={na.priority === "high"} onChange={(e) => setNa((p) => ({ ...p, priority: e.target.checked ? "high" : "normal" }))} /> ⚑ Ưu tiên
          </label>
          <Button variant="primary" onClick={add}>＋ Thêm task</Button>
        </div>
      </div>

      {list.length === 0 && <div className="card" style={{ padding: 24, textAlign: "center" }}><span className="muted">{tab === "open" ? "🎉 Không còn task nào chưa xong." : "Không có task nào."}</span></div>}

      {list.map((t) => {
        const high = t.priority === "high" && !t.done;
        return (
          <div key={t.id} className="card" style={{ marginBottom: 8, padding: "10px 14px",
            borderColor: high ? "var(--red)" : undefined, boxShadow: high ? "inset 4px 0 0 0 var(--red)" : undefined,
            opacity: t.done ? 0.6 : 1 }}>
            <div className="row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <button className="btn sm" title={t.done ? "Mở lại" : "Đánh dấu xong"} onClick={() => setDone(t, !t.done)}
                style={{ fontSize: 16, padding: "2px 9px", background: t.done ? "var(--green-bg)" : undefined }}>{t.done ? "✓" : "○"}</button>
              <div style={{ flex: 1, minWidth: 200 }}>
                {canEdit(t) ? (
                  <input className="input" style={{ width: "100%", fontWeight: 600, textDecoration: t.done ? "line-through" : undefined }}
                    defaultValue={t.title} onBlur={(e) => save(t, "title", e.target.value)} />
                ) : <div style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : undefined }}>{t.title}</div>}
                {(t.note || canEdit(t)) && (canEdit(t)
                  ? <input className="input" style={{ width: "100%", marginTop: 4, fontSize: 13 }} defaultValue={t.note} placeholder="ghi chú…"
                      onBlur={(e) => save(t, "note", e.target.value)} />
                  : <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{t.note}</div>)}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {high && <span className="badge red" style={{ fontSize: 10, marginRight: 6 }}>⚑ Ưu tiên</span>}
                  Tạo bởi <b>{t.createdByName}</b> · {fmt(t.createdAt)}
                  {t.done && <> · ✓ {t.doneByName} {fmt(t.doneAt)}</>}
                </div>
              </div>
              {canEdit(t) && <button className="btn sm" title="Đổi ưu tiên" onClick={() => togglePriority(t)}>{t.priority === "high" ? "⚑" : "⚐"}</button>}
              {canEdit(t) && <button className="btn sm" title="Xóa" onClick={() => remove(t)} style={{ color: "var(--red)" }}>✕</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
