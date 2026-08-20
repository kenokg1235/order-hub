import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Input, Modal, Badge } from "../ui.jsx";
import MultiFilter from "../MultiFilter.jsx";

// Payout per eBay account (store). Listing enters for own stores; Admin sees all.
// Grouped by store with per-store totals + a date-range filter for grand totals.
export default function Payout({ currentUser, refreshUser }) {
  const isAdmin = currentUser.role === "Admin";
  const isLister = currentUser.role === "Lister";
  const [payouts, setPayouts] = useState([]);
  const [stores, setStores] = useState([]);
  const [holds, setHolds] = useState([]);          // tiền còn hold trong tài khoản eBay
  const [holdDraft, setHoldDraft] = useState({});  // chỉnh tại chỗ trong bảng tổng hợp: {store:{amount,note}}
  const [storeInfo, setStoreInfo] = useState([]);  // trạng thái acc + ghi chú die (theo quyền store)
  const [accNoteDraft, setAccNoteDraft] = useState({});  // sửa ghi chú acc tại chỗ: {store:note}
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeSel, setStoreSel] = useState([]);   // gom/cộng payout theo store đã chọn ("" = tất cả)
  const [editing, setEditing] = useState(null);
  const [qa, setQa] = useState({ store: "", username: "", bank: "", bankName: "", amount: "", date: "", note: "" });
  const [err, setErr] = useState("");

  async function load() {
    try {
      setPayouts((await api.get("/api/payouts")).payouts);
      setStores((await api.get("/api/stores")).stores);
      setHolds((await api.get("/api/store-holds")).holds);
      setStoreInfo((await api.get("/api/stores/detail")).stores);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const myStores = isAdmin ? stores : (currentUser.storeNames || []);
  const money = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };

  const filtered = useMemo(() => payouts.filter((p) => {
    if (from && (p.date || "") < from) return false;
    if (to && (p.date || "") > to) return false;
    if (storeSel.length && !storeSel.includes(p.store)) return false;
    return true;
  }), [payouts, from, to, storeSel]);

  const groups = useMemo(() => {
    const m = {};
    for (const p of filtered) (m[p.store] || (m[p.store] = [])).push(p);
    return m;
  }, [filtered]);
  const grand = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  // Tổng hợp: cộng payout gom theo từng store (theo bộ lọc hiện tại), sắp theo tổng giảm dần.
  const storeSummary = useMemo(() => Object.entries(groups)
    .map(([store, list]) => ({ store, count: list.length, total: list.reduce((s, p) => s + (p.amount || 0), 0) }))
    .sort((a, b) => b.total - a.total), [groups]);

  async function del(id) {
    if (!confirm("Xóa payout này?")) return;
    try { await api.del(`/api/payouts/${id}`); load(); } catch (e) { setErr(e.message); }
  }
  // Hold hiển thị & sửa ngay trong bảng tổng hợp payout theo store.
  const holdMap = useMemo(() => Object.fromEntries(holds.map((h) => [h.store, h])), [holds]);
  // Gộp store có payout + store chỉ có hold (theo bộ lọc store hiện tại).
  const summaryRows = useMemo(() => {
    const m = new Map();
    for (const s of storeSummary) m.set(s.store, { ...s });
    for (const h of holds) { if (storeSel.length && !storeSel.includes(h.store)) continue; if (!m.has(h.store)) m.set(h.store, { store: h.store, count: 0, total: 0 }); }
    return [...m.values()].sort((a, b) => b.total - a.total || (holdMap[b.store]?.amount || 0) - (holdMap[a.store]?.amount || 0));
  }, [storeSummary, holds, storeSel, holdMap]);
  const shownHold = summaryRows.reduce((s, r) => s + (holdMap[r.store]?.amount || 0), 0);

  const holdVal = (store, k) => { const d = holdDraft[store]; if (d && k in d) return d[k]; const h = holdMap[store]; return h ? (k === "amount" ? (h.amount ?? "") : (h.note || "")) : ""; };
  const setHoldVal = (store, k, v) => setHoldDraft((p) => ({ ...p, [store]: { ...(p[store] || {}), [k]: v } }));
  const clearDraft = (store) => setHoldDraft((p) => { const n = { ...p }; delete n[store]; return n; });
  async function commitHold(store) {
    if (!holdDraft[store]) return;                       // không có thay đổi
    const amount = holdVal(store, "amount"), note = holdVal(store, "note");
    const h = holdMap[store] || {};
    const unchanged = String(amount === "" ? "" : amount) === String(h.amount ?? "") && (note || "") === (h.note || "");
    if (unchanged) { clearDraft(store); return; }
    if (amount === "" && !note && !holdMap[store]) { clearDraft(store); return; }   // không có gì để lưu
    try { await api.put(`/api/store-holds/${encodeURIComponent(store)}`, { amount: amount === "" ? 0 : amount, note }); clearDraft(store); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function delHold(store) {
    if (!confirm(`Xóa số tiền hold của store "${store}"?`)) return;
    try { await api.del(`/api/store-holds/${encodeURIComponent(store)}`); clearDraft(store); load(); } catch (e) { setErr(e.message); }
  }

  // Trạng thái acc + ghi chú die — sửa ngay trên trang Payout (Lister sửa store của mình).
  const infoMap = useMemo(() => Object.fromEntries(storeInfo.map((s) => [s.name, s])), [storeInfo]);
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const accNoteVal = (store) => { const d = accNoteDraft[store]; if (d !== undefined) return d; const i = infoMap[store]; return i ? (i.note || "") : ""; };
  const setAccNote = (store, v) => setAccNoteDraft((p) => ({ ...p, [store]: v }));
  async function saveStatus(store, { status, diedAt, note }) {
    try { await api.put(`/api/stores/${encodeURIComponent(store)}/status`, { status, diedAt, note }); setAccNoteDraft((p) => { const n = { ...p }; delete n[store]; return n; }); setErr(""); load(); }
    catch (e) { setErr(e.message); }
  }
  function setStatus(store, status) {
    const i = infoMap[store]; if (!i) return;
    const diedAt = status === "die" ? (i.diedAt || todayStr()) : "";
    saveStatus(store, { status, diedAt, note: accNoteVal(store) });
  }
  async function commitAccNote(store) {
    const i = infoMap[store]; if (!i || accNoteDraft[store] === undefined) return;
    if ((accNoteDraft[store] || "") === (i.note || "")) { setAccNoteDraft((p) => { const n = { ...p }; delete n[store]; return n; }); return; }
    saveStatus(store, { status: i.status || "active", diedAt: i.diedAt || "", note: accNoteDraft[store] });
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
      refreshUser?.();   // store mới (nếu có) được gán cho Lister → cập nhật danh sách store
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
        <span className="muted" style={{ fontSize: 13 }}>🏪</span>
        <MultiFilter options={[...new Set(payouts.map((p) => p.store).filter(Boolean))].sort().map((s) => ({ v: s, l: s }))}
          value={storeSel} onChange={setStoreSel} searchable />
        {(from || to || storeSel.length) && <Button sm onClick={() => { setFrom(""); setTo(""); setStoreSel([]); }}>✕ Xóa lọc</Button>}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Tổng hợp payout theo store + số tiền hold (nhập tay) ngay trong bảng */}
      {summaryRows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            📊 Tổng hợp payout theo store ({summaryRows.length} store)
            <div style={{ flex: 1 }} />
            <span className="badge blue" title="Tổng tiền còn hold của các store hiển thị">⏳ Tổng hold: {money(shownHold)}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", minWidth: 900 }}>
            <thead><tr>
              <th>Store</th><th style={{ textAlign: "right" }}>Số dòng</th><th style={{ textAlign: "right" }}>Tổng payout</th>
              <th style={{ width: 120 }}>💵 Tiền hold</th><th>📝 Ghi chú hold</th>
              <th style={{ width: 140 }}>⚡ Trạng thái acc</th><th>📝 Ghi chú acc</th>
            </tr></thead>
            <tbody>
              {summaryRows.map((s) => {
                const info = infoMap[s.store];
                const die = info && info.status === "die";
                return (
                <tr key={s.store} style={die ? { background: "var(--red-bg)" } : undefined}>
                  <td style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => setStoreSel([s.store])} title="Bấm để lọc riêng store này">🏪 {s.store || "(không store)"}</td>
                  <td style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setStoreSel([s.store])}>{s.count}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, cursor: "pointer" }} onClick={() => setStoreSel([s.store])}>{money(s.total)}</td>
                  <td>
                    <input className="input" type="number" placeholder="0" style={{ width: 100, textAlign: "right", padding: "4px 6px" }}
                      value={holdVal(s.store, "amount")}
                      onChange={(e) => setHoldVal(s.store, "amount", e.target.value)}
                      onBlur={() => commitHold(s.store)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, alignItems: "center" }}>
                      <input className="input" placeholder="Ghi chú…" style={{ flex: 1, padding: "4px 6px" }}
                        value={holdVal(s.store, "note")}
                        onChange={(e) => setHoldVal(s.store, "note", e.target.value)}
                        onBlur={() => commitHold(s.store)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                      {holdMap[s.store] && <span title="Xóa hold" onClick={() => delHold(s.store)} style={{ cursor: "pointer", color: "var(--red)", padding: "0 4px" }}>✕</span>}
                    </div>
                  </td>
                  <td>
                    {info ? (
                      <>
                        <select className="input" style={{ padding: "4px 6px", color: die ? "var(--red)" : "var(--green)", fontWeight: 700 }}
                          value={info.status || "active"} onChange={(e) => setStatus(s.store, e.target.value)}>
                          <option value="active">🟢 Hoạt động</option>
                          <option value="die">💀 Die</option>
                        </select>
                        {die && info.diedAt && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Die: {fmtDate(info.diedAt)}</div>}
                      </>
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {info ? (
                      <input className="input" placeholder={die ? "Lý do die…" : "Ghi chú acc…"} style={{ width: "100%", padding: "4px 6px" }}
                        value={accNoteVal(s.store)}
                        onChange={(e) => setAccNote(s.store, e.target.value)}
                        onBlur={() => commitAccNote(s.store)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)", background: "var(--green-bg)" }}>
              <td>TỔNG CỘNG{storeSel.length ? ` (${storeSel.length} store đã chọn)` : ""}</td>
              <td style={{ textAlign: "right" }}>{filtered.length}</td>
              <td style={{ textAlign: "right", color: "#16a34a" }}>{money(grand)}</td>
              <td style={{ textAlign: "right", color: "var(--primary)" }}>{money(shownHold)}</td>
              <td></td><td></td><td></td>
            </tr></tfoot>
          </table>
          </div>
          <div className="muted" style={{ fontSize: 12, padding: "8px 14px" }}>
            💵 Gõ trực tiếp <b>Tiền hold</b> / <b>Ghi chú</b> của từng store rồi bấm ra ngoài (hoặc Enter) để lưu. Đây là số tiền eBay còn giữ lại, nhập tay.
          </div>
        </div>
      )}

      {/* Quick-add bar: chọn store + bank + ngày một lần, gõ số tiền → Enter để thêm liên tục */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ Nhập nhanh payout</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <div><div className="label">Store</div>
            {isAdmin ? (
              <select className="input" style={{ minWidth: 130 }} value={qa.store} onChange={(e) => upQa("store", e.target.value)}>
                <option value="">— chọn —</option>
                {myStores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input className="input" list="payout-my-stores" style={{ minWidth: 130 }} value={qa.store}
                placeholder="Chọn store, hoặc gõ store MỚI" onChange={(e) => upQa("store", e.target.value)} />
            )}
            <datalist id="payout-my-stores">{myStores.map((s) => <option key={s} value={s} />)}</datalist></div>
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
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); refreshUser?.(); }} />
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
