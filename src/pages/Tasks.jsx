import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Task — Lister thêm hạng mục cần Admin kiểm tra; Admin thêm task theo dõi/xử lý case.
export default function Tasks({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const isManager = isAdmin || currentUser.role === "Lister";   // tạo/sửa/đánh dấu xong task
  const [tasks, setTasks] = useState([]);
  const [na, setNa] = useState({ title: "", note: "", orderNo: "", priority: "normal" });
  const [tab, setTab] = useState("open");   // open | done | all
  const [cat, setCat] = useState("all");    // all | admin | other — phân loại theo đơn của Admin
  const [q, setQ] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [noteEdit, setNoteEdit] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setTasks((await api.get("/api/tasks")).tasks);
      setAdminNote((await api.get("/api/settings")).settings?.adminNoteForLister || "");
    } catch (e) { setErr(e.message); }
  }
  async function saveAdminNote(text) {
    try { await api.put("/api/settings/adminNoteForLister", { value: text }); setAdminNote(text); setNoteEdit(false); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const canEdit = (t) => isAdmin || t.createdBy === currentUser.id;
  const fmt = (ts) => { if (!ts) return ""; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks
      .filter((t) => (tab === "all" ? true : tab === "done" ? t.done : !t.done))
      .filter((t) => (cat === "all" ? true : cat === "admin" ? t.claimedByAdmin : !t.claimedByAdmin))
      .filter((t) => !s || [t.title, t.note, t.orderNo, t.createdByName, t.response, t.claimedName].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [tasks, tab, cat, q]);
  const openCount = tasks.filter((t) => !t.done).length;
  const adminOpenCount = tasks.filter((t) => !t.done && t.claimedByAdmin).length;
  // Chia list theo nhóm đơn Admin để hiển thị tách section (khi đang xem "Tất cả loại").
  const adminList = list.filter((t) => t.claimedByAdmin);
  const otherList = list.filter((t) => !t.claimedByAdmin);

  async function add() {
    if (!na.title.trim()) { setErr("Nhập nội dung task"); return; }
    try { await api.post("/api/tasks", na); setNa({ title: "", note: "", orderNo: "", priority: "normal" }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function respond(t, text) {
    if (String(text) === String(t.response ?? "")) return;
    try { const { task } = await api.post(`/api/tasks/${t.id}/respond`, { response: text }); setTasks((p) => p.map((x) => x.id === t.id ? task : x)); }
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
      {/* Phân loại theo đơn của Admin để dễ nhìn */}
      <div className="row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>Phân loại:</span>
        {[["all", "Tất cả loại"], ["admin", `👑 Đơn của Admin${adminOpenCount ? ` (${adminOpenCount})` : ""}`], ["other", "Đơn khác / TK"]].map(([k, label]) => (
          <Button key={k} sm variant={cat === k ? "primary" : ""} onClick={() => setCat(k)}>{label}</Button>
        ))}
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        {isManager
          ? <>Admin/Listing tạo task (gắn <b>mã order</b> hoặc để trống nếu là task tài khoản). Task gắn đơn → nhân viên nhận đơn sẽ thấy & <b>phản hồi</b>. Xong bấm <b>✓</b>, <b>⚑</b> để ưu tiên cao.</>
          : <>Đây là các task liên quan đến <b>đơn bạn đang nhận</b>. Bấm vào ô <b>Phản hồi</b> để trả lời cho Admin/Listing.</>}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Ghi chú của Admin cho Lister xem (dùng chung với Sheet Tổng) */}
      {isManager && (adminNote || isAdmin) && (
        <div className="card" style={{ marginBottom: 12, padding: "10px 14px", background: "#fffbea", borderColor: "#eab308" }}>
          {noteEdit ? (
            <div>
              <textarea className="input" rows={3} defaultValue={adminNote} id="adminNoteDraftTask"
                placeholder="Ghi chú / thông báo cho Listing…" style={{ width: "100%", resize: "vertical" }} />
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <Button sm variant="primary" onClick={() => saveAdminNote(document.getElementById("adminNoteDraftTask").value)}>Lưu</Button>
                <Button sm onClick={() => setNoteEdit(false)}>Hủy</Button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>📢</span>
              <div style={{ flex: 1, whiteSpace: "pre-wrap", fontWeight: 500 }}>
                {adminNote || <span className="muted">(Chưa có ghi chú — bấm Sửa để thêm thông báo cho Listing)</span>}
              </div>
              {isAdmin && <Button sm onClick={() => setNoteEdit(true)}>✎ Sửa</Button>}
            </div>
          )}
        </div>
      )}

      {isManager && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Task mới</label>
              <input className="input" style={{ width: "100%" }} placeholder="Nội dung cần kiểm tra / theo dõi…" value={na.title}
                onChange={(e) => setNa((p) => ({ ...p, title: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            </div>
            <div style={{ width: 150 }}>
              <label className="label">Mã order (tùy chọn)</label>
              <input className="input" style={{ width: "100%" }} placeholder="để trống nếu là TK" value={na.orderNo}
                title="Gắn mã order để nhân viên nhận đơn thấy & phản hồi. Task tài khoản thì để trống."
                onChange={(e) => setNa((p) => ({ ...p, orderNo: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
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
      )}

      {list.length === 0 && <div className="card" style={{ padding: 24, textAlign: "center" }}><span className="muted">{tab === "open" ? "🎉 Không còn task nào chưa xong." : "Không có task nào."}</span></div>}

      {/* Khi xem "Tất cả loại": tách section đơn Admin lên trên cho dễ nhìn */}
      {cat === "all" ? (
        <>
          {adminList.length > 0 && (
            <>
              <div className="row" style={{ gap: 8, alignItems: "center", margin: "6px 0 8px" }}>
                <span className="badge" style={{ background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>👑 Task dính đơn của Admin ({adminList.length})</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              {adminList.map(taskCard)}
              <div style={{ height: 10 }} />
              {otherList.length > 0 && (
                <div className="row" style={{ gap: 8, alignItems: "center", margin: "6px 0 8px" }}>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Task khác</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              )}
            </>
          )}
          {otherList.map(taskCard)}
        </>
      ) : list.map(taskCard)}
    </div>
  );

  function taskCard(t) {
    const high = t.priority === "high" && !t.done;
    return (
      <div key={t.id} className="card" style={{ marginBottom: 8, padding: "10px 14px",
        borderColor: high ? "var(--red)" : t.claimedByAdmin ? "#eab308" : undefined,
        boxShadow: high ? "inset 4px 0 0 0 var(--red)" : t.claimedByAdmin ? "inset 4px 0 0 0 #eab308" : undefined,
        opacity: t.done ? 0.6 : 1 }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          {isManager && <button className="btn sm" title={t.done ? "Mở lại" : "Đánh dấu xong"} onClick={() => setDone(t, !t.done)}
            style={{ fontSize: 16, padding: "2px 9px", background: t.done ? "var(--green-bg)" : undefined }}>{t.done ? "✓" : "○"}</button>}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
              {t.orderNo
                ? <span className="badge blue" style={{ fontSize: 11 }}>📦 Đơn {t.orderNo}</span>
                : <span className="badge" style={{ fontSize: 11 }}>💳 Task tài khoản</span>}
              {t.claimedByAdmin && <span className="badge" style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>👑 Đơn Admin{t.claimedName ? ` · ${t.claimedName}` : ""}</span>}
              {high && <span className="badge red" style={{ fontSize: 10 }}>⚑ Ưu tiên</span>}
              {t.done && <span className="badge green" style={{ fontSize: 10 }}>✓ Xong</span>}
            </div>
            {canEdit(t) ? (
              <input className="input" style={{ width: "100%", fontWeight: 600, textDecoration: t.done ? "line-through" : undefined }}
                defaultValue={t.title} onBlur={(e) => save(t, "title", e.target.value)} />
            ) : <div style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : undefined }}>{t.title}</div>}
            {(t.note || canEdit(t)) && (canEdit(t)
              ? <input className="input" style={{ width: "100%", marginTop: 4, fontSize: 13 }} defaultValue={t.note} placeholder="ghi chú…"
                  onBlur={(e) => save(t, "note", e.target.value)} />
              : <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{t.note}</div>)}

            {/* Phản hồi của nhân viên xử lý đơn (chỉ với task gắn đơn) */}
            {t.orderNo && (
              <div style={{ marginTop: 6, borderTop: "1px dashed var(--border)", paddingTop: 6 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 3 }}>💬 Phản hồi của NV xử lý{t.responseByName ? ` — ${t.responseByName} · ${fmt(t.responseAt)}` : ""}:</div>
                <input className="input" style={{ width: "100%", fontSize: 13 }} defaultValue={t.response} placeholder="nhân viên nhận đơn phản hồi ở đây…"
                  onBlur={(e) => respond(t, e.target.value)} />
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Tạo bởi <b>{t.createdByName}</b> · {fmt(t.createdAt)}
              {t.done && <> · ✓ {t.doneByName} {fmt(t.doneAt)}</>}
            </div>
          </div>
          {canEdit(t) && <button className="btn sm" title="Đổi ưu tiên" onClick={() => togglePriority(t)}>{t.priority === "high" ? "⚑" : "⚐"}</button>}
          {canEdit(t) && <button className="btn sm" title="Xóa" onClick={() => remove(t)} style={{ color: "var(--red)" }}>✕</button>}
        </div>
      </div>
    );
  }
}
