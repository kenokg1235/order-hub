import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Thống kê tài chính — Admin nhập tay Chi phí & Profit (nhiều loại tiền VND/USDT/USD),
// tổng Chi phí và tổng Profit tách riêng theo từng loại tiền.
export default function Expenses({ teams = [] }) {
  const [items, setItems] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");   // "" | expense | profit
  const [err, setErr] = useState("");
  const today = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const [qa, setQa] = useState({ date: today(), kind: "expense", category: "", currency: "VND", amount: "", note: "" });

  async function load() {
    try { setItems((await api.get("/api/expenses")).expenses); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const fmtVND = (n) => Math.round(n || 0).toLocaleString("vi-VN") + " ₫";
  const fmtUSDT = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("en-US") + " USDT";
  const fmtUSD = (n) => "$" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-US");
  const fmtCur = (cur, n) => (cur === "USDT" ? fmtUSDT(n) : cur === "USD" ? fmtUSD(n) : fmtVND(n));
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };
  const kindOf = (e) => e.kind || "expense";

  const catSuggestions = useMemo(() => {
    const set = new Set();
    teams.forEach((t) => set.add(t.name));
    ["Lương", "Khác"].forEach((c) => set.add(c));
    items.forEach((e) => e.category && set.add(e.category));
    return [...set];
  }, [teams, items]);

  // Lọc theo ngày + danh mục (2 loại còn lại để tính tổng riêng).
  const filtered = useMemo(() => items.filter((e) => {
    if (from && (e.date || "") < from) return false;
    if (to && (e.date || "") > to) return false;
    if (catFilter && e.category !== catFilter) return false;
    return true;
  }), [items, from, to, catFilter]);
  // Lọc thêm theo Loại (cho bảng chi tiết + theo danh mục).
  const shown = useMemo(() => filtered.filter((e) => !kindFilter || kindOf(e) === kindFilter), [filtered, kindFilter]);

  const sum = (kind, cur) => filtered.filter((e) => kindOf(e) === kind && e.currency === cur).reduce((s, e) => s + (e.amount || 0), 0);
  const sumShown = (cur) => shown.filter((e) => e.currency === cur).reduce((s, e) => s + (e.amount || 0), 0);

  // Theo danh mục (theo bộ lọc Loại hiện tại).
  const byCategory = useMemo(() => {
    const m = {};
    for (const e of shown) {
      const k = e.category || "(không danh mục)";
      const g = m[k] || (m[k] = { vnd: 0, usdt: 0, usd: 0, count: 0 });
      if (e.currency === "USDT") g.usdt += e.amount || 0;
      else if (e.currency === "USD") g.usd += e.amount || 0;
      else g.vnd += e.amount || 0;
      g.count++;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [shown]);

  const upQa = (k, v) => setQa((p) => ({ ...p, [k]: v }));
  async function add() {
    if (!(Number(qa.amount) > 0)) { setErr("Nhập số tiền hợp lệ"); return; }
    try {
      await api.post("/api/expenses", qa);
      setQa((p) => ({ ...p, category: "", amount: "", note: "" })); // giữ ngày + loại + loại tiền
      setErr(""); load();
    } catch (e) { setErr(e.message); }
  }
  async function save(e, field, value) {
    if (String(value) === String(e[field] ?? "")) return;
    try {
      const { expense } = await api.put(`/api/expenses/${e.id}`, { [field]: value });
      setItems((p) => p.map((x) => x.id === e.id ? expense : x));
    } catch (err) { setErr(err.message); }
  }
  async function remove(e) {
    if (!confirm("Xóa khoản này?")) return;
    try { await api.del(`/api/expenses/${e.id}`); setItems((p) => p.filter((x) => x.id !== e.id)); }
    catch (err) { setErr(err.message); }
  }

  // Ô tổng cho 1 nhóm (Chi phí / Profit) theo 3 loại tiền.
  const TotalCard = ({ title, kind, color }) => {
    const lines = [["VND", sum(kind, "VND"), fmtVND], ["USDT", sum(kind, "USDT"), fmtUSDT], ["USD", sum(kind, "USD"), fmtUSD]].filter(([, v]) => v);
    return (
      <div className="card" style={{ padding: "12px 18px", minWidth: 240 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>
        {lines.length === 0 ? <div style={{ fontSize: 20, fontWeight: 800, color }}>0</div>
          : lines.map(([cur, v, f]) => (
            <div key={cur} style={{ fontSize: 20, fontWeight: 800, color }}>{f(v)}</div>
          ))}
      </div>
    );
  };

  const isProfit = qa.kind === "profit";
  return (
    <div>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Thống kê tài chính</h2>
        <Badge color="blue">{shown.length} khoản</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 140 }} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="expense">Chi phí</option>
          <option value="profit">Profit</option>
        </select>
        <span className="muted">Từ</span>
        <input className="input" type="date" style={{ maxWidth: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">đến</span>
        <input className="input" type="date" style={{ maxWidth: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input" style={{ maxWidth: 150 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">🗂 Tất cả danh mục</option>
          {catSuggestions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(from || to || catFilter || kindFilter) && <Button sm onClick={() => { setFrom(""); setTo(""); setCatFilter(""); setKindFilter(""); }}>✕ Xóa lọc</Button>}
      </div>

      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Tổng Chi phí & Profit tách riêng */}
      <div className="row" style={{ gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <TotalCard title="💸 TỔNG CHI PHÍ" kind="expense" color="var(--red)" />
        <TotalCard title="💰 TỔNG PROFIT" kind="profit" color="#16a34a" />
      </div>

      {/* Thanh thêm nhanh */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Loại</label>
            <select className="input" style={{ width: 110 }} value={qa.kind} onChange={(e) => upQa("kind", e.target.value)}>
              <option value="expense">Chi phí</option>
              <option value="profit">Profit</option>
            </select>
          </div>
          <div>
            <label className="label">Ngày</label>
            <input className="input" type="date" style={{ width: 150 }} value={qa.date} onChange={(e) => upQa("date", e.target.value)} />
          </div>
          <div>
            <label className="label">Danh mục</label>
            <input className="input" list="exp-cats" style={{ width: 170 }} placeholder="Tín / V3 / Lương / …"
              value={qa.category} onChange={(e) => upQa("category", e.target.value)} />
            <datalist id="exp-cats">{catSuggestions.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label">Loại tiền</label>
            <select className="input" style={{ width: 90 }} value={qa.currency} onChange={(e) => upQa("currency", e.target.value)}>
              <option value="VND">VND</option>
              <option value="USDT">USDT</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="label">Số tiền</label>
            <input className="input" type="number" style={{ width: 130 }} placeholder="0" value={qa.amount}
              onChange={(e) => upQa("amount", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label className="label">Ghi chú</label>
            <input className="input" style={{ width: "100%" }} placeholder="ghi chú…" value={qa.note}
              onChange={(e) => upQa("note", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <Button variant="primary" onClick={add}>＋ Thêm {isProfit ? "Profit" : "khoản chi"}</Button>
        </div>
      </div>

      <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Theo danh mục */}
        <div className="card" style={{ padding: 0, flex: "1 1 360px", minWidth: 320, overflowX: "auto" }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>
            Theo danh mục {kindFilter ? `· ${kindFilter === "profit" ? "Profit" : "Chi phí"}` : ""}
          </div>
          <table className="tbl" style={{ width: "100%", minWidth: 360 }}>
            <thead><tr><th>Danh mục</th><th style={{ textAlign: "right" }}>VND</th><th style={{ textAlign: "right" }}>USDT</th><th style={{ textAlign: "right" }}>USD</th></tr></thead>
            <tbody>
              {byCategory.map(([cat, g]) => (
                <tr key={cat}>
                  <td>{cat} <span className="muted" style={{ fontSize: 11 }}>({g.count})</span></td>
                  <td style={{ textAlign: "right" }}>{g.vnd ? fmtVND(g.vnd) : <span className="muted">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{g.usdt ? fmtUSDT(g.usdt) : <span className="muted">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{g.usd ? fmtUSD(g.usd) : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {byCategory.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 18 }}>Chưa có dữ liệu.</td></tr>}
            </tbody>
            {byCategory.length > 0 && (
              <tfoot><tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td>Tổng</td>
                <td style={{ textAlign: "right" }}>{fmtVND(sumShown("VND"))}</td>
                <td style={{ textAlign: "right" }}>{fmtUSDT(sumShown("USDT"))}</td>
                <td style={{ textAlign: "right" }}>{fmtUSD(sumShown("USD"))}</td>
              </tr></tfoot>
            )}
          </table>
        </div>

        {/* Chi tiết */}
        <div className="card" style={{ padding: 0, flex: "2 1 520px", minWidth: 360, overflowX: "auto" }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>Chi tiết</div>
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead><tr><th>Loại</th><th>Ngày</th><th>Danh mục</th><th>Tiền</th><th style={{ textAlign: "right" }}>Số tiền</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td>
                    <select className="input" style={{ padding: "3px 5px", width: 92 }} value={kindOf(e)}
                      onChange={(ev) => save(e, "kind", ev.target.value)}>
                      <option value="expense">Chi phí</option>
                      <option value="profit">Profit</option>
                    </select>
                  </td>
                  <td>
                    <input className="input" type="date" style={{ padding: "3px 5px", width: 140 }} defaultValue={e.date}
                      onBlur={(ev) => save(e, "date", ev.target.value)} />
                  </td>
                  <td>
                    <input className="input" list="exp-cats" style={{ padding: "3px 5px", width: 120 }} defaultValue={e.category}
                      onBlur={(ev) => save(e, "category", ev.target.value)} />
                  </td>
                  <td>
                    <select className="input" style={{ padding: "3px 5px", width: 76 }} value={e.currency}
                      onChange={(ev) => save(e, "currency", ev.target.value)}>
                      <option value="VND">VND</option>
                      <option value="USDT">USDT</option>
                      <option value="USD">USD</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input className="input" type="number" style={{ padding: "3px 5px", width: 110, textAlign: "right" }} defaultValue={e.amount}
                      onBlur={(ev) => save(e, "amount", ev.target.value)} />
                  </td>
                  <td>
                    <input className="input" style={{ padding: "3px 5px", width: 150 }} defaultValue={e.note}
                      onBlur={(ev) => save(e, "note", ev.target.value)} />
                  </td>
                  <td><Button sm variant="danger" onClick={() => remove(e)}>✕</Button></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 22 }}>Chưa có khoản nào. Dùng thanh trên để thêm.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
