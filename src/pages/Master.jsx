import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Input, Modal, Badge } from "../ui.jsx";
import { parseEbayCsv } from "../ebayParser.js";
import { rowBg } from "../statusColors.js";
import { useFormulaBar } from "../useFormulaBar.jsx";
import MultiFilter from "../MultiFilter.jsx";

// Sheet Tổng — Admin sees all + divides to teams; Lister sees only assigned stores.
export default function Master({ currentUser, teams }) {
  const isAdmin = currentUser.role === "Admin";
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [statusColors, setStatusColors] = useState({});
  const [procStatuses, setProcStatuses] = useState([]);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [deadlineSort, setDeadlineSort] = useState("");   // "" | "asc" | "desc"
  const [cf, setCf] = useState({});                // per-column filters (combine like Google Sheets)
  const [months, setMonths] = useState([]);
  const [activeMonth, setActiveMonth] = useState("");
  const [month, setMonth] = useState("");          // month being viewed
  const [lastClose, setLastClose] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(0);     // remaining auto-refreshes for images
  const [preview, setPreview] = useState(null);  // {url,x,y} hover-zoom of a product image
  const { cellProps, Bar } = useFormulaBar();

  async function loadOrders(m) {
    try { setOrders((await api.get(`/api/orders?month=${encodeURIComponent(m || month)}`)).orders); } catch (e) { setErr(e.message); }
  }
  async function load() {
    try {
      setStores((await api.get("/api/stores")).stores);
      const s = (await api.get("/api/settings")).settings;
      setStatuses(s.masterStatuses || []);
      setProcStatuses(s.processStatuses || []);
      setStatusColors(s.statusColors || {});
      setCancelReasons(s.cancelReasons || []);
      const mo = await api.get("/api/months");
      setMonths(mo.months); setActiveMonth(mo.activeMonth); setLastClose(mo.lastClose);
      setMonth((cur) => cur || mo.activeMonth);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (month) loadOrders(month); }, [month]);   // refetch when switching month

  async function closeMonth() {
    if (!confirm(`Chốt tháng ${activeMonth}?\nĐơn chưa "Đã Up"/"Đã Cancel" sẽ chuyển sang tháng kế tiếp.`)) return;
    try {
      const r = await api.post("/api/months/close", {});
      alert(`Đã chốt tháng ${r.from}.\n${r.moved} đơn chưa xong → chuyển sang tháng ${r.to}.`);
      setMonth(r.to);
      load();
    } catch (e) { setErr(e.message); }
  }
  async function undoClose() {
    if (!lastClose) return;
    if (!confirm(`Hoàn tác chốt tháng?\nĐưa các đơn vừa chuyển từ ${lastClose.to} về lại ${lastClose.from}, và đặt tháng hiện tại = ${lastClose.from}.`)) return;
    try {
      const r = await api.post("/api/months/undo-close", {});
      alert(`Đã hoàn tác. ${r.restored} đơn về lại tháng ${r.restoredTo}.`);
      setMonth(r.restoredTo);
      load();
    } catch (e) { setErr(e.message); }
  }
  async function reopenMonth() {
    if (!confirm(`Đặt tháng ${month} làm tháng hiện tại?\nCác đơn chưa "Đã Up"/"Đã Cancel" ở tháng ${activeMonth} sẽ được kéo về tháng ${month}.`)) return;
    try {
      const r = await api.post("/api/months/reopen", { month });
      alert(`Đã đặt tháng ${r.target} làm hiện tại. ${r.moved} đơn được kéo về.`);
      await load();
      loadOrders(month);
    } catch (e) { setErr(e.message); }
  }

  // Auto-refresh while cover images load in the background. IMPORTANT: only merge
  // the `image` field — never replace the whole order, or a stale poll would clobber
  // an inline edit (status / profit / size…) the user just made (race condition).
  useEffect(() => {
    if (polling <= 0) return;
    const t = setTimeout(async () => {
      try {
        const fresh = (await api.get(`/api/orders?month=${encodeURIComponent(month)}`)).orders;
        setOrders((prev) => prev.map((o) => {
          const f = fresh.find((x) => x.id === o.id);
          return f && f.image && !o.image ? { ...o, image: f.image } : o;
        }));
      } catch {}
      setPolling((p) => p - 1);
    }, 4000);
    return () => clearTimeout(t);
  }, [polling]);

  async function fetchAllImages() {
    try { await api.post("/api/orders/fetch-images", {}); setPolling(15); } catch (e) { setErr(e.message); }
  }
  async function fetchOneImage(id) {
    try {
      const { order } = await api.post(`/api/orders/${id}/fetch-image`, {});
      setOrders((prev) => prev.map((o) => (o.id === id ? order : o)));
    } catch (e) { setErr(e.message); }
  }
  const missingImages = orders.filter((o) => !o.image && (o.link || "")).length;

  const teamName = (id) => teams.find((t) => t.id === id)?.name || "";

  // Count orders per (normalised) address → highlight when 2+ orders share one.
  const addrNorm = (a) => String(a || "").replace(/\s+/g, " ").trim().toLowerCase();
  const addressCounts = useMemo(() => {
    const m = {};
    for (const o of orders) { const k = addrNorm(o.address); if (k) m[k] = (m[k] || 0) + 1; }
    return m;
  }, [orders]);

  const setF = (key, val) => setCf((p) => ({ ...p, [key]: val }));
  const clearFilters = () => { setCf({}); setQ(""); };
  const activeFilters = Object.values(cf).filter((v) => Array.isArray(v) ? v.length : v).length + (q.trim() ? 1 : 0);
  // filter-row controls
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
  const fMulti = (key, opts, searchable = false) => <MultiFilter options={opts} value={cf[key] || []} onChange={(v) => setF(key, v)} searchable={searchable} />;

  const filtered = useMemo(() => {
    const T = (v) => String(v ?? "").toLowerCase();
    const s = q.trim().toLowerCase();
    const txt = (val, f) => !f || T(val).includes(T(f));
    const pTxt = (o, field, f) => !f || (o.purchases || []).some((p) => T(p[field]).includes(T(f)));
    const arr = (k) => Array.isArray(cf[k]) ? cf[k] : [];
    return orders.filter((o) => {
      if (s && ![o.id, o.store, o.product, o.address, o.masterStatus, o.claimedName, o.masterNote].some((v) => T(v).includes(s))
            && !(o.purchases || []).some((p) => [p.orderNumber, p.email, p.tracking, p.phone, p.zip].some((v) => T(v).includes(s)))) return false;
      if (arr("team").length && !arr("team").some((v) => v === "__none" ? !o.team : o.team === v)) return false;
      if (arr("store").length && !arr("store").includes(o.store)) return false;
      if (!txt(o.id, cf.id)) return false;
      if (!txt(o.address, cf.address)) return false;
      if (!txt(o.custPhone, cf.custPhone)) return false;
      if (!txt(o.qty, cf.qty)) return false;
      if (!txt(o.product, cf.product)) return false;
      if (!txt(o.size, cf.size)) return false;
      if (!txt(o.color, cf.color)) return false;
      if (!txt(o.profit, cf.profit)) return false;
      if (!txt(o.deadline, cf.deadline)) return false;
      if (!txt(o.masterNote, cf.masterNote)) return false;
      if (arr("masterStatus").length && !arr("masterStatus").some((v) => v === "__empty" ? !o.masterStatus : o.masterStatus === v)) return false;
      if (!txt(o.claimedName, cf.claimedName)) return false;
      if (!pTxt(o, "orderNumber", cf.orderNumber)) return false;
      if (!pTxt(o, "email", cf.email)) return false;
      if (!pTxt(o, "tracking", cf.tracking)) return false;
      if (!pTxt(o, "phone", cf.phone)) return false;
      if (!pTxt(o, "zip", cf.zip)) return false;
      if (arr("procStatus").length && !arr("procStatus").some((v) => v === "__empty" ? !(o.purchases || []).some((p) => p.processStatus) : (o.purchases || []).some((p) => p.processStatus === v))) return false;
      return true;
    });
  }, [orders, q, cf]);

  // Optional sort by deadline (DD/MM). Empty deadlines always go last.
  const deadlineKey = (d) => { const m = String(d || "").match(/(\d{1,2})\s*\/\s*(\d{1,2})/); return m ? (+m[2]) * 100 + (+m[1]) : Infinity; };
  const displayed = useMemo(() => {
    if (!deadlineSort) return filtered;
    return [...filtered].sort((a, b) => {
      const va = deadlineKey(a.deadline), vb = deadlineKey(b.deadline);
      if (va === Infinity && vb === Infinity) return 0;
      if (va === Infinity) return 1;
      if (vb === Infinity) return -1;
      return deadlineSort === "asc" ? va - vb : vb - va;
    });
  }, [filtered, deadlineSort]);

  async function patch(id, body) {
    try {
      const { order } = await api.put(`/api/orders/${id}`, body);
      setOrders((prev) => prev.map((o) => (o.id === id ? order : o)));
    } catch (e) { setErr(e.message); }
  }
  async function divide(teamId) {
    const ids = [...sel];
    if (!ids.length) return;
    try {
      await api.post("/api/orders/divide", { ids, team: teamId });
      setSel(new Set()); load();
    } catch (e) { setErr(e.message); }
  }
  function toggleSel(id) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allSelected = filtered.length > 0 && filtered.every((o) => sel.has(o.id));
  function toggleAll() {
    setSel((p) => {
      const n = new Set(p);
      if (filtered.length > 0 && filtered.every((o) => n.has(o.id))) filtered.forEach((o) => n.delete(o.id));
      else filtered.forEach((o) => n.add(o.id));
      return n;
    });
  }
  async function bulkDelete() {
    const ids = [...sel];
    if (!ids.length) return;
    if (!confirm(`Xóa ${ids.length} đơn đã chọn?\n\n⚠️ KHÔNG thể hoàn tác — các thẻ/đơn con liên quan cũng bị xóa.`)) return;
    try {
      const r = await api.post("/api/orders/bulk-delete", { ids });
      setSel(new Set()); load();
      alert(`Đã xóa ${r.deleted} đơn.`);
    } catch (e) { setErr(e.message); }
  }

  // Read-back of team processing (purchases) into the master sheet. Multi-card
  // orders stack their values vertically (one line per card).
  const stack = (o, field) => o.purchases && o.purchases.length
    ? o.purchases.map((p, i) => <div key={i}>{p[field] !== "" && p[field] != null ? p[field] : <span className="muted">·</span>}</div>)
    : <span className="muted">—</span>;

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Sheet Tổng</h2>
        <Badge color="blue">{filtered.length} đơn</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} title="Xem tháng">
          {months.map((m) => <option key={m} value={m}>📅 {m}{m === activeMonth ? " • hiện tại" : ""}</option>)}
          <option value="all">Tất cả tháng</option>
        </select>
        {isAdmin && month === activeMonth && <Button onClick={closeMonth} title="Chuyển đơn chưa xong sang tháng mới">🔒 Chốt tháng</Button>}
        {isAdmin && lastClose && <Button onClick={undoClose} title={`Quay lại tháng ${lastClose.from}`}>⟲ Hoàn tác chốt</Button>}
        {isAdmin && month !== activeMonth && month !== "all" && <Button onClick={reopenMonth} title={`Đặt ${month} làm tháng hiện tại`}>⟲ Mở lại tháng {month}</Button>}
        <input className="input" style={{ maxWidth: 220 }} placeholder="🔍 Tìm đơn / store / SP…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {activeFilters > 0 && <Button onClick={clearFilters}>✕ Xóa lọc ({activeFilters})</Button>}
        {missingImages > 0 && (
          <Button onClick={fetchAllImages} title="Lấy ảnh bìa eBay cho các đơn còn thiếu">
            🖼️ Lấy ảnh ({missingImages}){polling > 0 ? " …" : ""}
          </Button>
        )}
        <Button onClick={() => setEditing({ store: stores[0] || "" })}>＋ Thêm đơn</Button>
        <Button variant="primary" onClick={() => setImportOpen(true)}>⬆️ Import eBay</Button>
      </div>

      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {isAdmin && sel.size > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <b>{sel.size}</b> đơn đã chọn — Chia cho:
          {teams.map((t) => (
            <Button key={t.id} sm variant="primary" onClick={() => divide(t.id)}>{t.name}</Button>
          ))}
          <Button sm onClick={() => divide("")}>Bỏ chia</Button>
          <div className="spacer" />
          <Button sm variant="danger" onClick={bulkDelete}>🗑 Xóa đã chọn ({sel.size})</Button>
          <Button sm onClick={() => setSel(new Set())}>Bỏ chọn</Button>
        </div>
      )}

      <Bar />

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 1850, whiteSpace: "nowrap" }}>
          <thead><tr>
            {isAdmin && <th><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Chọn tất cả (đang lọc)" /></th>}
            <th>Team</th><th>Store</th><th>ID Order</th><th>Address</th><th>SĐT</th><th>SL</th>
            <th>Sản phẩm</th><th>Ảnh</th><th>Link</th><th>Size</th><th>Màu</th><th>Profit</th>
            <th onClick={() => setDeadlineSort((s) => s === "asc" ? "desc" : s === "desc" ? "" : "asc")}
              style={{ cursor: "pointer", whiteSpace: "nowrap", color: deadlineSort ? "var(--primary)" : undefined }}
              title="Sắp xếp theo thời hạn (gần ↔ xa)">
              Thời hạn {deadlineSort === "asc" ? "↑" : deadlineSort === "desc" ? "↓" : "⇅"}
            </th>
            <th>Note</th>
            <th>Trạng thái tổng</th>
            <th>Người nhận</th><th>Tracking</th><th>Order#</th><th>Email</th><th>Phone</th><th>Zip</th><th>TT xử lý</th>
            <th></th>
          </tr>
          <tr style={{ background: "#fbfcfd" }}>
            {isAdmin && <td></td>}
            <td>{fMulti("team", [{ v: "__none", l: "Chưa chia" }, ...teams.map((t) => ({ v: t.id, l: t.name }))])}</td>
            <td>{fMulti("store", stores.map((s) => ({ v: s, l: s })), true)}</td>
            <td>{fText("id", 110)}</td>
            <td>{fText("address", 120)}</td>
            <td>{fText("custPhone", 90)}</td>
            <td>{fText("qty", 40)}</td>
            <td>{fText("product", 120)}</td>
            <td></td>
            <td></td>
            <td>{fText("size", 60)}</td>
            <td>{fText("color", 60)}</td>
            <td>{fText("profit", 60)}</td>
            <td>{fText("deadline", 60)}</td>
            <td>{fText("masterNote", 90)}</td>
            <td>{fMulti("masterStatus", [{ v: "__empty", l: "(trống)" }, ...statuses.map((s) => ({ v: s, l: s }))])}</td>
            <td>{fText("claimedName", 80)}</td>
            <td>{fText("tracking", 100)}</td>
            <td>{fText("orderNumber", 90)}</td>
            <td>{fText("email", 100)}</td>
            <td>{fText("phone", 80)}</td>
            <td>{fText("zip", 60)}</td>
            <td>{fMulti("procStatus", [{ v: "__empty", l: "(trống)" }, ...procStatuses.map((s) => ({ v: s, l: s }))])}</td>
            <td>{activeFilters > 0 && <button className="btn sm" onClick={clearFilters} title="Xóa lọc">✕</button>}</td>
          </tr></thead>
          <tbody>
            {displayed.map((o) => (
              <tr key={o.id} style={{ background: rowBg(o.masterStatus, "", statusColors) }}>
                {isAdmin && <td><input type="checkbox" checked={sel.has(o.id)} onChange={() => toggleSel(o.id)} /></td>}
                <td>{isAdmin
                  ? <select className="input" style={{ padding: "4px 6px", minWidth: 90 }} value={o.team}
                      onChange={(e) => patch(o.id, { team: e.target.value })}>
                      <option value="">— chưa chia —</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  : (o.team ? <Badge color="amber">{teamName(o.team)}</Badge> : <span className="muted">—</span>)}
                </td>
                <td style={{ fontWeight: 600 }}>{o.store}</td>
                <td>{o.id}</td>
                {(() => {
                  const cnt = addressCounts[addrNorm(o.address)] || 0;
                  const dup = cnt > 1;
                  const lines = String(o.address || "").split("\n").filter(Boolean);
                  return (
                    <td style={{ minWidth: 180, maxWidth: 260, whiteSpace: "normal", fontSize: 12.5, lineHeight: 1.5,
                      background: dup ? "#fff3cd" : undefined, outline: dup ? "1px solid #e0a800" : undefined }}>
                      {lines.length ? (<>
                        <div style={{ fontWeight: 600 }}>{lines[0]}</div>
                        {lines.slice(1).map((l, i) => <div key={i} className="muted">{l}</div>)}
                      </>) : <span className="muted">—</span>}
                      {dup && <div style={{ marginTop: 4 }}><span className="badge amber" style={{ fontSize: 10 }}>⚠ {cnt} đơn chung địa chỉ</span></div>}
                    </td>
                  );
                })()}
                <td>{o.custPhone}</td>
                <td>{o.qty}</td>
                <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{o.product}</td>
                <td>
                  {o.image ? (
                    <a href={o.image} target="_blank" rel="noreferrer" title="Bấm để xem ảnh gốc">
                      <img src={o.image} alt="" style={{ width: 88, height: 88, objectFit: "contain",
                        background: "#fff", borderRadius: 8, border: "1px solid var(--border)", display: "block", cursor: "zoom-in" }}
                        onMouseMove={(e) => setPreview({ url: o.image, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setPreview(null)} />
                    </a>
                  ) : (
                    <button className="btn sm" title="Lấy ảnh bìa eBay" onClick={() => fetchOneImage(o.id)}
                      style={{ width: 88, height: 88, padding: 0, fontSize: 22 }}>🖼️</button>
                  )}
                </td>
                <td>{o.link ? <a href={o.link} target="_blank" rel="noreferrer">🔗</a> : ""}</td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 90 }} defaultValue={o.size}
                    placeholder="nhập…" {...cellProps("Size", (v) => { if (v !== o.size) patch(o.id, { size: v }); })} />
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 90 }} defaultValue={o.color}
                    placeholder="nhập…" {...cellProps("Màu", (v) => { if (v !== o.color) patch(o.id, { color: v }); })} />
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 80 }} type="number" defaultValue={o.profit}
                    {...cellProps("Profit", (v) => { const n = Number(v) || 0; if (n !== o.profit) patch(o.id, { profit: n }); })} />
                </td>
                <td>
                  <DeadlineCell value={o.deadline}
                    bind={cellProps("Thời hạn", (v) => { if (v !== o.deadline) patch(o.id, { deadline: v }); })}
                    onPick={(v) => patch(o.id, { deadline: v })} />
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 150 }} defaultValue={o.masterNote} placeholder="ghi chú…"
                    {...cellProps("Note", (v) => { if (v !== o.masterNote) patch(o.id, { masterNote: v }); })} />
                </td>
                <td>
                  <select className="input" style={{ padding: "4px 6px", minWidth: 110 }} value={o.masterStatus}
                    onChange={(e) => patch(o.id, { masterStatus: e.target.value })}>
                    <option value="">— trống —</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {o.masterStatus === "Đã Cancel" && (
                    <select className="input" style={{ padding: "3px 6px", minWidth: 110, marginTop: 4, fontSize: 12 }}
                      value={o.cancelReason || ""} onChange={(e) => patch(o.id, { cancelReason: e.target.value })} title="Lý do Cancel">
                      <option value="">— lý do cancel —</option>
                      {cancelReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{o.claimedName ? <Badge color="green">{o.claimedName}</Badge> : <span className="muted">—</span>}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "tracking")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "orderNumber")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "email")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "phone")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "zip")}</td>
                <td style={{ fontSize: 12 }}>{o.purchases && o.purchases.length
                  ? o.purchases.map((p, i) => p.processStatus ? <div key={i}><Badge>{p.processStatus}</Badge></div> : <div key={i} className="muted">·</div>)
                  : <span className="muted">—</span>}</td>
                <td><Button sm onClick={() => setEditing(o)}>Sửa</Button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={isAdmin ? 24 : 23} style={{ textAlign: "center", padding: 30 }} className="muted">
                Chưa có đơn nào. Bấm <b>Import eBay</b> để đổ đơn vào.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {importOpen && (
        <ImportModal currentUser={currentUser} stores={stores}
          onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); setPolling(12); }} />
      )}
      {editing && (
        <OrderModal order={editing} currentUser={currentUser} stores={stores}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      {preview && (
        <div style={{
          position: "fixed", zIndex: 200, pointerEvents: "none", background: "#fff", padding: 6,
          border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 50px rgba(0,0,0,.28)",
          left: Math.min(preview.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360),
          top: Math.min(preview.y + 18, (typeof window !== "undefined" ? window.innerHeight : 800) - 360),
        }}>
          <img src={preview.url} alt="" style={{ width: 340, height: 340, objectFit: "contain", display: "block" }} />
        </div>
      )}
    </div>
  );
}

