import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Sheet Yêu cầu thẻ — each employee sees only their own requests + the card issued back.
export default function Requests({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [reqs, setReqs] = useState([]);
  const [cardStatuses, setCardStatuses] = useState([]);
  const [lockStatuses, setLockStatuses] = useState([]);   // thẻ hợp lệ
  const [errorStatuses, setErrorStatuses] = useState([]); // thẻ lỗi
  const isLocked = (st) => !isAdmin && lockStatuses.map((s) => s.toLowerCase()).includes(String(st || "").toLowerCase());
  const otherStatuses = cardStatuses.filter((s) => ![...lockStatuses, ...errorStatuses].map((x) => x.toLowerCase()).includes(s.toLowerCase()));
  const [newContent, setNewContent] = useState("");
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");

  async function copyCard(card) {
    const t = String(card || "").trim();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    }
    setCopied(t); setTimeout(() => setCopied(""), 1500);
  }

  async function load() {
    try {
      setReqs((await api.get("/api/card-requests")).requests);
      const s = (await api.get("/api/settings")).settings;
      setCardStatuses(s.cardStatuses || []);
      setLockStatuses(s.cardCountStatuses || []);
      setErrorStatuses(s.cardErrorStatuses || []);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newContent.trim()) return;
    try { await api.post("/api/card-requests", { content: newContent.trim() }); setNewContent(""); load(); }
    catch (e) { setErr(e.message); }
  }
  async function update(id, body) {
    try { const { request } = await api.put(`/api/card-requests/${id}`, body); setReqs((p) => p.map((r) => r.id === id ? request : r)); }
    catch (e) { setErr(e.message); }
  }
  async function remove(id) {
    if (!confirm("Xóa yêu cầu này?")) return;
    try { await api.del(`/api/card-requests/${id}`); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 4px" }}>Yêu cầu thẻ</h2>
      <div className="muted" style={{ marginBottom: 14 }}>Gửi yêu cầu thẻ — người mua sẽ cấp thẻ về đây. Bạn chỉ thấy yêu cầu của chính mình.</div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Tạo yêu cầu mới</label>
        <textarea className="input" rows={2} value={newContent} placeholder="Mô tả thẻ bạn cần (tự do)…"
          onChange={(e) => setNewContent(e.target.value)} style={{ resize: "vertical", marginBottom: 8 }} />
        <Button variant="primary" onClick={create}>＋ Gửi yêu cầu</Button>
      </div>

      {reqs.length === 0 && <div className="muted">Chưa có yêu cầu nào.</div>}
      {reqs.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>Yêu cầu</b>
            <span className="badge blue">{r.code}</span>
            <span className="muted" style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleString("vi")}</span>
            <div className="spacer" />
            {r.card && !isAdmin
              ? <span className="badge green" title="Đã cấp thẻ — giữ lại để đối chiếu">🔒 Đã lưu</span>
              : <Button sm variant="danger" onClick={() => remove(r.id)}>Xóa</Button>}
          </div>
          <textarea className="input" rows={2} defaultValue={r.content} style={{ resize: "vertical", marginBottom: 10 }}
            onBlur={(e) => { if (e.target.value !== r.content) update(r.id, { content: e.target.value }); }} />
          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">Thẻ được cấp:</span>
              {r.card ? <>
                <Badge color="green">{r.card}</Badge>
                <button className="btn sm" onClick={() => copyCard(r.card)} title="Copy thẻ để dán vào Sheet Con">
                  {copied === String(r.card).trim() ? "✓ Đã copy" : "📋 Copy"}
                </button>
              </> : <span className="muted">Chưa cấp</span>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">Trạng thái:</span>
              <select className="input" style={{ padding: "5px 8px", maxWidth: 170 }} value={r.status}
                title={isLocked(r.status) ? "Đã chốt bill — chỉ đổi giữa Live/Sai bill (Admin mới đổi khác)" : ""}
                onChange={(e) => update(r.id, { status: e.target.value })}>
                {isLocked(r.status) ? (
                  lockStatuses.map((s) => <option key={s} value={s}>{s}</option>)
                ) : (<>
                  <option value="">— trống —</option>
                  {lockStatuses.length > 0 && <optgroup label="🟢 Thẻ hợp lệ">{lockStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                  {errorStatuses.length > 0 && <optgroup label="🔴 Thẻ lỗi">{errorStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                  {otherStatuses.length > 0 && <optgroup label="Khác">{otherStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                </>)}
              </select>
              {isLocked(r.status) && <span title="Đã chốt bill">🔒</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
