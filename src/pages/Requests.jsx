import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// Sheet Yêu cầu thẻ — each employee sees only their own requests + the card issued back.
export default function Requests({ currentUser }) {
  const isAdmin = currentUser.role === "Admin";
  const [reqs, setReqs] = useState([]);
  const [cardStatuses, setCardStatuses] = useState([]);
  const [newContent, setNewContent] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try {
      setReqs((await api.get("/api/card-requests")).requests);
      setCardStatuses((await api.get("/api/settings")).settings.cardStatuses || []);
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
              {r.card ? <Badge color="green" >{r.card}</Badge> : <span className="muted">Chưa cấp</span>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">Trạng thái:</span>
              <select className="input" style={{ padding: "5px 8px", maxWidth: 170 }} value={r.status}
                onChange={(e) => update(r.id, { status: e.target.value })}>
                <option value="">— trống —</option>
                {cardStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
