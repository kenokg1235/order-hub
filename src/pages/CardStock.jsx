import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";
import { useFormulaBar } from "../useFormulaBar.jsx";
import { useCardDecrypt } from "../useLanKey.js";
import { prepareCardForSave, onLanKeyChange, lanKeyReady } from "../cardKeyLan.js";

// Kho thẻ — thẻ do Admin/người mua nhập sẵn (MÃ HÓA). Copy MÃ giao cho ai thì ghim tên người nhận.
export default function CardStock({ currentUser }) {
  const [stock, setStock] = useState([]);
  const [addText, setAddText] = useState("");
  const [addNote, setAddNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);     // chỉ hiện thẻ chưa giao
  const [cf, setCf] = useState({ card: "", recipient: "", note: "" });
  const setF = (k, v) => setCf((p) => ({ ...p, [k]: v }));

  const { cellProps, Bar, close } = useFormulaBar();
  useEffect(() => onLanKeyChange(() => { if (!lanKeyReady()) close(); }), []);

  async function load() {
    try { setStock((await api.get("/api/card-stock")).cards || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  // Tự cập nhật 15s (bỏ qua khi tab ẩn) để thấy người nhận/thẻ mới từ quản lý khác.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(t);
  }, []);

  const cardCiphers = useMemo(() => stock.map((s) => s.card).filter(Boolean), [stock]);
  const { text: cardText, rev } = useCardDecrypt(cardCiphers);
  const isLockedText = (t) => t === "🔒" || t === "…";
  const cardCellValue = (s) => { const t = cardText(s.card); return isLockedText(t) ? "" : t; };

  async function copyCard(s) {
    const t = String(s.card || "").trim();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopiedId(s.id); setTimeout(() => setCopiedId(""), 1500);
  }

  async function doAdd() {
    const lines = addText.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!lines.length) { setErr("Nhập ít nhất 1 thẻ"); return; }
    setBusy(true); setErr("");
    try {
      const rows = [];
      for (const line of lines) rows.push({ card: await prepareCardForSave(line), note: addNote.trim() });
      const r = await api.post("/api/card-stock", { rows });
      setAddText(""); setAddNote("");
      setErr(`✓ Đã thêm ${r.added} thẻ vào kho.`); setTimeout(() => setErr(""), 2500);
      load();
    } catch (e) {
      if (e.code === "NO_LAN_KEY") setErr("Cần khóa thẻ (ở văn phòng hoặc đã nhập khóa) để nhập số thật — hoặc dán MÃ đã mã hóa.");
      else setErr(e.message);
    } finally { setBusy(false); }
  }

  async function saveStock(id, body) {
    try { const { card } = await api.put(`/api/card-stock/${id}`, body); setStock((p) => p.map((s) => s.id === id ? card : s)); }
    catch (e) {
      if (e.code === "NO_LAN_KEY") setErr("Cần khóa để đổi số thẻ — hoặc dán MÃ đã mã hóa.");
      else setErr(e.message);
    }
  }
  async function saveCard(s, v) {
    const raw = String(v || "").trim();
    if (raw === "" && s.card && isLockedText(cardText(s.card))) return;   // ô khóa để trống → giữ thẻ cũ
    if (raw === cardText(s.card)) return;
    try { saveStock(s.id, { card: await prepareCardForSave(raw) }); }
    catch (e) { if (e.code === "NO_LAN_KEY") setErr("Cần khóa để nhập số thật — hoặc dán MÃ đã mã hóa."); else setErr(e.message); }
  }
  async function remove(s) {
    if (!confirm("Xóa thẻ này khỏi kho?")) return;
    try { await api.del(`/api/card-stock/${s.id}`); setStock((p) => p.filter((x) => x.id !== s.id)); }
    catch (e) { setErr(e.message); }
  }

  const T = (v) => String(v || "").toLowerCase();
  const filtered = useMemo(() => stock.filter((s) => {
    if (onlyFree && (s.recipient || "").trim()) return false;
    if (cf.card && !T(cardText(s.card)).includes(T(cf.card))) return false;
    if (cf.recipient && !T(s.recipient).includes(T(cf.recipient))) return false;
    if (cf.note && !T(s.note).includes(T(cf.note))) return false;
    return true;
  }), [stock, cf, onlyFree, rev]);

  const assigned = stock.filter((s) => (s.recipient || "").trim()).length;
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString("vi", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div style={{ maxWidth: 1100 }}>
      <Bar />
      <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>🗄️ Kho thẻ</h2>
        <Badge color="blue">{stock.length} thẻ</Badge>
        <Badge color="green">✅ Đã giao: {assigned}</Badge>
        <Badge>🟢 Còn trống: {stock.length - assigned}</Badge>
      </div>
      <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        Thẻ trong kho được <b>mã hóa</b> (máy chủ không đọc được). Copy <b>📋 MÃ</b> đưa cho yêu cầu của ai thì điền
        <b> Người nhận</b> để ghim (tự lưu ngày giao).
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Thêm thẻ vào kho — mỗi dòng 1 thẻ (nhập số thật khi có khóa, hoặc dán MÃ đã mã hóa)</label>
        <textarea className="input" rows={3} value={addText} placeholder={"5402...\n4094...\n…"} style={{ resize: "vertical", marginBottom: 8, fontFamily: "monospace" }}
          onChange={(e) => setAddText(e.target.value)} />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" style={{ maxWidth: 320 }} value={addNote} placeholder="Ghi chú chung (bank / số dư…) — tùy chọn"
            onChange={(e) => setAddNote(e.target.value)} />
          <Button variant="primary" disabled={busy} onClick={doAdd}>{busy ? "Đang thêm…" : "＋ Thêm vào kho"}</Button>
        </div>
      </div>

      {err && <div style={{ color: err.startsWith("✓") ? "var(--green)" : "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label className="row" style={{ gap: 5, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Chỉ thẻ chưa giao
        </label>
        {(cf.card || cf.recipient || cf.note) && <Button sm onClick={() => setCf({ card: "", recipient: "", note: "" })}>✕ Xóa lọc</Button>}
      </div>

      {stock.length === 0 && <div className="muted">Kho trống. Thêm thẻ ở trên.</div>}
      {stock.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", width: 230 }}>Thẻ</th>
                <th style={{ textAlign: "left", width: 200 }}>Ghi chú</th>
                <th style={{ textAlign: "left", width: 190 }}>Người nhận</th>
                <th style={{ textAlign: "left", width: 120 }}>Ngày giao</th>
                <th style={{ width: 50 }}></th>
              </tr>
              <tr>
                <th><input className="input" style={{ padding: "3px 5px", width: "100%", fontSize: 12 }} value={cf.card} placeholder="lọc số thẻ" onChange={(e) => setF("card", e.target.value)} /></th>
                <th><input className="input" style={{ padding: "3px 5px", width: "100%", fontSize: 12 }} value={cf.note} placeholder="lọc" onChange={(e) => setF("note", e.target.value)} /></th>
                <th><input className="input" style={{ padding: "3px 5px", width: "100%", fontSize: 12 }} value={cf.recipient} placeholder="lọc tên" onChange={(e) => setF("recipient", e.target.value)} /></th>
                <th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border)", background: (s.recipient || "").trim() ? "#f3faf5" : undefined }}>
                  <td style={{ padding: "6px 4px" }}>
                    <div className="row" style={{ gap: 4 }}>
                      <input key={"sc" + s.id + "|" + cardText(s.card)} className="input" style={{ padding: "5px 8px", width: 150 }}
                        defaultValue={cardCellValue(s)}
                        placeholder={s.card && isLockedText(cardText(s.card)) ? "🔒 đã có — dán MÃ" : "nhập/dán thẻ…"}
                        {...cellProps("Thẻ kho", (v) => saveCard(s, v))} />
                      {s.card && <button className="btn sm" title="Copy MÃ (mã hóa) để giao" onClick={() => copyCard(s)} style={{ whiteSpace: "nowrap" }}>
                        {copiedId === s.id ? "✓" : "📋 MÃ"}
                      </button>}
                    </div>
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    <input key={"sn" + s.id + "|" + (s.note || "")} className="input" style={{ padding: "5px 8px", width: "95%" }}
                      defaultValue={s.note} placeholder="bank / số dư…"
                      onBlur={(e) => { if (e.target.value !== (s.note || "")) saveStock(s.id, { note: e.target.value }); }} />
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    <input key={"sr" + s.id + "|" + (s.recipient || "")} className="input"
                      style={{ padding: "5px 8px", width: "95%", fontWeight: (s.recipient || "").trim() ? 600 : 400 }}
                      defaultValue={s.recipient} placeholder="📌 tên người nhận…"
                      onBlur={(e) => { if (e.target.value !== (s.recipient || "")) saveStock(s.id, { recipient: e.target.value }); }} />
                  </td>
                  <td style={{ padding: "6px 4px", fontSize: 12 }} className="muted">{fmtDate(s.assignedAt)}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <button className="btn sm" title="Xóa khỏi kho" onClick={() => remove(s)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="muted" style={{ marginTop: 10 }}>Không có thẻ khớp bộ lọc.</div>}
        </div>
      )}
    </div>
  );
}
