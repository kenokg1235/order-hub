import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Danh sách đen — username khách hàng khó. Dành cho Lister + Admin.
export default function Blacklist() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [na, setNa] = useState({ username: "", reason: "", category: "" });
  const [categories, setCategories] = useState([]);
  const [catFilter, setCatFilter] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setItems((await api.get("/api/blacklist")).blacklist);
      const s = (await api.get("/api/settings")).settings;
      setCategories(s.blacklistCategories || []);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  // Ngành hàng cho dropdown = danh sách cấu hình ∪ các ngành hàng đã dùng trong entries.
  const allCats = useMemo(() => {
    const set = new Set(categories);
    items.forEach((b) => b.category && set.add(b.category));
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [categories, items]);

  async function addCategory() {
    const name = prompt("Tên ngành hàng mới:");
    if (!name || !name.trim()) return null;
    try { const r = await api.post("/api/blacklist-categories", { name: name.trim() }); setCategories(r.categories || []); return name.trim(); }
    catch (e) { setErr(e.message); return null; }
  }
  const CatSelect = ({ value, onChange, style }) => (
    <select className="input" style={style} value={value || ""}
      onChange={async (e) => { if (e.target.value === "__new") { const c = await addCategory(); if (c) onChange(c); } else onChange(e.target.value); }}>
      <option value="">— ngành hàng —</option>
      {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value="__new">＋ Thêm ngành hàng…</option>
    </select>
  );

  const fmtDate = (ts) => { if (!ts) return ""; const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((b) => {
      if (catFilter && (b.category || "") !== catFilter) return false;
      return !s || [b.username, b.reason, b.category, b.createdByName].some((v) => String(v || "").toLowerCase().includes(s));
    });
  }, [items, q, catFilter]);

  async function add() {
    if (!na.username.trim()) { setErr("Nhập username khách hàng"); return; }
    try { await api.post("/api/blacklist", na); setNa((p) => ({ username: "", reason: "", category: p.category })); setErr(""); load(); }
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

  // Xuất username theo chuẩn eBay Blocked buyer list: phân tách bằng dấu phẩy, theo bộ lọc hiện tại (ngành hàng).
  const exportText = useMemo(() => [...new Set(filtered.map((b) => String(b.username || "").trim()).filter(Boolean))].join(", "), [filtered]);
  const copyExport = async () => {
    if (!exportText) return;
    try { await navigator.clipboard.writeText(exportText); }
    catch {
      const ta = document.createElement("textarea"); ta.value = exportText; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>⛔ Danh sách đen</h2>
        <Badge color="red">{items.length} khách</Badge>
        <div className="spacer" />
        <select className="input" style={{ maxWidth: 170 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} title="Lọc theo ngành hàng">
          <option value="">🏷 Tất cả ngành hàng</option>
          {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 240 }} placeholder="🔍 Tìm username / lý do / ngành hàng…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="primary" onClick={() => setShowExport((v) => !v)} title="Xuất username (chuẩn eBay Blocked buyer list) theo bộ lọc hiện tại">📤 Xuất eBay ({filtered.length})</Button>
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Username khách hàng khó — để nhân viên listing kiểm tra trước khi xử lý/ship đơn.
        <div style={{ marginTop: 6 }}>
          🔗 Link block user trên eBay:{" "}
          <a href="https://www.ebay.com/bmgt/BuyerBlock" target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>https://www.ebay.com/bmgt/BuyerBlock</a>
        </div>
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      {showExport && (
        <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "var(--primary)" }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>📤 Xuất username — chuẩn eBay Blocked buyer list</b>
            <Badge color="blue">{exportText ? exportText.split(", ").filter(Boolean).length : 0} username</Badge>
            <span className="muted" style={{ fontSize: 13 }}>({catFilter || "tất cả ngành hàng"})</span>
            <div className="spacer" />
            <Button variant="primary" onClick={copyExport} disabled={!exportText}>{copied ? "✓ Đã copy" : "📋 Copy"}</Button>
            <Button sm onClick={() => setShowExport(false)}>✕</Button>
          </div>
          <textarea className="input" readOnly value={exportText || "(không có username nào khớp bộ lọc)"}
            onFocus={(e) => e.target.select()} rows={4} style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Username cách nhau bằng dấu phẩy. Chọn ngành hàng ở bộ lọc trên rồi Copy → dán vào ô "Blocked buyer list" của eBay.
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="label">Username khách</label>
            <input className="input" style={{ width: 200 }} placeholder="vd: johnnymitch84" value={na.username}
              onChange={(e) => setNa((p) => ({ ...p, username: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div>
            <label className="label">Ngành hàng</label>
            <CatSelect value={na.category} onChange={(v) => setNa((p) => ({ ...p, category: v }))} style={{ width: 170 }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
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
            <th>Username</th><th>Ngành hàng</th><th>Lý do</th><th>Người thêm</th><th>Ngày</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>
                  <input className="input" style={{ padding: "3px 6px", width: 180, fontWeight: 600 }} defaultValue={b.username}
                    onBlur={(e) => save(b, "username", e.target.value)} />
                </td>
                <td>
                  <CatSelect value={b.category} onChange={(v) => save(b, "category", v)} style={{ padding: "3px 6px", width: 150 }} />
                </td>
                <td>
                  <input className="input" style={{ padding: "3px 6px", width: 240 }} defaultValue={b.reason} placeholder="—"
                    onBlur={(e) => save(b, "reason", e.target.value)} />
                </td>
                <td className="muted">{b.createdByName}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(b.createdAt)}</td>
                <td><Button sm variant="danger" onClick={() => remove(b)}>✕</Button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                {items.length ? "Không khớp tìm kiếm." : "Chưa có khách nào trong danh sách đen."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
