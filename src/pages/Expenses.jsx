import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Thống kê chi phí — Admin nhập tay các khoản chi, 2 loại tiền VND & USDT tách riêng.
// Danh mục gợi ý theo team (Tín, V3) + Lương + Khác, và có thể gõ danh mục mới.
export default function Expenses({ teams = [] }) {
  const [items, setItems] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [err, setErr] = useState("");
  const today = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const [qa, setQa] = useState({ date: today(), category: "", currency: "VND", amount: "", note: "" });

  async function load() {
    try { setItems((await api.get("/api/expenses")).expenses); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const fmtVND = (n) => Math.round(n || 0).toLocaleString("vi-VN") + " ₫";
  const fmtUSDT = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("en-US") + " USDT";
  const fmtMoney = (cur, n) => (cur === "USDT" ? fmtUSDT(n) : fmtVND(n));
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).split("-"); return (dd && m && y) ? `${dd}/${m}/${y}` : d; };

  // Suggested categories: teams + defaults + categories already used.
  const catSuggestions = useMemo(() => {
    const set = new Set();
    teams.forEach((t) => set.add(t.name));
    ["Lương", "Khác"].forEach((c) => set.add(c));
    items.forEach((e) => e.category && set.add(e.category));
    return [...set];
  }, [teams, items]);

  const filtered = useMemo(() => items.filter((e) => {
    if (from && (e.date || "") < from) return false;
    if (to && (e.date || "") > to) return false;
    if (catFilter && e.category !== catFilter) return false;
    return true;
  }), [items, from, to, catFilter]);

  const totalVND = filtered.filter((e) => e.currency === "VND").reduce((s, e) => s + (e.amount || 0), 0);
  const totalUSDT = filtered.filter((e) => e.currency === "USDT").reduce((s, e) => s + (e.amount || 0), 0);

  // Breakdown per category → {vnd, usdt, count}.
  const byCategory = useMemo(() => {
    const m = {};
    for (const e of filtered) {
      const k = e.category || "(không danh mục)";
      const g = m[k] || (m[k] = { vnd: 0, usdt: 0, count: 0 });
      if (e.currency === "USDT") g.usdt += e.amount || 0; else g.vnd += e.amount || 0;
      g.count++;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [filtered]);

  const upQa = (k, v) => setQa((p) => ({ ...p, [k]: v }));
  async function add() {
    if (!(Number(qa.amount) > 0)) { setErr("Nhập số tiền hợp lệ"); return; }
    try {
      await api.post("/api/expenses", qa);
      setQa((p) => ({ ...p, category: "", amount: "", note: "" })); // giữ ngày + loại tiền
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
    if (!confirm("Xóa khoản chi này?")) return;
    try { await api.del(`/api/expenses/${e.id}`); setItems((p) => p.filter((x) => x.id !== e.id)); }
    catch (err) { setErr(err.message); }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Thống kê chi phí</h2>
        <Badge color="blue">{filtered.length} khoản</Badge>
        <div className="spacer" />
        <span className="muted">Từ</span>
        <input className="input" type="date" style={{ maxWidth: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">đến</span>
        <input className="input" type="date" style={{ maxWidth: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input" style={{ maxWidth: 160 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">🗂 Tất cả danh mục</option>
          {catSuggestions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(from || to || catFilter) && <Button sm onClick={() => { setFrom(""); setTo(""); setCatFilter(""); }}>✕ Xóa lọc</Button>}
      </div>

      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {/* Hai tổng tách riêng */}
      <div className="row" style={{ gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: "14px 18px", minWidth: 220 }}>
          <div className="muted" style={{ fontSize: 12 }}>TỔNG CHI VND</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>{fmtVND(totalVND)}</div>
        </div>
        <div className="card" style={{ padding: "14px 18px", minWidth: 220 }}>
          <div className="muted" style={{ fontSize: 12 }}>TỔNG CHI USDT</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0ea5a4" }}>{fmtUSDT(totalUSDT)}</div>
        </div>
      </div>

      {/* Thanh thêm nhanh */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Ngày</label>
            <input className="input" type="date" style={{ width: 150 }} value={qa.date} onChange={(e) => upQa("date", e.target.value)} />
          </div>
          <div>
            <label className="label">Danh mục</label>
            <input className="input" list="exp-cats" style={{ width: 180 }} placeholder="Tín / V3 / Lương / …"
              value={qa.category} onChange={(e) => upQa("category", e.target.value)} />
            <datalist id="exp-cats">{catSuggestions.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label">Loại tiền</label>
            <select className="input" style={{ width: 100 }} value={qa.currency} onChange={(e) => upQa("currency", e.target.value)}>
              <option value="VND">VND</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          <div>
            <label className="label">Số tiền</label>
            <input className="input" type="number" style={{ width: 140 }} placeholder="0" value={qa.amount}
              onChange={(e) => upQa("amount", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="label">Ghi chú</label>
            <input className="input" style={{ width: "100%" }} placeholder="ghi chú…" value={qa.note}
              onChange={(e) => upQa("note", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <Button variant="primary" onClick={add}>＋ Thêm khoản chi</Button>
        </div>
      </div>

      <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Bảng theo danh mục */}
        <div className="card" style={{ padding: 0, flex: "1 1 320px", minWidth: 300 }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>Theo danh mục</div>
          <table className="tbl" style={{ width: "100%" }}>
            <thead><tr><th>Danh mục</th><th style={{ textAlign: "right" }}>VND</th><th style={{ textAlign: "right" }}>USDT</th></tr></thead>
            <tbody>
              {byCategory.map(([cat, g]) => (
                <tr key={cat}>
                  <td>{cat} <span className="muted" style={{ fontSize: 11 }}>({g.count})</span></td>
                  <td style={{ textAlign: "right" }}>{g.vnd ? fmtVND(g.vnd) : <span className="muted">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{g.usdt ? fmtUSDT(g.usdt) : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {byCategory.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 18 }}>Chưa có dữ liệu.</td></tr>}
            </tbody>
            {byCategory.length > 0 && (
              <tfoot><tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td>Tổng</td>
                <td style={{ textAlign: "right" }}>{fmtVND(totalVND)}</td>
                <td style={{ textAlign: "right" }}>{fmtUSDT(totalUSDT)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>

        {/* Danh sách chi tiết */}
        <div className="card" style={{ padding: 0, flex: "2 1 480px", minWidth: 340, overflowX: "auto" }}>
          <div style={{ padding: "10px 14px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>Chi tiết các khoản</div>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th>Ngày</th><th>Danh mục</th><th>Loại</th><th style={{ textAlign: "right" }}>Số tiền</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input className="input" type="date" style={{ padding: "3px 5px", width: 140 }} defaultValue={e.date}
                      onBlur={(ev) => save(e, "date", ev.target.value)} />
                  </td>
                  <td>
                    <input className="input" list="exp-cats" style={{ padding: "3px 5px", width: 130 }} defaultValue={e.category}
                      onBlur={(ev) => save(e, "category", ev.target.value)} />
                  </td>
                  <td>
                    <select className="input" style={{ padding: "3px 5px", width: 84 }} value={e.currency}
                      onChange={(ev) => save(e, "currency", ev.target.value)}>
                      <option value="VND">VND</option>
                      <option value="USDT">USDT</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input className="input" type="number" style={{ padding: "3px 5px", width: 120, textAlign: "right" }} defaultValue={e.amount}
                      onBlur={(ev) => save(e, "amount", ev.target.value)} />
                  </td>
                  <td>
                    <input className="input" style={{ padding: "3px 5px", width: 160 }} defaultValue={e.note}
                      onBlur={(ev) => save(e, "note", ev.target.value)} />
                  </td>
                  <td><Button sm variant="danger" onClick={() => remove(e)}>✕</Button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 22 }}>Chưa có khoản chi nào. Dùng thanh trên để thêm.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
