import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";
import { rowBg } from "../statusColors.js";
import { useFormulaBar } from "../useFormulaBar.jsx";
import MultiFilter from "../MultiFilter.jsx";

// Sheet Con — team members process their divided orders. One order groups 1+ card
// rows (purchases); order-level cells use rowSpan. Master status drives row colour.
export default function TeamSheet({ currentUser, teams }) {
  const isAdmin = currentUser.role === "Admin";
  const isManager = isAdmin || currentUser.role === "Leader";   // can distribute orders
  const [orders, setOrders] = useState([]);
  const [procStatuses, setProcStatuses] = useState([]);
  const [colors, setColors] = useState({});
  const [assignUsers, setAssignUsers] = useState([]);
  const [filter, setFilter] = useState("all"); // all | unclaimed | mine
  const [teamFilter, setTeamFilter] = useState(""); // "" = all teams
  const [q, setQ] = useState("");
  const [cf, setCf] = useState({});                // per-column filters
  const [masterStatuses, setMasterStatuses] = useState([]);
  const [months, setMonths] = useState([]);
  const [activeMonth, setActiveMonth] = useState("");
  const [month, setMonth] = useState("");
  const [err, setErr] = useState("");
  const { cellProps, Bar } = useFormulaBar();

  async function loadOrders(m) {
    try { setOrders((await api.get(`/api/team-orders?month=${encodeURIComponent(m || month)}`)).orders); } catch (e) { setErr(e.message); }
  }
  async function load() {
    try {
      const s = (await api.get("/api/settings")).settings;
      setProcStatuses(s.processStatuses || []);
      setMasterStatuses(s.masterStatuses || []);
      setColors(s.statusColors || {});
      if (isManager) setAssignUsers((await api.get("/api/assignable-users")).users);
      const mo = await api.get("/api/months");
      setMonths(mo.months); setActiveMonth(mo.activeMonth);
      setMonth((cur) => cur || mo.activeMonth);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (month) loadOrders(month); }, [month]);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || id;
  const canClaim = (o) => isAdmin || ((currentUser.teamIds || []).includes(o.team));
  const assignableFor = (o) => assignUsers.filter((u) => (u.teamIds || []).includes(o.team));

  const myTeamOptions = isAdmin ? teams : teams.filter((t) => (currentUser.teamIds || []).includes(t.id));
  const storeOptions = useMemo(() => [...new Set(orders.map((o) => o.store).filter(Boolean))].sort(), [orders]);

  const setF = (key, val) => setCf((p) => ({ ...p, [key]: val }));
  const clearFilters = () => { setCf({}); setQ(""); };
  const activeFilters = Object.values(cf).filter((v) => Array.isArray(v) ? v.length : v).length + (q.trim() ? 1 : 0);
  const fText = (key, w = 80) => (
    <input className="input" style={{ padding: "3px 5px", width: w, fontSize: 12 }}
      value={cf[key] || ""} onChange={(e) => setF(key, e.target.value)} placeholder="lọc" />
  );
  const fEnum = (key, opts) => (
    <select className="input" style={{ padding: "3px 5px", fontSize: 12, minWidth: 70 }}
      value={cf[key] || ""} onChange={(e) => setF(key, e.target.value)}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const fMulti = (key, opts) => <MultiFilter options={opts} value={cf[key] || []} onChange={(v) => setF(key, v)} />;

  const list = useMemo(() => {
    const T = (v) => String(v ?? "").toLowerCase();
    const s = q.trim().toLowerCase();
    const txt = (val, f) => !f || T(val).includes(T(f));
    const pTxt = (o, field, f) => !f || (o.purchases || []).some((p) => T(p[field]).includes(T(f)));
    const cfa = (k) => Array.isArray(cf[k]) ? cf[k] : [];
    let arr = orders;
    if (teamFilter) arr = arr.filter((o) => o.team === teamFilter);
    if (filter === "unclaimed") arr = arr.filter((o) => !o.claimedBy);
    else if (filter === "mine") arr = arr.filter((o) => o.claimedBy === currentUser.id);
    return arr.filter((o) => {
      if (s && ![o.id, o.store, o.product, o.address, o.masterStatus, o.claimedName, o.note1, o.note2, o.note3, o.note4].some((v) => T(v).includes(s))
            && !(o.purchases || []).some((p) => [p.card, p.orderNumber, p.email, p.tracking, p.phone, p.zip].some((v) => T(v).includes(s)))) return false;
      if (cfa("masterStatus").length && !cfa("masterStatus").some((v) => v === "__empty" ? !o.masterStatus : o.masterStatus === v)) return false;
      if (cfa("store").length && !cfa("store").includes(o.store)) return false;
      if (!txt(o.id, cf.id)) return false;
      if (!txt(o.product, cf.product)) return false;
      if (!txt(o.size, cf.size)) return false;
      if (!txt(o.color, cf.color)) return false;
      if (!txt(o.address, cf.address)) return false;
      if (!txt(o.qty, cf.qty)) return false;
      if (!txt(o.profit, cf.profit)) return false;
      if (!txt(o.deadline, cf.deadline)) return false;
      if (!txt(o.masterNote, cf.masterNote)) return false;
      if (!txt(o.claimedName, cf.claimedName)) return false;
      for (const nf of ["note1", "note2", "note3", "note4"]) if (!txt(o[nf], cf[nf])) return false;
      for (const pf of ["card", "amount", "orderNumber", "email", "tracking", "phone", "zip"]) if (!pTxt(o, pf, cf[pf])) return false;
      if (cfa("procStatus").length && !cfa("procStatus").some((v) => v === "__empty" ? !(o.purchases || []).some((p) => p.processStatus) : (o.purchases || []).some((p) => p.processStatus === v))) return false;
      return true;
    });
  }, [orders, filter, teamFilter, currentUser.id, q, cf]);

  // local state helpers
  const replaceOrder = (order) => setOrders((p) => p.map((o) => (o.id === order.id ? order : o)));
  const setPur = (oid, pur) => setOrders((p) => p.map((o) => o.id === oid ? { ...o, purchases: o.purchases.map((x) => x.id === pur.id ? pur : x) } : o));
  const addPur = (oid, pur) => setOrders((p) => p.map((o) => o.id === oid ? { ...o, purchases: [...o.purchases, pur] } : o));
  const delPur = (oid, pid) => setOrders((p) => p.map((o) => o.id === oid ? { ...o, purchases: o.purchases.filter((x) => x.id !== pid) } : o));

  async function claim(o) { try { replaceOrder((await api.post(`/api/orders/${o.id}/claim`, {})).order); } catch (e) { setErr(e.message); } }
  async function assign(o, userId) { try { replaceOrder((await api.post(`/api/orders/${o.id}/claim`, { userId })).order); } catch (e) { setErr(e.message); } }
  async function unclaim(o) { try { replaceOrder((await api.post(`/api/orders/${o.id}/unclaim`, {})).order); } catch (e) { setErr(e.message); } }
  async function saveNote(o, field, value) {
    if (value === (o[field] || "")) return;
    try { replaceOrder((await api.put(`/api/orders/${o.id}/notes`, { [field]: value })).order); } catch (e) { setErr(e.message); }
  }
  async function addPurchase(o) { try { addPur(o.id, (await api.post(`/api/orders/${o.id}/purchases`, {})).purchase); } catch (e) { setErr(e.message); } }
  async function savePurchase(p, field, value) {
    if (String(value) === String(p[field] ?? "")) return;
    try { setPur(p.orderId, (await api.put(`/api/purchases/${p.id}`, { [field]: value })).purchase); } catch (e) { setErr(e.message); }
  }
  async function removePurchase(p) {
    if (!confirm("Xóa thẻ/hàng này?")) return;
    try { await api.del(`/api/purchases/${p.id}`); delPur(p.orderId, p.id); } catch (e) { setErr(e.message); }
  }

  // per-card editable cell (wired to the formula bar)
  const pin = (p, field, { type = "text", w = 100, label } = {}) => (
    <input className="input" style={{ padding: "4px 6px", width: w }} type={type} defaultValue={p[field]}
      {...cellProps(label || field, (v) => savePurchase(p, field, type === "number" ? (Number(v) || 0) : v))} />
  );

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const FILTERS = [["all", "Tất cả"], ["unclaimed", "Chưa nhận"], ["mine", "Của tôi"]];

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Sheet Con {!isAdmin && <span className="muted" style={{ fontSize: 14 }}>· {(currentUser.teamIds || []).map(teamName).join(", ")}</span>}</h2>
        <Badge color="blue">{list.length} đơn</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} title="Xem tháng">
          {months.map((m) => <option key={m} value={m}>📅 {m}{m === activeMonth ? " • hiện tại" : ""}</option>)}
          <option value="all">Tất cả tháng</option>
        </select>
        <input className="input" style={{ maxWidth: 190 }} placeholder="🔍 Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
        {activeFilters > 0 && <Button sm onClick={clearFilters}>✕ Xóa lọc ({activeFilters})</Button>}
        {isManager && myTeamOptions.length > 1 && (
          <select className="input" style={{ maxWidth: 150 }} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">🗂 Tất cả team</option>
            {myTeamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {FILTERS.map(([k, label]) => (
          <Button key={k} sm variant={filter === k ? "primary" : ""} onClick={() => setFilter(k)}>{label}</Button>
        ))}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <Bar />

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 2130, whiteSpace: "nowrap" }}>
          <thead><tr>
            <th>Tổng</th><th>Store</th><th>ID Order</th><th>Ảnh</th><th>Sản phẩm</th><th>Link</th><th>Size</th><th>Màu</th><th>Địa chỉ</th><th>SL</th><th>Profit</th><th>Thời hạn</th><th>Note tổng</th><th>Nhận đơn</th>
            <th>Thẻ</th><th>Số tiền</th><th>Tracking</th><th>Order#</th><th>Email</th><th>Phone</th><th>Zip</th><th>TT xử lý</th><th>Time</th><th></th>
            <th>Note 1</th><th>Note 2</th><th>Note 3</th><th>Note 4</th>
          </tr>
          <tr style={{ background: "#fbfcfd" }}>
            <td>{fMulti("masterStatus", [{ v: "__empty", l: "(trống)" }, ...masterStatuses.map((s) => ({ v: s, l: s }))])}</td>
            <td>{fMulti("store", storeOptions.map((s) => ({ v: s, l: s })))}</td>
            <td>{fText("id", 100)}</td>
            <td></td>
            <td>{fText("product", 110)}</td>
            <td></td>
            <td>{fText("size", 55)}</td>
            <td>{fText("color", 55)}</td>
            <td>{fText("address", 110)}</td>
            <td>{fText("qty", 40)}</td>
            <td>{fText("profit", 55)}</td>
            <td>{fText("deadline", 55)}</td>
            <td>{fText("masterNote", 90)}</td>
            <td>{fText("claimedName", 75)}</td>
            <td>{fText("card", 90)}</td>
            <td>{fText("amount", 50)}</td>
            <td>{fText("tracking", 100)}</td>
            <td>{fText("orderNumber", 90)}</td>
            <td>{fText("email", 100)}</td>
            <td>{fText("phone", 80)}</td>
            <td>{fText("zip", 55)}</td>
            <td>{fMulti("procStatus", [{ v: "__empty", l: "(trống)" }, ...procStatuses.map((s) => ({ v: s, l: s }))])}</td>
            <td></td>
            <td>{activeFilters > 0 && <button className="btn sm" onClick={clearFilters} title="Xóa lọc">✕</button>}</td>
            <td>{fText("note1", 80)}</td>
            <td>{fText("note2", 80)}</td>
            <td>{fText("note3", 80)}</td>
            <td>{fText("note4", 80)}</td>
          </tr></thead>
          <tbody>
            {list.flatMap((o) => {
              const purs = o.purchases.length ? o.purchases : [null];
              const span = purs.length;
              return purs.map((p, idx) => (
                <tr key={o.id + "_" + (p ? p.id : "none")}
                  style={{ background: rowBg(o.masterStatus, p?.processStatus, colors) }}>
                  {idx === 0 && <>
                    <td rowSpan={span}>{o.masterStatus ? <Badge>{o.masterStatus}</Badge> : <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ fontWeight: 600 }}>{o.store}</td>
                    <td rowSpan={span}>{o.id}</td>
                    <td rowSpan={span}>{o.image
                      ? <a href={o.image} target="_blank" rel="noreferrer"><img src={o.image} alt="" style={{ width: 60, height: 60, objectFit: "contain", background: "#fff", borderRadius: 6, border: "1px solid var(--border)" }} /></a>
                      : <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ maxWidth: 220, whiteSpace: "normal" }}>{o.product}</td>
                    <td rowSpan={span}>{o.link ? <a href={o.link} target="_blank" rel="noreferrer">🔗</a> : <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ fontSize: 12 }}>{o.size || <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ fontSize: 12 }}>{o.color || <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ minWidth: 170, maxWidth: 240, whiteSpace: "normal", fontSize: 12 }}>
                      {String(o.address || "").split("\n").filter(Boolean).map((l, i) =>
                        <div key={i} style={i === 0 ? { fontWeight: 600 } : { color: "var(--muted)" }}>{l}</div>)}
                    </td>
                    <td rowSpan={span}>{o.qty}</td>
                    <td rowSpan={span}>{o.profit ? `$${o.profit}` : ""}</td>
                    <td rowSpan={span}>{o.deadline || <span className="muted">—</span>}</td>
                    <td rowSpan={span} style={{ maxWidth: 160, whiteSpace: "normal", fontSize: 12 }}>{o.masterNote || <span className="muted">—</span>}</td>
                    <td rowSpan={span}>
                      {o.claimedBy
                        ? <div><Badge color="green">{o.claimedName}</Badge>{isManager && <Button sm onClick={() => unclaim(o)} style={{ marginLeft: 6 }} title="Gỡ người nhận">✕</Button>}</div>
                        : (canClaim(o) ? <Button sm variant="primary" onClick={() => claim(o)}>Nhận đơn</Button> : <span className="muted">chưa nhận</span>)}
                      {isManager && (
                        <div style={{ marginTop: 6 }}>
                          <select className="input" style={{ padding: "3px 5px", minWidth: 130 }} value=""
                            onChange={(e) => { if (e.target.value) assign(o, e.target.value); }}>
                            <option value="">📤 Phân cho…</option>
                            {assignableFor(o).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}><Button sm onClick={() => addPurchase(o)}>＋ Thẻ</Button></div>
                    </td>
                  </>}

                  {p ? <>
                    <td>
                      <input className="input" style={{ padding: "4px 6px", width: 130,
                        borderColor: p.card && !p.cardValid ? "var(--red)" : undefined,
                        background: p.card && !p.cardValid ? "var(--red-bg)" : undefined }}
                        defaultValue={p.card} title={p.card && !p.cardValid ? "Thẻ chưa được cấp trong Sheet Mua thẻ" : ""}
                        {...cellProps("Thẻ", (v) => savePurchase(p, "card", v))} />
                      {p.card && !p.cardValid && <div style={{ color: "var(--red)", fontSize: 10 }}>✗ chưa cấp</div>}
                    </td>
                    <td>{pin(p, "amount", { type: "number", w: 80, label: "Số tiền" })}</td>
                    <td>{pin(p, "tracking", { w: 150, label: "Tracking number" })}</td>
                    <td>{pin(p, "orderNumber", { w: 120, label: "Order number" })}</td>
                    <td>{pin(p, "email", { w: 150, label: "Email" })}</td>
                    <td>{pin(p, "phone", { w: 110, label: "Phone" })}</td>
                    <td>{pin(p, "zip", { w: 80, label: "Zip code" })}</td>
                    <td>
                      <select className="input" style={{ padding: "4px 6px", minWidth: 110 }} value={p.processStatus}
                        onChange={(e) => savePurchase(p, "processStatus", e.target.value)}>
                        <option value="">— trống —</option>
                        {procStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap" }} className="muted">{fmtTime(p.orderTime)}</td>
                    <td><Button sm variant="danger" onClick={() => removePurchase(p)}>✕</Button></td>
                  </> : (
                    <td colSpan={10} className="muted" style={{ fontStyle: "italic" }}>Chưa có thẻ — bấm “＋ Thẻ”</td>
                  )}

                  {idx === 0 && ["note1", "note2", "note3", "note4"].map((nf) => (
                    <td rowSpan={span} key={nf}>
                      <input className="input" style={{ padding: "4px 6px", width: 110 }} defaultValue={o[nf]}
                        {...cellProps("Note " + nf.slice(-1), (v) => saveNote(o, nf, v))} />
                    </td>
                  ))}
                </tr>
              ));
            })}
            {list.length === 0 && (
              <tr><td colSpan={28} style={{ textAlign: "center", padding: 30 }} className="muted">
                Chưa có đơn nào được chia về {isAdmin ? "team" : "team của bạn"}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