// Deadline cell: free-text DD/MM + a 📅 button that opens the native date picker.
function DeadlineCell({ value, bind, onPick }) {
  const dateRef = useRef(null);
  const textRef = useRef(null);
  const openPicker = () => {
    const el = dateRef.current; if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };
  const onDate = (e) => {
    const d = e.target.value; if (!d) return;       // d = "YYYY-MM-DD"
    const [, m, day] = d.split("-");
    const ddmm = `${day}/${m}`;                      // → DD/MM
    if (textRef.current) textRef.current.value = ddmm;
    onPick(ddmm);
  };
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      <input ref={textRef} type="text" className="input" style={{ width: 64, padding: "4px 6px" }}
        defaultValue={value} placeholder="DD/MM" {...bind} />
      <input ref={dateRef} type="date" tabIndex={-1} aria-hidden="true"
        style={{ width: 1, height: 1, opacity: 0, padding: 0, border: 0, pointerEvents: "none" }} onChange={onDate} />
      <button type="button" className="btn sm" style={{ padding: "3px 7px" }} title="Chọn từ lịch" onClick={openPicker}>📅</button>
    </div>
  );
}

function ImportModal({ currentUser, stores, onClose, onDone }) {
  const isAdmin = currentUser.role === "Admin";
  const myStores = isAdmin ? stores : (currentUser.storeNames || []);
  const [store, setStore] = useState(myStores[0] || "");
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  function onFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setParsed(parseEbayCsv(String(reader.result))); setErr(""); }
      catch (e) { setErr(e.message); setParsed(null); }
    };
    reader.readAsText(file, "utf-8");
  }
  async function doImport() {
    if (!store) { setErr("Chọn store trước"); return; }
    if (!parsed?.rows?.length) { setErr("Chưa có dữ liệu"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post("/api/orders/import", { store, rows: parsed.rows });
      setResult(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Import đơn từ file eBay" onClose={onClose}
      footer={result
        ? <Button variant="primary" onClick={onDone}>Xong</Button>
        : <>
            <Button onClick={onClose}>Hủy</Button>
            <Button variant="primary" disabled={busy || !parsed} onClick={doImport}>
              {busy ? "Đang import…" : "Import"}
            </Button>
          </>}>
      {result ? (
        <div>
          <div className="badge green" style={{ marginBottom: 10 }}>Import xong ✓</div>
          <div>Thêm mới: <b>{result.inserted}</b> · Trùng đã bỏ qua: <b>{result.duplicates}</b> · Dòng lỗi: {result.skipped}</div>
          <div className="muted" style={{ marginTop: 6 }}>Tổng dòng đọc: {result.total} · Store: {store}</div>
        </div>
      ) : (
        <>
          <div className="field">
            <label className="label">Store (file này thuộc store nào?)</label>
            {isAdmin ? (
              <input className="input" list="store-list" value={store} placeholder="Gõ tên store (vd Ha US 19)"
                onChange={(e) => setStore(e.target.value)} />
            ) : (
              <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
                <option value="">— chọn store —</option>
                {myStores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <datalist id="store-list">{stores.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="field">
            <label className="label">File eBay OrdersReport (.csv)</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </div>
          {parsed && <div className="badge blue">Đọc được {parsed.count} đơn</div>}
          {err && <div style={{ color: "var(--red)", marginTop: 10 }}>{err}</div>}
        </>
      )}
    </Modal>
  );
}

function OrderModal({ order, currentUser, stores, onClose, onSaved }) {
  const isNew = !order.id;
  const isAdmin = currentUser.role === "Admin";
  const myStores = isAdmin ? stores : (currentUser.storeNames || []);
  const [f, setF] = useState({
    id: order.id || "", store: order.store || (myStores[0] || ""),
    product: order.product || "", qty: order.qty || "", custPhone: order.custPhone || "",
    address: order.address || "", link: order.link || "", size: order.size || "",
    color: order.color || "", profit: order.profit || 0, deadline: order.deadline || "",
  });
  const [err, setErr] = useState("");
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    try {
      if (isNew) await api.post("/api/orders", f);
      else await api.put(`/api/orders/${order.id}`, f);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  async function remove() {
    if (!confirm("Xóa đơn này?")) return;
    try { await api.del(`/api/orders/${order.id}`); onSaved(); } catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={isNew ? "Thêm đơn" : `Sửa đơn ${order.id}`} onClose={onClose}
      footer={<>
        {!isNew && <Button variant="danger" onClick={remove}>Xóa</Button>}
        <div className="spacer" />
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" onClick={save}>Lưu</Button>
      </>}>
      {isNew && (
        <>
          <Input label="ID Order" value={f.id} onChange={(e) => up("id", e.target.value)} />
          <div className="field">
            <label className="label">Store</label>
            <select className="input" value={f.store} onChange={(e) => up("store", e.target.value)}>
              {(isAdmin ? stores : myStores).map((s) => <option key={s} value={s}>{s}</option>)}
              {isAdmin && <option value="__new">+ store mới…</option>}
            </select>
            {isAdmin && f.store === "__new" &&
              <input className="input" style={{ marginTop: 6 }} placeholder="Tên store mới"
                onChange={(e) => up("store", e.target.value)} />}
          </div>
        </>
      )}
      <Input label="Sản phẩm" value={f.product} onChange={(e) => up("product", e.target.value)} />
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><Input label="SL" value={f.qty} onChange={(e) => up("qty", e.target.value)} /></div>
        <div style={{ flex: 1 }}><Input label="SĐT khách" value={f.custPhone} onChange={(e) => up("custPhone", e.target.value)} /></div>
      </div>
      <div className="field">
        <label className="label">Address</label>
        <textarea className="input" rows={3} value={f.address} onChange={(e) => up("address", e.target.value)} />
      </div>
      <Input label="Link sản phẩm" value={f.link} onChange={(e) => up("link", e.target.value)} />
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><Input label="Size/Variation" value={f.size} onChange={(e) => up("size", e.target.value)} /></div>
        <div style={{ flex: 1 }}><Input label="Màu" value={f.color} onChange={(e) => up("color", e.target.value)} /></div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}><Input label="Profit (ròng)" type="number" value={f.profit} onChange={(e) => up("profit", e.target.value)} /></div>
        <div style={{ flex: 1 }}><Input label="Thời hạn" value={f.deadline} onChange={(e) => up("deadline", e.target.value)} /></div>
      </div>
      {err && <div style={{ color: "var(--red)" }}>{err}</div>}
    </Modal>
  );
}
