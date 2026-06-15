import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button } from "../ui.jsx";
import ColorPicker from "../ColorPicker.jsx";

// Admin-configurable status lists + Telegram. The status lists drive dropdowns
// across the order & card sheets (master status, process status, card status).
export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");

  async function load() { setS((await api.get("/api/settings")).settings); }
  useEffect(() => { load(); }, []);

  if (!s) return <div className="muted">Đang tải…</div>;

  async function saveList(key, list) {
    await api.put(`/api/settings/${key}`, { value: list });
    setMsg("Đã lưu ✓"); setTimeout(() => setMsg(""), 1500); load();
  }
  async function saveTelegram(tg) {
    await api.put("/api/settings/telegram", { value: tg });
    setMsg("Đã lưu ✓"); setTimeout(() => setMsg(""), 1500); load();
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Cấu hình</h2>
        <div className="spacer" />
        {msg && <span className="badge green">{msg}</span>}
      </div>

      <StatusEditor title="Trạng thái đơn hàng (tổng — Admin)" list={s.masterStatuses}
        onSave={(l) => saveList("masterStatuses", l)} />
      <StatusEditor title="Trạng thái xử lý (sheet con — nhân viên)" list={s.processStatuses}
        onSave={(l) => saveList("processStatuses", l)} />
      <StatusEditor title="Trạng thái thẻ (Sheet Mua thẻ)" list={s.cardStatuses}
        onSave={(l) => saveList("cardStatuses", l)} />

      <StatusEditor title="Lý do Cancel đơn (chọn khi đơn 'Đã Cancel')" list={s.cancelReasons || []}
        onSave={(l) => saveList("cancelReasons", l)} />
      <StatusEditor title="Lý do tính Fail (đơn cancel do lỗi NV — dùng cho Fail rate ở Leaderboard)" list={s.failCancelReasons || []}
        onSave={(l) => saveList("failCancelReasons", l)} />

      <StatusColorEditor master={s.masterStatuses} process={s.processStatuses}
        colors={s.statusColors || {}} onSave={(m) => saveList("statusColors", m)} />

      <TelegramEditor tg={s.telegram} onSave={saveTelegram} />

      <AfterShipEditor cfg={s.aftership || { apiKey: "", enabled: false }} onSave={(v) => saveList("aftership", v)} />
    </div>
  );
}

function StatusEditor({ title, list, onSave }) {
  const [items, setItems] = useState(list);
  const [val, setVal] = useState("");
  useEffect(() => setItems(list), [list]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        {items.map((it, i) => (
          <span key={i} className="badge" style={{ gap: 6 }}>
            {it}
            <span style={{ cursor: "pointer", color: "var(--red)" }}
              onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</span>
          </span>
        ))}
        {items.length === 0 && <span className="muted">Chưa có trạng thái nào</span>}
      </div>
      <div className="row">
        <input className="input" style={{ maxWidth: 240 }} value={val} placeholder="Thêm trạng thái…"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { setItems([...items, val.trim()]); setVal(""); } }} />
        <Button onClick={() => { if (val.trim()) { setItems([...items, val.trim()]); setVal(""); } }}>＋ Thêm</Button>
        <div className="spacer" />
        <Button variant="primary" onClick={() => onSave(items)}>Lưu danh sách</Button>
      </div>
    </div>
  );
}

const PALETTE = ["#e6f7ec", "#fdeaea", "#e8f0fe", "#fef3e2", "#e6f7f4", "#f1e9fb",
  "#fde8f0", "#fef9e0", "#eef1f4", "#e3f6fb", "#eef7e0", "#fff3cd"];

