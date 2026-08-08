import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Input, Modal, Badge } from "../ui.jsx";
import { parseEbayCsv, parseOrderHubCsv } from "../ebayParser.js";
import { rowBg } from "../statusColors.js";
import { useFormulaBar } from "../useFormulaBar.jsx";
import MultiFilter from "../MultiFilter.jsx";
import HistoryModal from "../HistoryModal.jsx";
import { fileToResizedDataUrl, imageFromPaste } from "../imageUtil.js";

// Sheet Tổng — Admin sees all + divides to teams; Lister sees only assigned stores.
export default function Master({ currentUser, teams, refreshUser }) {
  const isAdmin = currentUser.role === "Admin";
  const isLister = currentUser.role === "Lister";
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
  const [historyFor, setHistoryFor] = useState(null);
  const [pinned, setPinned] = useState(true);
  const [freezeCols, setFreezeCols] = useState(1);   // số cột ghim từ trái
  const [colLefts, setColLefts] = useState([]);
  const tableRef = useRef(null);
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(0);     // remaining auto-refreshes for images
  const [imgQ, setImgQ] = useState(null);        // tiến độ hàng đợi lấy ảnh
  const [adminNote, setAdminNote] = useState(""); // ghi chú Admin cho Lister xem
  const [noteEdit, setNoteEdit] = useState(false);
  const [preview, setPreview] = useState(null);  // {url,x,y} hover-zoom of a product image
  const { cellProps, Bar, viewCell } = useFormulaBar();

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
      setAdminNote(s.adminNoteForLister || "");
      const mo = await api.get("/api/months");
      setMonths(mo.months); setActiveMonth(mo.activeMonth); setLastClose(mo.lastClose);
      setMonth((cur) => cur || mo.activeMonth);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (month) loadOrders(month); }, [month]);   // refetch when switching month

  // Tự cập nhật mỗi 15s: đơn mới / trạng thái / chỉnh sửa đều hiện ngay,
  // chỉ CHỪA đúng dòng đang được focus (đang gõ) để không mất chữ.
  useEffect(() => {
    if (!month) return;
    const t = setInterval(async () => {
      try {
        const fresh = (await api.get(`/api/orders?month=${encodeURIComponent(month)}`)).orders;
        const editingId = document.activeElement?.closest?.("tr[data-oid]")?.getAttribute("data-oid") || null;
        setOrders((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          return fresh.map((f) => (editingId && String(f.id) === editingId && byId.has(f.id)) ? byId.get(f.id) : f);
        });
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [month]);

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
      try { setImgQ(await api.get("/api/image-queue")); } catch {}
      setPolling((p) => p - 1);
    }, 4000);
    return () => clearTimeout(t);
  }, [polling]);

  async function fetchAllImages() {
    try { await api.post("/api/orders/fetch-images", {}); setPolling(15); } catch (e) { setErr(e.message); }
  }
  // Dán link ảnh thủ công (khi eBay chặn lấy tự động).
  async function setImageManual(o) {
    const url = prompt("Dán LINK ẢNH của sản phẩm (chuột phải vào ảnh trên eBay → Copy image address):", o.image || "");
    if (url === null) return;
    const v = url.trim();
    if (v && !/^https?:\/\//i.test(v)) { setErr("Link ảnh phải bắt đầu bằng http:// hoặc https://"); return; }
    setErr("");
    try {
      const r = await api.put(`/api/orders/${o.id}`, { image: v });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...r.order } : x)));
      if (r.imageSpread > 0) { setErr(`✓ Đã gán ảnh cho ${r.imageSpread} đơn khác cùng sản phẩm.`); loadOrders(month); }
    } catch (e) { setErr(e.message); }
  }
  async function fetchOneImage(id) {
    try {
      const r = await api.post(`/api/orders/${id}/fetch-image`, {});
      const order = r.order;
      if (r.error) setErr(r.error); else setErr("");
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...order } : o)));
    } catch (e) { setErr(e.message); }
  }
  const missingImages = orders.filter((o) => !o.image && (o.link || "")).length;

  const teamName = (id) => teams.find((t) => t.id === id)?.name || "";

  // Cảnh báo trùng địa chỉ: dùng o.addrCount (server đếm trên TOÀN BỘ đơn, mọi tháng).

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
      if (s && ![o.orderNo, o.id, o.store, o.product, o.address, o.masterStatus, o.claimedName, o.masterNote].some((v) => T(v).includes(s))
            && !(o.purchases || []).some((p) => [p.name, p.orderNumber, p.email, p.tracking, p.phone, p.zip].some((v) => T(v).includes(s)))) return false;
      if (arr("team").length && !arr("team").some((v) => v === "__none" ? !o.team : o.team === v)) return false;
      if (arr("store").length && !arr("store").includes(o.store)) return false;
      if (!txt(o.orderNo, cf.id)) return false;
      if (!txt(o.address, cf.address)) return false;
      if (!txt(o.custPhone, cf.custPhone)) return false;
      if (!txt(o.qty, cf.qty)) return false;
      if (!txt(o.product, cf.product)) return false;
      if (!txt(o.size, cf.size)) return false;
      if (!txt(o.color, cf.color)) return false;
      if (!txt(o.profit, cf.profit)) return false;
      if (!txt(o.deadline, cf.deadline)) return false;
      if (!txt(o.masterNote, cf.masterNote)) return false;
      if (!txt(o.staffNote, cf.staffNote)) return false;
      if (cf.urgent === "1" && !o.urgent) return false;
      if (arr("masterStatus").length && !arr("masterStatus").some((v) => v === "__empty" ? !o.masterStatus : o.masterStatus === v)) return false;
      if (!txt(o.claimedName, cf.claimedName)) return false;
      if (!pTxt(o, "name", cf.name)) return false;
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

  // Đo độ rộng cột (từ hàng tiêu đề) để ghim N cột đầu đúng vị trí khi cuộn ngang.
  useLayoutEffect(() => {
    if (!pinned || freezeCols <= 0) { setColLefts([]); return; }
    const measure = () => {
      const row = tableRef.current?.querySelector("thead tr");
      if (!row) return;
      const lefts = []; let acc = 0;
      for (const cell of row.children) { lefts.push(acc); acc += cell.offsetWidth; }
      setColLefts(lefts);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pinned, freezeCols, displayed, cf, q, month, orders, stores]);

  const colStyle = useMemo(() => {
    if (!pinned || freezeCols <= 0 || !colLefts.length) return "";
    const n = Math.min(freezeCols, colLefts.length);
    let css = "";
    for (let i = 0; i < n; i++) {
      const k = i + 1, L = colLefts[i];
      css += `#mtbl>thead>tr>*:nth-child(${k}){position:sticky;left:${L}px;background:#fafbfc;z-index:3;}`;
      css += `#mtbl>tbody>tr>*:nth-child(${k}){position:sticky;left:${L}px;background:var(--rowbg,#fff);z-index:3;}`;
      css += `#mtbl>thead>tr:first-child>th:nth-child(${k}){z-index:7;}`;
      css += `#mtbl>thead>tr:nth-child(2)>td:nth-child(${k}){z-index:6;}`;
    }
    css += `#mtbl>thead>tr>*:nth-child(${n}),#mtbl>tbody>tr>*:nth-child(${n}){box-shadow:2px 0 4px rgba(0,0,0,.06);}`;
    return css;
  }, [pinned, freezeCols, colLefts]);

  async function undoLast() {
    try {
      const r = await api.post("/api/undo", {});
      if (!r.ok) { alert(r.message || "Không có gì để hoàn tác."); return; }
      loadOrders(month);
    } catch (e) { setErr(e.message); }
  }
  // Ảnh deli trong cột Tracking — Lister lấy để gửi khách; dán/tải/xóa.
  const setPurImg = (orderId, purchase) => setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, purchases: (o.purchases || []).map((x) => x.id === purchase.id ? purchase : x) } : o));
  async function uploadDeli(p, file) {
    if (!file) return;
    try { const dataUrl = await fileToResizedDataUrl(file); setPurImg(p.orderId, (await api.post(`/api/purchases/${p.id}/deli-image`, { dataUrl })).purchase); }
    catch (e) { setErr(e.message); }
  }
  async function removeDeli(p) { try { setPurImg(p.orderId, (await api.del(`/api/purchases/${p.id}/deli-image`)).purchase); } catch (e) { setErr(e.message); } }
  const deliImageCell = (p, canEdit) => {
    if (p.deliImage) return (
      <span style={{ whiteSpace: "nowrap" }}>
        <img src={p.deliImage} alt="deli" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", cursor: "zoom-in", verticalAlign: "middle" }}
          onMouseMove={(e) => setPreview({ url: p.deliImage, x: e.clientX, y: e.clientY })} onMouseLeave={() => setPreview(null)}
          onClick={() => window.open(p.deliImage, "_blank")} title="Bấm mở · rê chuột phóng to" />
        <a className="btn sm" href={p.deliImage} download style={{ marginLeft: 4, padding: "1px 6px", fontSize: 11 }} title="Tải ảnh về gửi khách">⬇</a>
        {canEdit && <button className="btn sm" onClick={() => removeDeli(p)} style={{ marginLeft: 3, padding: "1px 6px", fontSize: 11 }} title="Xóa ảnh">✕</button>}
      </span>
    );
    if (!canEdit) return null;
    return (
      <span tabIndex={0} onPaste={(e) => { const f = imageFromPaste(e); if (f) { e.preventDefault(); uploadDeli(p, f); } }}
        title="Bấm vào ô rồi Ctrl+V dán ảnh deli, hoặc 📁 chọn file"
        style={{ border: "1px dashed var(--border)", borderRadius: 6, padding: "1px 6px", fontSize: 11, color: "var(--muted)", cursor: "text" }}>
        📋 Dán ảnh
        <label className="btn sm" style={{ padding: "0 5px", fontSize: 11, marginLeft: 3, cursor: "pointer" }}>📁
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { uploadDeli(p, e.target.files[0]); e.target.value = ""; }} />
        </label>
      </span>
    );
  };
  const trackingCell = (o, ro) => o.purchases && o.purchases.length
    ? o.purchases.map((p, i) => (
        <div key={i} style={{ marginBottom: 5 }}>
          <TruncCell text={p.tracking != null && p.tracking !== "" ? String(p.tracking) : ""} w={150} onShow={(t) => viewCell("Tracking", t)} />
          <div style={{ marginTop: 2 }}>{deliImageCell(p, !ro)}</div>
        </div>
      ))
    : <span className="muted">—</span>;

  async function saveAdminNote(text) {
    try { await api.put("/api/settings/adminNoteForLister", { value: text }); setAdminNote(text); setNoteEdit(false); }
    catch (e) { setErr(e.message); }
  }
  // Đẩy đơn tháng cũ sang tháng hiện tại để xử lý lại.
  async function moveToCurrent(o) {
    if (!confirm(`Đẩy đơn ${o.orderNo} sang tháng hiện tại (${activeMonth}) để xử lý lại?`)) return;
    try { await api.post(`/api/orders/${o.id}/to-current`, {}); loadOrders(month); }
    catch (e) { setErr(e.message); }
  }
  async function moveSelectedToCurrent() {
    if (!sel.size) return;
    if (!confirm(`Đẩy ${sel.size} đơn đã chọn sang tháng hiện tại (${activeMonth})?`)) return;
    try { const r = await api.post("/api/orders/move-current", { ids: [...sel] }); setSel(new Set()); loadOrders(month); setErr(`✓ Đã đẩy ${r.moved} đơn sang ${r.to}.`); setTimeout(() => setErr(""), 3000); }
    catch (e) { setErr(e.message); }
  }
  async function patch(id, body) {
    try {
      const { order } = await api.put(`/api/orders/${id}`, body);
      // Giữ lại read-back từ NV xử lý (purchases: Name/Tracking/…) + addrCount/multiCount — order trả về không kèm.
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...order } : o)));
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
  const stack = (o, field, w = 120, label = field) => o.purchases && o.purchases.length
    ? o.purchases.map((p, i) => {
        const v = p[field] != null && p[field] !== "" ? String(p[field]) : "";
        return <TruncCell key={i} text={v} w={w} onShow={(t) => viewCell(label, t)} />;
      })
    : <span className="muted">—</span>;
  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  // Cột Order#: hiện giá trị + mốc thời gian lần Order# thay đổi gần nhất (order_time).
  const stackOrderNo = (o) => o.purchases && o.purchases.length
    ? o.purchases.map((p, i) => {
        const v = p.orderNumber != null && p.orderNumber !== "" ? String(p.orderNumber) : "";
        return (
          <div key={i} style={{ marginBottom: 3 }}>
            <TruncCell text={v} w={110} onShow={(t) => viewCell("Order#", t)} />
            {p.orderTime ? <div className="muted" style={{ fontSize: 10 }}>🕒 {fmtTime(p.orderTime)}</div> : null}
          </div>
        );
      })
    : <span className="muted">—</span>;

  return (
    <div>
      {/* Ghi chú của Admin cho Lister xem */}
      {(adminNote || isAdmin) && (
        <div className="card" style={{ marginBottom: 12, padding: "10px 14px", background: "#fffbea", borderColor: "#eab308" }}>
          {noteEdit ? (
            <div>
              <textarea className="input" rows={3} defaultValue={adminNote} id="adminNoteDraft"
                placeholder="Ghi chú / thông báo cho Listing…" style={{ width: "100%", resize: "vertical" }} />
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <Button sm variant="primary" onClick={() => saveAdminNote(document.getElementById("adminNoteDraft").value)}>Lưu</Button>
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
            🖼️ Lấy ảnh ({missingImages})
            {polling > 0 && (imgQ && (imgQ.pending + imgQ.running) > 0 ? ` … còn ${imgQ.pending + imgQ.running}` : " …")}
          </Button>
        )}
        {(isAdmin || isLister) && <Button onClick={() => setEditing({ store: stores[0] || "" })}>＋ Thêm đơn</Button>}
        {(isAdmin || isLister) && <Button variant="primary" onClick={() => setImportOpen(true)}>⬆️ Import eBay</Button>}
        <Button onClick={undoLast} title="Hoàn tác thao tác sửa ô gần nhất của bạn">↩️ Hoàn tác</Button>
        <Button onClick={() => setPinned((p) => !p)} variant={pinned ? "primary" : ""} title="Ghim tiêu đề + cột khi cuộn">📌 Ghim</Button>
        {pinned && (
          <span className="row" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>cột:</span>
            <input className="input" type="number" min="0" max="12" style={{ width: 56, padding: "4px 6px" }}
              value={freezeCols} title="Số cột ghim từ trái"
              onChange={(e) => setFreezeCols(Math.max(0, Math.min(12, Number(e.target.value) || 0)))} />
          </span>
        )}
      </div>

      {imgQ && imgQ.blocked && (
        <div className="card" style={{ padding: "8px 12px", marginBottom: 10, borderColor: "var(--red)", background: "var(--red-bg)", color: "var(--red)" }}>
          🚫 <b>eBay đang chặn lấy ảnh</b> (trang "Pardon Our Interruption"). Đã tạm dừng hàng đợi ~{Math.ceil((imgQ.blockedSeconds || 0) / 60)} phút để tránh bị chặn nặng hơn — thử lại sau, hoặc dán link ảnh thủ công vào ô Ảnh.
        </div>
      )}
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {isAdmin && sel.size > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <b>{sel.size}</b> đơn đã chọn — Chia cho:
          {teams.map((t) => (
            <Button key={t.id} sm variant="primary" onClick={() => divide(t.id)}>{t.name}</Button>
          ))}
          <Button sm onClick={() => divide("")}>Bỏ chia</Button>
          <Button sm onClick={moveSelectedToCurrent} title="Chuyển đơn tháng cũ sang tháng hiện tại để xử lý lại">📅 Đẩy sang {activeMonth}</Button>
          <div className="spacer" />
          <Button sm variant="danger" onClick={bulkDelete}>🗑 Xóa đã chọn ({sel.size})</Button>
          <Button sm onClick={() => setSel(new Set())}>Bỏ chọn</Button>
        </div>
      )}

      <Bar />

      {colStyle && <style>{colStyle}</style>}
      <div className={"card" + (pinned ? " pinwrap" : "")} style={{ padding: 0, overflowX: "auto" }}>
        <table id="mtbl" ref={tableRef} className="tbl" style={{ minWidth: 1850, whiteSpace: "nowrap" }}>
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
            <th title="Cảnh báo GẤP (Lister bật) để người xử lý chú ý">🚨 Gấp</th>
            <th title="Note của nhân viên xử lý (Sheet Con)">Note NV</th>
            <th>Trạng thái tổng</th>
            <th>Người nhận</th><th>Name</th><th>Tracking</th><th>Order#</th><th>Email</th><th>Phone</th><th>Zip</th><th>TT xử lý</th>
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
            <td>{fEnum("urgent", [{ v: "", l: "Tất cả" }, { v: "1", l: "🚨 Chỉ gấp" }])}</td>
            <td>{fText("staffNote", 90)}</td>
            <td>{fMulti("masterStatus", [{ v: "__empty", l: "(trống)" }, ...statuses.map((s) => ({ v: s, l: s }))])}</td>
            <td>{fText("claimedName", 80)}</td>
            <td>{fText("name", 90)}</td>
            <td>{fText("tracking", 100)}</td>
            <td>{fText("orderNumber", 90)}</td>
            <td>{fText("email", 100)}</td>
            <td>{fText("phone", 80)}</td>
            <td>{fText("zip", 60)}</td>
            <td>{fMulti("procStatus", [{ v: "__empty", l: "(trống)" }, ...procStatuses.map((s) => ({ v: s, l: s }))])}</td>
            <td>{activeFilters > 0 && <button className="btn sm" onClick={clearFilters} title="Xóa lọc">✕</button>}</td>
          </tr></thead>
          <tbody>
            {displayed.map((o) => {
              const procSt = (o.purchases || []).map((p) => p.processStatus).find(Boolean) || "";
              const rowColor = rowBg(o.masterStatus, procSt, statusColors);
              // "Có tracking": khi MỌI hàng (thẻ) trong đơn đều có TRẠNG THÁI XỬ LÝ = "Có Tracking".
              const purs = o.purchases || [];
              const allTracked = purs.length > 0 && purs.every((p) => String(p.processStatus || "").trim().toLowerCase() === "có tracking");
              const ro = o.canEdit === false;   // Lister: đơn không thuộc store mình quản lý → chỉ xem
              const roBg = ro ? "#f8fafc" : undefined;
              return (
              <tr key={o.id} data-oid={o.id} style={{ background: rowColor || undefined, "--rowbg": rowColor || "#fff", boxShadow: o.urgent ? "inset 4px 0 0 0 var(--red)" : undefined }}>
                {isAdmin && <td><input type="checkbox" checked={sel.has(o.id)} onChange={() => toggleSel(o.id)} /></td>}
                <td>{isAdmin
                  ? <select className="input" style={{ padding: "4px 6px", minWidth: 90 }} value={o.team}
                      onChange={(e) => patch(o.id, { team: e.target.value })}>
                      <option value="">— chưa chia —</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  : (o.team ? <Badge color="amber">{teamName(o.team)}</Badge> : <span className="muted">—</span>)}
                </td>
                <td style={{ fontWeight: 600 }}>{o.store}{ro && <span title="Không thuộc store bạn quản lý — chỉ xem" style={{ marginLeft: 4 }}>🔒</span>}</td>
                <td style={{ background: o.multiCount > 1 ? "#eef2ff" : undefined }}>
                  <div>{o.orderNo}</div>
                  {o.multiCount > 1 && (
                    <button className="badge" style={{ marginTop: 3, cursor: "pointer", border: "none", background: "#6366f1", color: "#fff", fontSize: 10 }}
                      title="Đơn nhiều sản phẩm — bấm để gom tất cả sản phẩm cùng đơn này" onClick={() => setF("id", o.orderNo)}>
                      📦 {o.multiCount} SP
                    </button>
                  )}
                  {!ro && o.period && activeMonth && o.period !== activeMonth && (
                    <button className="badge" style={{ marginTop: 3, cursor: "pointer", border: "1px solid #0ea5e9", background: "#e0f2fe", color: "#0369a1", fontSize: 10, display: "block" }}
                      title={`Đơn tháng ${o.period} — đẩy sang tháng hiện tại (${activeMonth}) để xử lý lại`} onClick={() => moveToCurrent(o)}>
                      📅 Đẩy sang {activeMonth}
                    </button>
                  )}
                </td>
                {(() => {
                  const cnt = o.addrCount || 0;   // đếm trên TOÀN BỘ đơn (mọi tháng, kể cả đơn cũ)
                  const dup = cnt > 1;
                  const lines = String(o.address || "").split("\n").filter(Boolean);
                  return (
                    <td style={{ minWidth: 180, maxWidth: 260, whiteSpace: "normal", fontSize: 13, lineHeight: 1.5,
                      fontWeight: 600, color: "var(--text)",
                      background: dup ? "#fff3cd" : undefined, outline: dup ? "1px solid #e0a800" : undefined }}>
                      {lines.length ? (<>
                        <div style={{ fontWeight: 800 }}>{lines[0]}</div>
                        {lines.slice(1).map((l, i) => <div key={i} style={{ fontWeight: 600, color: "var(--text)" }}>{l}</div>)}
                      </>) : <span className="muted">—</span>}
                      {dup && <div style={{ marginTop: 4 }}><span className="badge amber" style={{ fontSize: 10 }} title="Tính trên mọi tháng, kể cả đơn cũ">⚠ {cnt} đơn chung địa chỉ (mọi tháng)</span></div>}
                    </td>
                  );
                })()}
                <td>{o.custPhone}</td>
                <td>{Number(o.qty) >= 2
                  ? <span title="Đơn nhiều sản phẩm — chú ý!" style={{ background: "#fff3cd", color: "var(--red)", fontWeight: 800, fontSize: 15, padding: "2px 9px", borderRadius: 20, border: "1.5px solid var(--red)", whiteSpace: "nowrap" }}>⚠ ×{o.qty}</span>
                  : o.qty}</td>
                <td style={{ maxWidth: 240, whiteSpace: "normal" }}>{o.product}</td>
                <td>
                  {o.image ? (
                    <>
                      <a href={o.image} target="_blank" rel="noreferrer" title="Bấm để xem ảnh gốc">
                        <img src={o.image} alt="" style={{ width: 88, height: 88, objectFit: "contain",
                          background: "#fff", borderRadius: 8, border: "1px solid var(--border)", display: "block", cursor: "zoom-in" }}
                          onMouseMove={(e) => setPreview({ url: o.image, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setPreview(null)} />
                      </a>
                      {!ro && <div className="row" style={{ gap: 3, marginTop: 3 }}>
                        <button className="btn sm" style={{ padding: "1px 6px", fontSize: 11 }} title="Dán link ảnh khác" onClick={() => setImageManual(o)}>✎</button>
                        <button className="btn sm" style={{ padding: "1px 6px", fontSize: 11 }} title="Xóa ảnh" onClick={() => patch(o.id, { image: "" })}>✕</button>
                      </div>}
                    </>
                  ) : (ro ? <span className="muted">—</span> :
                    <>
                      <button className="btn sm" title="Lấy ảnh bìa eBay tự động" onClick={() => fetchOneImage(o.id)}
                        style={{ width: 88, height: 60, padding: 0, fontSize: 22 }}>🖼️</button>
                      <button className="btn sm" style={{ width: 88, marginTop: 3, padding: "2px 0", fontSize: 11 }}
                        title="Dán link ảnh thủ công (khi eBay chặn)" onClick={() => setImageManual(o)}>🔗 Dán link</button>
                    </>
                  )}
                </td>
                <td>{o.link ? <a href={o.link} target="_blank" rel="noreferrer">🔗</a> : ""}</td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 90, background: roBg }} defaultValue={o.size} readOnly={ro}
                    placeholder="nhập…" {...cellProps("Size", (v) => { if (v !== o.size) patch(o.id, { size: v }); })} />
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 90, background: roBg }} defaultValue={o.color} readOnly={ro}
                    placeholder="nhập…" {...cellProps("Màu", (v) => { if (v !== o.color) patch(o.id, { color: v }); })} />
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 80, background: roBg }} type="number" defaultValue={o.profit} readOnly={ro}
                    {...cellProps("Profit", (v) => { const n = Number(v) || 0; if (n !== o.profit) patch(o.id, { profit: n }); })} />
                </td>
                <td>
                  {ro ? (o.deadline || <span className="muted">—</span>)
                    : <DeadlineCell value={o.deadline}
                        bind={cellProps("Thời hạn", (v) => { if (v !== o.deadline) patch(o.id, { deadline: v }); })}
                        onPick={(v) => patch(o.id, { deadline: v })} />}
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 150, background: roBg }} defaultValue={o.masterNote} readOnly={ro} placeholder="ghi chú…"
                    {...cellProps("Note", (v) => { if (v !== o.masterNote) patch(o.id, { masterNote: v }); })} />
                </td>
                <td style={{ background: o.urgent ? "var(--red-bg)" : undefined, minWidth: 150 }}>
                  <label className="row" style={{ gap: 5, cursor: ro ? "default" : "pointer", fontWeight: 700, color: o.urgent ? "var(--red)" : undefined }}>
                    <input type="checkbox" checked={!!o.urgent} disabled={ro} onChange={(e) => patch(o.id, { urgent: e.target.checked })} /> 🚨 Gấp
                  </label>
                  {o.urgent && (
                    <input className="input" style={{ padding: "4px 6px", width: 150, marginTop: 4, borderColor: "var(--red)", background: roBg }}
                      defaultValue={o.urgentNote} readOnly={ro} placeholder="lý do gấp / thông tin…"
                      {...cellProps("Cảnh báo gấp", (v) => { if (v !== o.urgentNote) patch(o.id, { urgentNote: v }); })} />
                  )}
                </td>
                <td style={{ fontSize: 12, maxWidth: 170, whiteSpace: "normal" }}>{o.staffNote || <span className="muted">—</span>}</td>
                <td>
                  <select className="input" style={{ padding: "4px 6px", minWidth: 110, background: roBg }} value={o.masterStatus} disabled={ro}
                    onChange={(e) => patch(o.id, { masterStatus: e.target.value })}>
                    <option value="">— trống —</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {o.masterStatus === "Đã Cancel" && (
                    <select className="input" style={{ padding: "3px 6px", minWidth: 110, marginTop: 4, fontSize: 12, background: roBg }} disabled={ro}
                      value={o.cancelReason || ""} onChange={(e) => patch(o.id, { cancelReason: e.target.value })} title="Lý do Cancel">
                      <option value="">— lý do cancel —</option>
                      {cancelReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{o.claimedName ? <Badge color="green">{o.claimedName}</Badge> : <span className="muted">—</span>}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "name", 120, "Name")}</td>
                <td style={{ fontSize: 12, background: allTracked ? "var(--green-bg)" : undefined }}
                    title={allTracked ? "Tất cả hàng trong đơn đều ở trạng thái 'Có Tracking'" : ""}>
                  {allTracked && <div style={{ marginBottom: 3 }}><Badge color="green">✓ Có tracking</Badge></div>}
                  {trackingCell(o, ro)}
                </td>
                <td style={{ fontSize: 12 }}>{stackOrderNo(o)}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "email", 160, "Email")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "phone", 110, "Phone")}</td>
                <td style={{ fontSize: 12 }}>{stack(o, "zip", 70, "Zip")}</td>
                <td style={{ fontSize: 12 }}>{o.purchases && o.purchases.length
                  ? o.purchases.map((p, i) => p.processStatus ? <div key={i}><Badge>{p.processStatus}</Badge></div> : <div key={i} className="muted">·</div>)
                  : <span className="muted">—</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {!ro && <Button sm onClick={() => setEditing(o)}>Sửa</Button>}
                  <Button sm onClick={() => setHistoryFor(o)} title="Lịch sử chỉnh sửa" style={{ marginLeft: ro ? 0 : 4 }}>🕘</Button>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={isAdmin ? 27 : 26} style={{ textAlign: "center", padding: 30 }} className="muted">
                Chưa có đơn nào. Bấm <b>Import eBay</b> để đổ đơn vào.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {importOpen && (
        <ImportModal currentUser={currentUser} stores={stores}
          onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); setPolling(12); refreshUser?.(); }} />
      )}
      {editing && (
        <OrderModal order={editing} currentUser={currentUser} stores={stores}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); refreshUser?.(); }} />
      )}
      {historyFor && (
        <HistoryModal orderId={historyFor.id} orderLabel={historyFor.orderNo} onClose={() => setHistoryFor(null)} />
      )}

      {preview && (
        <div style={{
          position: "fixed", zIndex: 200, pointerEvents: "none", background: "#fff", padding: 6,
          border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 50px rgba(0,0,0,.28)",
          left: Math.min(preview.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - 480),
          top: Math.min(preview.y + 18, (typeof window !== "undefined" ? window.innerHeight : 800) - 480),
        }}>
          <img src={preview.url} alt="" style={{ width: 460, height: 460, objectFit: "contain", display: "block" }} />
        </div>
      )}
    </div>
  );
}

