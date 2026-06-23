import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button } from "../ui.jsx";

// Admin: manage the store list + assign stores to Listing employees.
export default function Stores() {
  const [stores, setStores] = useState([]);
  const [listers, setListers] = useState([]);
  const [newStore, setNewStore] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try {
      setStores((await api.get("/api/stores")).stores);
      setListers(((await api.get("/api/users")).users).filter((u) => u.role === "Lister"));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

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
        <div className="row" style={{ flexWrap: "wrap", marginTop: 14, gap: 8 }}>
          {stores.map((s) => (
            <span key={s} className="badge" style={{ gap: 6, fontSize: 13 }}>
              🏪 {s}
              <span style={{ cursor: "pointer" }} title="Đổi tên" onClick={() => renameStore(s)}>✎</span>
              <span style={{ cursor: "pointer", color: "var(--red)" }} title="Xóa" onClick={() => delStore(s)}>✕</span>
            </span>
          ))}
          {stores.length === 0 && <span className="muted">Chưa có store nào</span>}
        </div>
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
    </div>
  );
}