function StatusColorEditor({ master, process, colors, onSave }) {
  const [map, setMap] = useState(colors);
  const [pickerFor, setPickerFor] = useState(null);   // which status' inline picker is open
  useEffect(() => setMap(colors), [colors]);
  const masterList = master || [], processList = process || [];
  const set = (name, color) => setMap((m) => ({ ...m, [name]: color }));
  const clear = (name) => setMap((m) => { const n = { ...m }; delete n[name]; return n; });

  // Plain render function (NOT a nested component) so the inline ColorPicker keeps
  // its drag state across re-renders instead of remounting on every color change.
  const renderRow = (name, tag) => (
    <div key={tag + name} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 150, display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`badge ${tag === "tổng" ? "blue" : ""}`} style={{ fontSize: 10 }}>{tag}</span>{name}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {PALETTE.map((c) => (
            <div key={c} onClick={() => set(name, c)} title={c}
              style={{ width: 24, height: 24, borderRadius: 5, background: c, cursor: "pointer",
                border: map[name] === c ? "2px solid var(--primary)" : "1px solid var(--border)",
                boxShadow: map[name] === c ? "0 0 0 2px var(--primary-bg)" : "none" }} />
          ))}
        </div>
        <Button sm onClick={() => setPickerFor(pickerFor === name ? null : name)}>
          🎨 {pickerFor === name ? "Đóng" : "Tùy chỉnh"}
        </Button>
        {map[name] && <Button sm onClick={() => clear(name)}>Bỏ màu</Button>}
      </div>
      {pickerFor === name && (
        <div style={{ marginTop: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 10,
          background: "var(--bg)", display: "inline-block" }}>
          <ColorPicker value={map[name] || "#ffffff"} onChange={(hex) => set(name, hex)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Màu nền dòng theo trạng thái</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Ưu tiên màu của <b>trạng thái tổng</b>; nếu đơn chưa có trạng thái tổng thì dùng màu <b>trạng thái xử lý</b>.
        Áp dụng cho cả Sheet Tổng và Sheet Con. Bấm <b>🎨 Tùy chỉnh</b> để mở bảng màu ghim sẵn.
      </div>
      {masterList.map((n) => renderRow(n, "tổng"))}
      {processList.map((n) => renderRow(n, "xử lý"))}
      <div style={{ marginTop: 10 }}><Button variant="primary" onClick={() => onSave(map)}>Lưu màu</Button></div>
    </div>
  );
}

function AfterShipEditor({ cfg, onSave }) {
  const [enabled, setEnabled] = useState(false);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState("");
  useEffect(() => {
    const c = cfg || {};
    setEnabled(!!c.enabled);
    setKeys(Array.isArray(c.keys) ? c.keys : (c.apiKey ? [c.apiKey] : []));
  }, [cfg]);
  const addKey = () => { const k = newKey.trim(); if (k && !keys.includes(k)) setKeys([...keys, k]); setNewKey(""); };
  const mask = (k) => (k.length > 12 ? k.slice(0, 6) + "…" + k.slice(-4) : k);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Tracking — AfterShip (đa key)</div>
      <label className="row" style={{ gap: 6, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Bật theo dõi tracking
      </label>
      <div className="label">API Keys — {keys.length} key (≈ {keys.length * 50} track/tháng)</div>
      <div style={{ margin: "6px 0 8px" }}>
        {keys.map((k, i) => (
          <div key={i} className="row" style={{ gap: 6, marginBottom: 4 }}>
            <span className="badge">{i + 1}</span>
            <code style={{ flex: 1, fontSize: 12, background: "#eef1f4", padding: "3px 6px", borderRadius: 4 }}>{mask(k)}</code>
            <Button sm variant="danger" onClick={() => setKeys(keys.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ))}
        {keys.length === 0 && <span className="muted">Chưa có key nào</span>}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" style={{ flex: 1 }} value={newKey} placeholder="Dán AfterShip API key…"
          onChange={(e) => setNewKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addKey(); }} />
        <Button onClick={addKey}>＋ Thêm key</Button>
      </div>
      <Button variant="primary" onClick={() => onSave({ enabled, keys })}>Lưu AfterShip</Button>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Mỗi key (tài khoản free) ≈ 50 track/tháng — hệ thống tự chia track cho key còn quota, tự cập nhật mỗi 3 giờ.
        ⚠️ Dùng nhiều tài khoản free có thể vi phạm điều khoản AfterShip (rủi ro khóa acc).
      </div>
    </div>
  );
}

function TelegramEditor({ tg, onSave }) {
  const [f, setF] = useState(tg);
  useEffect(() => setF(tg), [tg]);
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Thông báo Telegram</div>
      <label className="row" style={{ gap: 6, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        Bật gửi Telegram
      </label>
      <div className="field">
        <label className="label">Bot Token</label>
        <input className="input" value={f.botToken} placeholder="123456:ABC-…"
          onChange={(e) => setF({ ...f, botToken: e.target.value })} />
      </div>
      <Button variant="primary" onClick={() => onSave(f)}>Lưu Telegram</Button>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        (Mỗi user sẽ liên kết Chat ID riêng ở giai đoạn Thông báo.)
      </div>
    </div>
  );
}