// Ô cố định bề rộng, cắt gọn bằng "…"; bấm → hiện đầy đủ trên thanh formula bar (để xem + copy).
function TruncCell({ text, w = 120, onShow }) {
  if (!text) return <div className="muted">·</div>;
  return (
    <div onClick={() => onShow && onShow(text)} title={text}
      style={{ maxWidth: w, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {text}
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
      const txt = String(reader.result);
      // Tự nhận: file eBay OrdersReport hoặc mẫu chuẩn OrderHub (cột "ID Order").
      try { setParsed(parseEbayCsv(txt)); setErr(""); }
      catch {
        try { setParsed(parseOrderHubCsv(txt)); setErr(""); }
        catch (e2) { setErr(e2.message); setParsed(null); }
      }
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
              <>
                <select className="input" value={myStores.includes(store) ? store : "__new"}
                  onChange={(e) => setStore(e.target.value === "__new" ? "" : e.target.value)}>
                  <option value="">— chọn store —</option>
                  {myStores.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="__new">+ store mới…</option>
                </select>
                {!myStores.includes(store) && (
                  <input className="input" style={{ marginTop: 6 }} value={store} placeholder="Tên store MỚI (chưa có sẽ tự thêm vào tài khoản bạn)"
                    onChange={(e) => setStore(e.target.value)} />
                )}
              </>
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
  const isLister = currentUser.role === "Lister";
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
        {!isNew && (isAdmin || currentUser.role === "Lister") && <Button variant="danger" onClick={remove}>Xóa</Button>}
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
              {(isAdmin || isLister) && <option value="__new">+ store mới…</option>}
            </select>
            {(isAdmin || isLister) && f.store === "__new" &&
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
