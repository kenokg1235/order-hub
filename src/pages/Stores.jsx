import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Admin: manage the store list (trạng thái acc + ghi chú die) + assign stores to Listing.
export default function Stores() {
  const [details, setDetails] = useState([]);   // [{name,status,note,diedAt,...}]
  const [listers, setListers] = useState([]);
  const [newStore, setNewStore] = useState("");
  const [editing, setEditing] = useState(null);  // store đang sửa trạng thái
  const [err, setErr] = useState("");

  const stores = details.map((d) => d.name);

  async function load() {
    try {
      setDetails((await api.get("/api/stores/detail")).stores);
      setListers(((await api.get("/api/users")).users).filter((u) => u.role === "Lister"));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };

  async function addStore() {
    const n = newStore.trim(); if (!n) return;
    try { await api.post("/api/stores", { name: n }); setNewStore(""); load(); } catch (e) { setErr(e.message); }
  }
  async function delStore(name) {
    if (!confirm(`Xóa store "${name}" khỏi danh sách? (đơn cũ giữ nguyên)`)) return;
    try { await api.del(`/api/stores/${encodeURIComponent(name)}`); load(); } catch (e) { setErr(e.message); }
  }
  async function renameStore(name) {
    const nn = prompt(`Đổi tên store "${name}" thành:`, name);
    if (nn === null) return;
    const t = nn.trim();
    if (!t || t === name) return;
    if (!confirm(`Đổi "${name}" → "${t}"?\nMọi đơn, payout và quyền store của nhân viên sẽ cập nhật theo.`)) return;
    try { await api.put(`/api/stores/${encodeURIComponent(name)}`, { newName: t }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function toggleAssign(lister, store) {
    const has = lister.storeNames.includes(store);
    const next = has ? lister.storeNames.filter((s) => s !== store) : [...lister.storeNames, store];
    try {
      const { user } = await api.put(`/api/users/${lister.id}`, { storeNames: next });
      setListers((p) => p.map((l) => l.id === lister.id ? user : l));
    } catch (e) { setErr(e.message); }
  }

  const dieCount = details.filter((d) => d.status === "die").length;

  return (
    <div>
      <h2 style={{ margin: "0 0 14px" }}>Quản lý Store</h2>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Thêm store mới</label>
        <div className="row">
          <input className="input" style={{ maxWidth: 280 }} value={newStore} placeholder="Tên store (vd Ha US 19)"
            onChange={(e) => setNewStore(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addStore(); }} />
          <Button variant="primary" onClick={addStore}>＋ Thêm store</Button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>Danh sách tài khoản eBay</b>
          <Badge color="blue">{details.length} store</Badge>
          {dieCount > 0 && <Badge color="red">{dieCount} die</Badge>}
        </div>
        <table className="tbl">
          <thead><tr><th>Store</th><th>Trạng thái</th><th>Ngày die</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.name} style={d.status === "die" ? { background: "var(--red-bg)" } : undefined}>
                <td style={{ fontWeight: 600 }}>🏪 {d.name}</td>
                <td>{d.status === "die"
                  ? <span className="badge red">💀 Die</span>
                  : <span className="badge green">🟢 Hoạt động</span>}</td>
                <td>{d.status === "die" ? (fmtDate(d.diedAt) || <span className="muted">—</span>) : <span className="muted">—</span>}</td>
                <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{d.note}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Button sm onClick={() => setEditing(d)}>Trạng thái</Button>
                  <Button sm onClick={() => renameStore(d.name)} style={{ marginLeft: 4 }}>Đổi tên</Button>
                  <Button sm variant="danger" onClick={() => delStore(d.name)} style={{ marginLeft: 4 }}>✕</Button>
                </td>
              </tr>
            ))}
            {details.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>Chưa có store nào</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>
          Phân quyền store cho Listing
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> — tích store mà mỗi nhân viên Listing được xử lý</span>
        </div>
        <table className="tbl">
          <thead><tr><th style={{ width: 240 }}>Nhân viên Listing</th><th>Store được cấp</th></tr></thead>
          <tbody>
            {listers.map((l) => (
              <tr key={l.id}>
                <td><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.email}</div></td>
                <td>
                  <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                    {stores.map((s) => (
                      <label key={s} className="row" style={{ gap: 5, cursor: "pointer" }}>
                        <input type="checkbox" checked={l.storeNames.includes(s)} onChange={() => toggleAssign(l, s)} /> {s}
                      </label>
                    ))}
                    {stores.length === 0 && <span className="muted">Thêm store ở trên trước</span>}
                  </div>
                </td>
              </tr>
            ))}
            {listers.length === 0 && (
              <tr><td colSpan={2} className="muted" style={{ textAlign: "center", padding: 22 }}>
                Chưa có nhân viên Listing. Tạo ở trang Người dùng (vai trò Listing).
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <StatusModal store={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function StatusModal({ store, onClose, onSaved }) {
  const [status, setStatus] = useState(store.status || "active");
  const [note, setNote] = useState(store.note || "");
  const [diedAt, setDiedAt] = useState(store.diedAt || "");
  const [err, setErr] = useState("");
  // Chuyển sang die mà chưa có ngày → mặc định hôm nay để nhập nhanh.
  const setDie = (v) => { setStatus(v); if (v === "die" && !diedAt) { const d = new Date(); setDiedAt(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); } };
  async function save() {
    try { await api.put(`/api/stores/${encodeURIComponent(store.name)}/status`, { status, note, diedAt }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Trạng thái — {store.name}</h3><div className="spacer" /><Button sm onClick={onClose}>✕</Button></div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Trạng thái acc</label>
            <select className="input" value={status} onChange={(e) => setDie(e.target.value)}>
              <option value="active">🟢 Hoạt động</option>
              <option value="die">💀 Die</option>
            </select>
          </div>
          {status === "die" && (
            <div className="field">
              <label className="label">Ngày acc die</label>
              <input type="date" className="input" value={diedAt} onChange={(e) => setDiedAt(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label className="label">Ghi chú</label>
            <textarea className="input" rows={3} value={note} placeholder={status === "die" ? "Lý do die, ghi chú xử lý…" : "Ghi chú (tùy chọn)"}
              onChange={(e) => setNote(e.target.value)} style={{ resize: "vertical" }} />
          </div>
          {err && <div style={{ color: "var(--red)" }}>{err}</div>}
        </div>
        <div className="modal-foot"><Button onClick={onClose}>Hủy</Button><Button variant="primary" onClick={save}>Lưu</Button></div>
      </div>
    </div>
  );
}
