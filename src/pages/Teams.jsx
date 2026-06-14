import React, { useState } from "react";
import { api } from "../api.js";
import { Button, Modal } from "../ui.jsx";

export default function Teams({ teams, reloadTeams }) {
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");

  async function save(name, id) {
    setErr("");
    try {
      if (id) await api.put(`/api/teams/${id}`, { name });
      else await api.post("/api/teams", { name });
      setEditing(null); reloadTeams();
    } catch (e) { setErr(e.message); }
  }
  async function remove(id) {
    if (!confirm("Xóa team này? (đơn đã chia cho team sẽ cần chia lại)")) return;
    try { await api.del(`/api/teams/${id}`); reloadTeams(); } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Teams</h2>
        <div className="spacer" />
        <Button variant="primary" onClick={() => setEditing({ name: "" })}>＋ Thêm team</Button>
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="row" style={{ flexWrap: "wrap", alignItems: "stretch" }}>
        {teams.map((t) => (
          <div key={t.id} className="card" style={{ width: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{t.id}</div>
            <div className="row">
              <Button sm onClick={() => setEditing(t)}>Sửa tên</Button>
              <Button sm variant="danger" onClick={() => remove(t.id)}>Xóa</Button>
            </div>
          </div>
        ))}
      </div>

      {editing && <TeamModal team={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function TeamModal({ team, onClose, onSave }) {
  const [name, setName] = useState(team.name || "");
  return (
    <Modal title={team.id ? "Sửa team" : "Thêm team"} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" onClick={() => onSave(name, team.id)}>Lưu</Button>
      </>}>
      <div className="field">
        <label className="label">Tên team</label>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
    </Modal>
  );
}
