import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Proxy accounts — Admin thêm danh sách; nhân viên xử lý tự chọn "đang dùng",
// tên hiện cho tất cả mọi người. Mọi thành viên xử lý đều đổi được.
export default function Proxy({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [na, setNa] = useState({ name: "", note: "" });
  const [err, setErr] = useState("");

  async function load() {
    try { setItems((await api.get("/api/proxies")).proxies); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  // Tự cập nhật 15s để mọi người thấy ngay ai đang dùng proxy nào.
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (ts) => { if (!ts) return ""; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p) => !s || [p.name, p.note, p.adminNote, p.userName].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [items, q]);

  const inUse = items.filter((p) => p.userId).length;

  function replace(px) { setItems((p) => p.map((x) => x.id === px.id ? px : x)); }
  async function addProxy() {
    if (!na.name.trim()) { setErr("Nhập tên/tài khoản proxy"); return; }
    try { await api.post("/api/proxies", na); setNa({ name: "", note: "" }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function saveField(p, field, value) {
    if (String(value) === String(p[field] ?? "")) return;
    try { replace((await api.put(`/api/proxies/${p.id}`, { [field]: value })).proxy); } catch (e) { setErr(e.message); }
  }
  async function saveAdminNote(p, value) {
    if (String(value) === String(p.adminNote ?? "")) return;
    try { replace((await api.post(`/api/proxies/${p.id}/admin-note`, { adminNote: value })).proxy); } catch (e) { setErr(e.message); }
  }
  async function claim(p) { try { replace((await api.post(`/api/proxies/${p.id}/use`, {})).proxy); } catch (e) { setErr(e.message); } }
  async function release(p) { try { replace((await api.post(`/api/proxies/${p.id}/use`, { release: true })).proxy); } catch (e) { setErr(e.message); } }
  async function remove(p) {
    if (!confirm(`Xóa proxy "${p.name}"?`)) return;
    try { await api.del(`/api/proxies/${p.id}`); setItems((x) => x.filter((y) => y.id !== p.id)); } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>🌐 Proxy</h2>
        <Badge color="blue">{items.length} proxy</Badge>
        <Badge color="green">{inUse} đang dùng</Badge>
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 240 }} placeholder="🔍 Tìm proxy / ghi chú / người dùng…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Ai muốn dùng proxy nào thì bấm <b>✋ Tôi dùng</b> — tên bạn hiện cho mọi người. Dùng xong bấm <b>Nhả</b>. Mọi thành viên đều đổi được.
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {isAdmin && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label className="label">Tài khoản / địa chỉ proxy</label>
              <input className="input" style={{ width: 260 }} placeholder="vd: 123.45.67.89:8080 : user : pass" value={na.name}
                onChange={(e) => setNa((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addProxy(); }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Ghi chú (tùy chọn)</label>
              <input className="input" style={{ width: "100%" }} placeholder="vd: US - dùng cho store X…" value={na.note}
                onChange={(e) => setNa((p) => ({ ...p, note: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addProxy(); }} />
            </div>
            <Button variant="primary" onClick={addProxy}>＋ Thêm proxy</Button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 760 }}>
          <thead><tr>
            <th>Proxy</th><th>Ghi chú</th><th title="Nhân viên ghi để báo Admin (mọi người sửa được)">📝 Note cho Admin</th><th>Người sử dụng</th><th></th>{isAdmin && <th></th>}
          </tr></thead>
          <tbody>
            {filtered.map((p) => {
              const mine = p.userId === currentUser.id;
              return (
                <tr key={p.id} style={{ background: p.userId ? (mine ? "var(--primary-bg)" : "#fff7ed") : undefined }}>
                  <td style={{ fontWeight: 600, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {isAdmin
                      ? <input className="input" style={{ padding: "3px 6px", width: 240, fontFamily: "monospace" }} defaultValue={p.name}
                          onBlur={(e) => saveField(p, "name", e.target.value)} />
                      : p.name}
                  </td>
                  <td>
                    {isAdmin
                      ? <input className="input" style={{ padding: "3px 6px", width: 220 }} defaultValue={p.note} placeholder="—"
                          onBlur={(e) => saveField(p, "note", e.target.value)} />
                      : (p.note || <span className="muted">—</span>)}
                  </td>
                  <td>
                    <input className="input" style={{ padding: "3px 6px", width: 200 }} defaultValue={p.adminNote} placeholder="báo Admin (vd: proxy lỗi…)"
                      onBlur={(e) => saveAdminNote(p, e.target.value)} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {p.userName
                      ? <><Badge color={mine ? "blue" : "amber"}>👤 {p.userName}{mine ? " (bạn)" : ""}</Badge>
                          {p.usedAt ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{fmtTime(p.usedAt)}</span> : null}</>
                      : <span className="muted">— trống —</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {mine
                      ? <Button sm variant="danger" onClick={() => release(p)}>Nhả</Button>
                      : <>
                          <Button sm variant="primary" onClick={() => claim(p)}>✋ Tôi dùng</Button>
                          {p.userId && <Button sm onClick={() => release(p)} style={{ marginLeft: 4 }} title="Nhả giúp (mọi thành viên đổi được)">Nhả</Button>}
                        </>}
                  </td>
                  {isAdmin && <td><Button sm variant="danger" onClick={() => remove(p)}>✕</Button></td>}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={isAdmin ? 6 : 5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                {items.length ? "Không khớp tìm kiếm." : (isAdmin ? "Chưa có proxy nào. Thêm ở thanh trên." : "Chưa có proxy nào — Admin thêm.")}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
