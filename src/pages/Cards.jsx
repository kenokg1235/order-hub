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
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");   // "" tất cả | "__empty" | tên trạng thái
  const [err, setErr] = useState("");
  const { cellProps, Bar } = useFormulaBar();

  const statusOptions = [...new Set([...lockStatuses, ...errorStatuses, ...cardStatuses])];
  const filtered = useMemo(() => reqs.filter((r) => {
    if (statusFilter === "__empty") { if (r.status) return false; }
    else if (statusFilter && r.status !== statusFilter) return false;
    const s = q.trim().toLowerCase();
    if (s && ![r.card, r.requesterName, r.content, r.code].some((v) => String(v || "").toLowerCase().includes(s))) return false;
    return true;
  }), [reqs, q, statusFilter]);

  async function load() {
    try {
      setReqs((await api.get("/api/card-requests")).requests);
      const s = (await api.get("/api/settings")).settings;
      setCardStatuses(s.cardStatuses || []);
      setLockStatuses(s.cardCountStatuses || []);
      setErrorStatuses(s.cardErrorStatuses || []);
      setStatusColors(s.statusColors || {});
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

  const totalProfit = filtered.reduce((s, r) => s + (r.stats?.profit || 0), 0);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Mua thẻ</h2>
        <Badge color="blue">{filtered.length} thẻ/yêu cầu</Badge>
        <Badge color="green">Tổng profit: ${Math.round(totalProfit * 100) / 100}</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="__empty">— chưa có trạng thái —</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 220 }} placeholder="🔍 Tìm thẻ / NV / yêu cầu / ID lệnh…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {(q || statusFilter) && <Button sm onClick={() => { setQ(""); setStatusFilter(""); }}>✕ Xóa lọc</Button>}
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <Bar />

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 1000 }}>
          <thead><tr>
            <th>ID lệnh</th><th>Thẻ</th><th>Yêu cầu</th><th>NV yêu cầu</th><th>Trạng thái</th>
            <th>Đơn đã xử lý (ID Order)</th><th>Thống kê</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} data-rid={r.id} style={{ background: statusColors[r.status] || undefined }}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.code}</td>
                <td>
                  <input className="input" style={{ padding: "5px 8px", width: 160 }} defaultValue={r.card}
                    placeholder="Nhập thẻ cấp…" {...cellProps("Thẻ", (v) => { if (v !== r.card) update(r.id, { card: v }); })} />
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
                <td style={{ maxWidth: 240, whiteSpace: "normal", fontSize: 12 }}>
                  {r.stats?.orders?.length ? r.stats.orders.join(", ") : <span className="muted">—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div>💰 <b>${r.stats?.profit || 0}</b></div>
                  <div className="muted" style={{ fontSize: 12 }}>✅ {r.stats?.completed || 0} đơn Đã Up</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }} className="muted">
                {reqs.length ? "Không khớp bộ lọc." : "Chưa có yêu cầu thẻ nào. Nhân viên tạo yêu cầu ở trang “Yêu cầu thẻ”."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 Cột Thẻ bạn nhập sẽ là thẻ hợp lệ để nhân viên dùng ở Sheet Con. Profit chia theo tỉ lệ số tiền mỗi thẻ, chỉ tính đơn “Đã Up”.
      </div>
    </div>
  );
}
