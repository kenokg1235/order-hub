import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Danh sách đen — username khách hàng khó. Dành cho Lister + Admin.
export default function Blacklist() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [na, setNa] = useState({ username: "", reason: "" });
  const [err, setErr] = useState("");

  async function load() {
    try { setItems((await api.get("/api/blacklist")).blacklist); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const fmtDate = (ts) => { if (!ts) return ""; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((b) => !s || [b.username, b.reason, b.createdByName].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [items, q]);

  async function add() {
    if (!na.username.trim()) { setErr("Nhập username khách hàng"); return; }
    try { await api.post("/api/blacklist", na); setNa({ username: "", reason: "" }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function save(b, field, value) {
    if (String(value) === String(b[field] ?? "")) return;
    try { await api.put(`/api/blacklist/${b.id}`, { [field]: value }); load(); } catch (e) { setErr(e.message); }
  }
  async function remove(b) {
    if (!confirm(`Xóa "${b.username}" khỏi danh sách đen?`)) return;
    try { await api.del(`/api/blacklist/${b.id}`); setItems((p) => p.filter((x) => x.id !== b.id)); } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>⛔ Danh sách đen</h2>
        <Badge color="red">{items.length} khách</Badge>
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 240 }} placeholder="🔍 Tìm username / lý do…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>Username khách hàng khó — để nhân viên listing kiểm tra trước khi xử lý/ship đơn.</div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Username khách</label>
            <input className="input" style={{ width: 200 }} placeholder="vd: johnnymitch84" value={na.username}
              onChange={(e) => setNa((p) => ({ ...p, username: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="label">Lý do (tùy chọn)</label>
            <input className="input" style={{ width: "100%" }} placeholder="vd: hay mở case, đòi refund vô lý…" value={na.reason}
              onChange={(e) => setNa((p) => ({ ...p, reason: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <Button variant="primary" onClick={add}>＋ Thêm vào danh sách đen</Button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 700 }}>
          <thead><tr>
            <th>Username</th><th>Lý do</th><th>Người thêm</th><th>Ngày</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>
                  <input className="input" style={{ padding: "3px 6px", width: 180, fontWeight: 600 }} defaultValue={b.username}
                    onBlur={(e) => save(b, "username", e.target.value)} />
                </td>
                <td>
                  <input className="input" style={{ padding: "3px 6px", width: 260 }} defaultValue={b.reason} placeholder="—"
                    onBlur={(e) => save(b, "reason", e.target.value)} />
                </td>
                <td className="muted">{b.createdByName}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(b.createdAt)}</td>
                <td><Button sm variant="danger" onClick={() => remove(b)}>✕</Button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                {items.length ? "Không khớp tìm kiếm." : "Chưa có khách nào trong danh sách đen."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
