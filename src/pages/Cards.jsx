import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button } from "../ui.jsx";
import { api } from "../api.js";
import { useFormulaBar } from "../useFormulaBar.jsx";

// Sheet Mua thẻ — Admin + card-buyers issue cards against requests and see stats.
export default function Cards({ currentUser }) {
  const isAdmin = currentUser?.role === "Admin";
  const [reqs, setReqs] = useState([]);
  const [cardStatuses, setCardStatuses] = useState([]);
  const [lockStatuses, setLockStatuses] = useState([]);   // thẻ hợp lệ
  const [errorStatuses, setErrorStatuses] = useState([]); // thẻ lỗi
  const [statusColors, setStatusColors] = useState({});   // màu nền theo trạng thái
  const isCount = (st) => lockStatuses.map((s) => s.toLowerCase()).includes(String(st || "").toLowerCase());
  // Chỉ khóa khi trạng thái hiện tại thuộc nhóm "thẻ hợp lệ" → chỉ đổi qua lại trong nhóm hợp lệ.
  const restrictedFor = (r) => !isAdmin && isCount(r.status);
  const otherStatuses = cardStatuses.filter((s) => ![...lockStatuses, ...errorStatuses].map((x) => x.toLowerCase()).includes(s.toLowerCase()));
  const [cf, setCf] = useState({});                       // bộ lọc theo TỪNG CỘT
  const setF = (k, v) => setCf((p) => ({ ...p, [k]: v }));
  const clearFilters = () => setCf({});
  const activeFilters = Object.values(cf).filter((v) => String(v || "").trim()).length;
  const [copiedId, setCopiedId] = useState("");
  async function copyCard(r) {
    const t = String(r.card || "").trim();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopiedId(r.id); setTimeout(() => setCopiedId(""), 1500);
  }
  const fText = (key, w = 90) => (
    <input className="input" style={{ padding: "3px 5px", width: w, fontSize: 12 }}
      value={cf[key] || ""} onChange={(e) => setF(key, e.target.value)} placeholder="lọc" />
  );
  const [month, setMonth] = useState("");                 // tháng Mua thẻ (theo tháng đơn); "" chưa set, "all" = tất cả
  const [activeMonth, setActiveMonth] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 100;
  const [err, setErr] = useState("");
  const { cellProps, Bar } = useFormulaBar();

  const statusOptions = [...new Set([...lockStatuses, ...errorStatuses, ...cardStatuses])];
  // Danh sách tháng: gộp các period của yêu cầu thẻ + tháng đơn đang hoạt động.
  const months = useMemo(() => {
    const set = new Set(reqs.map((r) => r.period).filter(Boolean));
    if (activeMonth) set.add(activeMonth);
    return [...set].sort().reverse();
  }, [reqs, activeMonth]);
  const T = (v) => String(v ?? "").toLowerCase();
  const txt = (val, f) => !f || T(val).includes(T(f));
  const filtered = useMemo(() => reqs.filter((r) => {
    if (month && month !== "all" && (r.period || "") !== month) return false;
    if (cf.status === "__empty") { if (r.status) return false; }
    else if (cf.status && r.status !== cf.status) return false;
    if (!txt(r.code, cf.code)) return false;
    if (!txt(r.card, cf.card)) return false;
    if (!txt(r.content, cf.content)) return false;
    if (!txt(r.requesterName, cf.requesterName)) return false;
    if (!txt(r.adminNote, cf.adminNote)) return false;
    if (!txt((r.stats?.orders || []).join(", "), cf.orders)) return false;
    return true;
  }), [reqs, month, cf]);

  // Phân trang 100 hàng/trang.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => { setPage(1); }, [cf, month]);                       // đổi bộ lọc → về trang 1
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);   // giữ trang hợp lệ
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function load() {
    try {
      setReqs((await api.get("/api/card-requests")).requests);
      const s = (await api.get("/api/settings")).settings;
      setCardStatuses(s.cardStatuses || []);
      setLockStatuses(s.cardCountStatuses || []);
      setErrorStatuses(s.cardErrorStatuses || []);
      setStatusColors(s.statusColors || {});
      try { const mo = await api.get("/api/months"); setActiveMonth(mo.activeMonth || ""); setMonth((cur) => cur || mo.activeMonth || "all"); } catch {}
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  // Tự cập nhật mỗi 15s: yêu cầu mới / trạng thái / thẻ cấp đều hiện ngay,
  // chỉ CHỪA đúng dòng đang được focus (đang gõ thẻ) để không mất chữ.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const fresh = (await api.get("/api/card-requests")).requests;
        const editingId = document.activeElement?.closest?.("tr[data-rid]")?.getAttribute("data-rid") || null;
        setReqs((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          return fresh.map((f) => (editingId && String(f.id) === editingId && byId.has(f.id)) ? byId.get(f.id) : f);
        });
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, []);

  async function update(id, body) {
    try { const { request } = await api.put(`/api/card-requests/${id}`, body); setReqs((p) => p.map((r) => r.id === id ? request : r)); }
    catch (e) { setErr(e.message); }
  }

  // Cộng theo TỪNG THẺ (distinct card_value) — tránh nhân đôi khi 1 thẻ xuất hiện ở nhiều dòng yêu cầu.
  const { totalProfit, totalBalance } = useMemo(() => {
    const seen = new Set();
    let profit = 0, balance = 0;
    for (const r of filtered) {
      const key = String(r.card || "").trim();
      if (key) { if (seen.has(key)) continue; seen.add(key); }
      profit += r.stats?.profit || 0;
      balance += r.stats?.balance || 0;
    }
    return { totalProfit: profit, totalBalance: balance };
  }, [filtered]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Mua thẻ</h2>
        <Badge color="blue">{filtered.length} thẻ/yêu cầu</Badge>
        <Badge color="green">Tổng profit: ${Math.round(totalProfit * 100) / 100}</Badge>
        <Badge color="blue">Tổng balance: ${Math.round(totalBalance * 100) / 100}</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} title="Tháng Mua thẻ (theo tháng đơn)">
          <option value="all">📅 Tất cả tháng</option>
          {months.map((m) => <option key={m} value={m}>{m}{m === activeMonth ? " • hiện tại" : ""}</option>)}
        </select>
        {activeFilters > 0 && <Button sm onClick={clearFilters}>✕ Xóa lọc ({activeFilters})</Button>}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <Bar />

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th>ID lệnh</th><th>Thẻ</th><th>Yêu cầu</th><th>NV yêu cầu</th><th>Trạng thái</th>
              <th>📝 Note (Admin)</th><th>Đơn đã xử lý (ID Order)</th><th>Thống kê</th>
            </tr>
            {/* Lọc theo TỪNG CỘT */}
            <tr style={{ background: "#fbfcfd" }}>
              <td>{fText("code", 80)}</td>
              <td>{fText("card", 120)}</td>
              <td>{fText("content", 130)}</td>
              <td>{fText("requesterName", 90)}</td>
              <td>
                <select className="input" style={{ padding: "3px 5px", fontSize: 12, minWidth: 110 }}
                  value={cf.status || ""} onChange={(e) => setF("status", e.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="__empty">(chưa có)</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td>{fText("adminNote", 130)}</td>
              <td>{fText("orders", 120)}</td>
              <td></td>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} data-rid={r.id} style={{ background: statusColors[r.status] || undefined }}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.code}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <input className="input" style={{ padding: "5px 8px", width: 160 }} defaultValue={r.card}
                      placeholder="Nhập thẻ cấp…" {...cellProps("Thẻ", (v) => { if (v !== r.card) update(r.id, { card: v }); })} />
                    {r.card && <button className="btn sm" title="Copy thẻ" onClick={() => copyCard(r)} style={{ whiteSpace: "nowrap" }}>
                      {copiedId === r.id ? "✓" : "📋"}
                    </button>}
                  </div>
                </td>
                <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{r.content || <span className="muted">—</span>}</td>
                <td>{r.requesterName}</td>
                <td>
                  <select className="input" style={{ padding: "5px 8px", minWidth: 120 }} value={r.status}
                    title={restrictedFor(r) ? "Thẻ đã làm đơn/chốt bill — chỉ đổi giữa Live/Sai bill (Admin mới đổi khác)" : ""}
                    onChange={(e) => update(r.id, { status: e.target.value })}>
                    {restrictedFor(r) ? (
                      lockStatuses.map((s) => <option key={s} value={s}>{s}</option>)
                    ) : (<>
                      <option value="">— trống —</option>
                      {lockStatuses.length > 0 && <optgroup label="🟢 Thẻ hợp lệ">{lockStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                      {errorStatuses.length > 0 && <optgroup label="🔴 Thẻ lỗi">{errorStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                      {otherStatuses.length > 0 && <optgroup label="Khác">{otherStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                    </>)}
                  </select>
                  {restrictedFor(r) && <span title="Đã chốt bill"> 🔒</span>}
                </td>
                <td>
                  <input className="input" style={{ padding: "4px 6px", width: 150 }} defaultValue={r.adminNote}
                    placeholder="note của admin…" {...cellProps("Note (Admin)", (v) => { if (v !== (r.adminNote || "")) update(r.id, { adminNote: v }); })} />
                </td>
                <td style={{ maxWidth: 240, whiteSpace: "normal", fontSize: 12 }}>
                  {r.stats?.orders?.length ? r.stats.orders.join(", ") : <span className="muted">—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div>💰 <b>${r.stats?.profit || 0}</b></div>
                  <div>💳 Balance: <b>${r.stats?.balance || 0}</b></div>
                  <div className="muted" style={{ fontSize: 12 }}>✅ {r.stats?.completed || 0} đơn Đã Up</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }} className="muted">
                {reqs.length ? "Không khớp bộ lọc." : "Chưa có yêu cầu thẻ nào. Nhân viên tạo yêu cầu ở trang “Yêu cầu thẻ”."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="row" style={{ marginTop: 12, gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <Button sm disabled={page <= 1} onClick={() => setPage(1)}>« Đầu</Button>
          <Button sm disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Trước</Button>
          <span className="muted" style={{ fontSize: 13 }}>
            Trang <b>{page}</b>/{totalPages} · {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)}/{filtered.length}
          </span>
          <Button sm disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Sau ›</Button>
          <Button sm disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Cuối »</Button>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 Cột Thẻ bạn nhập sẽ là thẻ hợp lệ để nhân viên dùng ở Sheet Con. Profit chia theo tỉ lệ số tiền mỗi thẻ, chỉ tính đơn “Đã Up”.
      </div>
    </div>
  );
}
