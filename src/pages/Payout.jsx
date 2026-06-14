import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Input, Modal, Badge } from "../ui.jsx";

// Payout per eBay account (store). Listing enters for own stores; Admin sees all.
// Grouped by store with per-store totals + a date-range filter for grand totals.
export default function Payout({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [payouts, setPayouts] = useState([]);
  const [stores, setStores] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [qa, setQa] = useState({ store: "", username: "", bank: "", bankName: "", amount: "", date: "", note: "" });
  const [err, setErr] = useState("");

  async function load() {
    try {
      setPayouts((await api.get("/api/payouts")).payouts);
      setStores((await api.get("/api/stores")).stores);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const myStores = isAdmin ? stores : (currentUser.storeNames || []);
  const money = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };

  const filtered = useMemo(() => payouts.filter((p) => {
    if (from && (p.date || "") < from) return false;
    if (to && (p.date || "") > to) return false;
    return true;
  }), [payouts, from, to]);

  const groups = useMemo(() => {
    const m = {};
    for (const p of filtered) (m[p.store] || (m[p.store] = [])).push(p);
    return m;
  }, [filtered]);
  const grand = filtered.reduce((s, p) => s + (p.amount || 0), 0);

  async function del(id) {
    if (!confirm("Xóa payout này?")) return;
    try { await api.del(`/api/payouts/${id}`); load(); } catch (e) { setErr(e.message); }
  }
  const upQa = (k, v) => setQa((p) => ({ ...p, [k]: v }));
  async function quickAdd() {
    if (!qa.store) { setErr("Chọn store trước"); return; }
    if (!qa.amount) { setErr("Nhập số tiền"); return; }
    try {
      await api.post("/api/payouts", qa);
      setQa((p) => ({ ...p, username: "", amount: "", note: "" }));   // keep store/bank/bankName/date
      setErr("");
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Payout</h2>
        <Badge color="green">Tổng: {money(grand)}</Badge>
        <Badge color="blue">{filtered.length} dòng</Badge>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>Từ</span>
        <input type="date" className="input" style={{ maxWidth: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted" style={{ fontSize: 13 }}>đến</span>
        <input type="date" className="input" style={{ maxWidth: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        {(from || to) && <Button sm onClick={() => { setFrom(""); setTo(""); }}>✕ Xóa ngày</Button>}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Quick-add bar: chọn store + bank + ngày một lần, gõ số tiền → Enter để thêm liên tục */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ Nhập nhanh payout</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <div><div className="label">Store</div>
            <select className="input" style={{ minWidth: 130 }} value={qa.store} onChange={(e) => upQa("store", e.target.value)}>
              <option value="">— chọn —</option>
              {myStores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><div className="label">Username</div><input className="input" style={{ width: 110 }} value={qa.username} onChange={(e) => upQa("username", e.target.value)} /></div>
          <div><div className="label">Bank</div><input className="input" style={{ width: 90 }} value={qa.bank} onChange={(e) => upQa("bank", e.target.value)} /></div>
          <div><div className="label">Name gắn bank</div><input className="input" style={{ width: 110 }} value={qa.bankName} onChange={(e) => upQa("bankName", e.target.value)} /></div>
          <div><div className="label">Số tiền</div><input className="input" type="number" style={{ width: 95 }} value={qa.amount}
            onChange={(e) => upQa("amount", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }} /></div>
          <div><div className="label">Ngày</div><input type="date" className="input" style={{ width: 145 }} value={qa.date} onChange={(e) => upQa("date", e.target.value)} /></div>
          <div><div className="label">Note</div><input className="input" style={{ width: 120 }} value={qa.note}
            onChange={(e) => upQa("note", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }} /></div>
          <Button variant="primary" onClick={quickAdd}>＋ Thêm</Button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Mẹo: chọn <b>Store + Bank + Ngày</b> một lần, rồi gõ <b>Số tiền</b> → nhấn <b>Enter</b> để thêm liên tục. Bank/Ngày được giữ lại cho dòng kế.
        </div>
      </div>

      {Object.keys(groups).length === 0 && (
        <div className="muted">Chưa có payout nào{(from || to) ? " trong khoảng ngày này" : ""}.</div>
      )}
      {Object.keys(groups).sort().map((store) => {
        const list = groups[store];
        const total = list.reduce((s, p) => s + (p.amount || 0), 0);
        return (
          <div key={store} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <b>🏪 {store || "(không store)"}</b>
              <Badge color="blue">{list.length}</Badge>
              <div style={{ flex: 1 }} />
              <span className="badge green">Tổng: {money(total)}</span>
            </div>
            <table className="tbl">
              <thead><tr>
                <th>Username</th><th>Bank</th><th>Name gắn bank</th><th>Số tiền</th><th>Ngày</th><th>Note</th><th></th>
              </tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.username}</td>
                    <td>{p.bank}</td>
                    <td>{p.bankName}</td>
                    <td style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "normal" }}>{p.note}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Button sm onClick={() => setEditing(p)}>Sửa</Button>
                      <Button sm variant="danger" onClick={() => del(p.id)} style={{ marginLeft: 4 }}>✕</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {editing && (
        <PayoutModal payout={editing} stores={myStores}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function PayoutModal({ payout, stores, onClose, onSaved }) {
  const isNew = !payout.id;
  const [f, setF] = useState({
    store: payout.store || (stores[0] || ""), username: payout.username || "", bank: payout.bank || "",
    bankName: payout.bankName || "", amount: payout.amount || 0, date: payout.date || "", note: payout.note || "",
  });
  const [err, setErr] = useState("");
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr("");
    try {
      if (isNew) await api.post("/api/payouts", f);
      else await api.put(`/api/payouts/${payout.id}`, f);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title={isNew ? "Thêm payout" : "Sửa payout"} onClose={onClose}
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" onClick={save}>Lưu</Button></>}>
      <div className="field">
        <label className="label">Tài khoản eBay (store)</label>
        <select className="input" value={f.store} onChange={(e) => up("store", e.target.value)}>
          <option value="">— chọn store —</option>
          {stores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Input label="Username" value={f.username} onChange={(e) => up("username", e.target.value)} />
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><Input label="Bank" value={f.bank} onChange={(e) => up("bank", e.target.value)} /></div>
        <div style={{ flex: 1 }}><Input label="Name gắn bank" value={f.bankName} onChange={(e) => up("bankName", e.target.value)} /></div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><Input label="Số tiền payout" type="number" value={f.amount} onChange={(e) => up("amount", e.target.value)} /></div>
        <div style={{ flex: 1 }}>
          <label className="label">Ngày</label>
          <input type="date" className="input" value={f.date} onChange={(e) => up("date", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label">Note</label>
        <textarea className="input" rows={2} value={f.note} onChange={(e) => up("note", e.target.value)} style={{ resize: "vertical" }} />
      </div>
      {err && <div style={{ color: "var(--red)" }}>{err}</div>}
    </Modal>
  );
}
