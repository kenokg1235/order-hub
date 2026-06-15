import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Input, Select, Badge, Modal } from "../ui.jsx";

const ROLES = ["Admin", "Leader", "Lister", "Member", "Buyer"];
const roleColor = { Admin: "blue", Leader: "amber", Lister: "green", Member: "", Buyer: "blue" };
const roleLabel = { Admin: "Admin", Leader: "Leader", Lister: "Listing", Member: "Member", Buyer: "Mua thẻ" };

export default function Users({ teams }) {
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setUsers((await api.get("/api/users")).users);
      setStores((await api.get("/api/stores")).stores);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || id;

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Người dùng & Phân quyền</h2>
        <div className="spacer" />
        <Button variant="primary" onClick={() => setEditing({ role: "Member", teamIds: [], storeNames: [], canBuyCard: false })}>
          ＋ Thêm người dùng
        </Button>
      </div>
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="tbl">
          <thead><tr>
            <th>Tên</th><th>Email</th><th>Vai trò</th><th>Team</th><th>Store</th><th>Mua thẻ</th><th>Trạng thái</th><th></th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td><Badge color={roleColor[u.role]}>{roleLabel[u.role] || u.role}</Badge></td>
                <td>{u.teamIds.map(teamName).join(", ") || <span className="muted">—</span>}</td>
                <td style={{ fontSize: 12 }}>{u.storeNames.join(", ") || <span className="muted">—</span>}</td>
                <td>{u.canBuyCard ? <Badge color="green">Có</Badge> : <span className="muted">—</span>}</td>
                <td>{u.active ? <Badge color="green">Hoạt động</Badge> : <Badge color="red">Khóa</Badge>}</td>
                <td><Button sm onClick={() => setEditing(u)}>Sửa</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserModal user={editing} teams={teams} stores={stores} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function UserModal({ user, teams, stores, onClose, onSaved }) {
  const isNew = !user.id;
  const [f, setF] = useState({
    name: user.name || "", email: user.email || "", password: "",
    role: user.role || "Member", teamIds: user.teamIds || [], storeNames: user.storeNames || [],
    mutedTeams: user.mutedTeams || [],
    canBuyCard: !!user.canBuyCard, active: user.active !== false,
  });
  const [newStore, setNewStore] = useState("");
  const [err, setErr] = useState("");
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleTeam = (id) =>
    up("teamIds", f.teamIds.includes(id) ? f.teamIds.filter((x) => x !== id) : [...f.teamIds, id]);
  const toggleStore = (s) =>
    up("storeNames", f.storeNames.includes(s) ? f.storeNames.filter((x) => x !== s) : [...f.storeNames, s]);
  const toggleMute = (id) =>
    up("mutedTeams", f.mutedTeams.includes(id) ? f.mutedTeams.filter((x) => x !== id) : [...f.mutedTeams, id]);
  const addStore = () => {
    const s = newStore.trim();
    if (s && !f.storeNames.includes(s)) up("storeNames", [...f.storeNames, s]);
    setNewStore("");
  };

  async function save() {
    setErr("");
    try {
      if (isNew) await api.post("/api/users", f);
      else await api.put(`/api/users/${user.id}`, f);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  async function remove() {
    if (!confirm("Xóa người dùng này?")) return;
    try { await api.del(`/api/users/${user.id}`); onSaved(); } catch (e) { setErr(e.message); }
  }

  const storeOptions = [...new Set([...stores, ...f.storeNames])];

  return (
    <Modal title={isNew ? "Thêm người dùng" : "Sửa người dùng"} onClose={onClose}
      footer={<>
        {!isNew && user.id !== "u-admin" && <Button variant="danger" onClick={remove}>Xóa</Button>}
        <div className="spacer" />
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" onClick={save}>Lưu</Button>
      </>}>
      <Input label="Họ tên" value={f.name} onChange={(e) => up("name", e.target.value)} />
      {isNew && <Input label="Email" type="email" value={f.email} onChange={(e) => up("email", e.target.value)} />}
      <Input label={isNew ? "Mật khẩu" : "Mật khẩu mới (để trống nếu giữ nguyên)"} type="password"
        value={f.password} onChange={(e) => up("password", e.target.value)} />
      <Select label="Vai trò" value={f.role} onChange={(e) => up("role", e.target.value)}
        options={ROLES.map((r) => ({ value: r, label: roleLabel[r] }))} />

      {/* Lister → store scope; Leader/Member → team scope */}
      {f.role === "Lister" ? (
        <div className="field">
          <label className="label">Store được cấp (lister chỉ thấy đơn của các store này)</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {storeOptions.map((s) => (
              <label key={s} className="row" style={{ gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={f.storeNames.includes(s)} onChange={() => toggleStore(s)} /> {s}
              </label>
            ))}
            {storeOptions.length === 0 && <span className="muted">Chưa có store — gõ thêm bên dưới</span>}
          </div>
          <div className="row">
            <input className="input" style={{ maxWidth: 220 }} value={newStore} placeholder="Thêm store mới…"
              onChange={(e) => setNewStore(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addStore(); }} />
            <Button onClick={addStore}>＋</Button>
          </div>
        </div>
      ) : (
        <div className="field">
          <label className="label">Team</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {teams.map((t) => (
              <label key={t.id} className="row" style={{ gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={f.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} /> {t.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {f.role === "Buyer" && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          🎴 Chức vụ <b>Mua thẻ</b> chỉ thấy 2 mục: <b>Yêu cầu thẻ</b> + <b>Mua thẻ</b> (đã có sẵn quyền cấp thẻ). Nhớ gán <b>team</b> để thấy yêu cầu của team đó.
        </div>
      )}
      <div className="row" style={{ gap: 18, marginTop: 6 }}>
        {f.role !== "Buyer" && (
          <label className="row" style={{ gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={f.canBuyCard} onChange={(e) => up("canBuyCard", e.target.checked)} />
            🎴 Quyền Mua thẻ
          </label>
        )}
        <label className="row" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.active} onChange={(e) => up("active", e.target.checked)} />
          Hoạt động
        </label>
      </div>

      {/* Admin: mute card/overdue notifications from chosen teams */}
      {f.role === "Admin" && teams.length > 0 && (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">🔕 Tắt thông báo từ team</label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Tích team nào thì Admin này sẽ KHÔNG nhận thông báo (yêu cầu thẻ, đổi trạng thái thẻ, quá hạn) của team đó.
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {teams.map((t) => (
              <label key={t.id} className="row" style={{ gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={f.mutedTeams.includes(t.id)} onChange={() => toggleMute(t.id)} /> {t.name}
              </label>
            ))}
          </div>
        </div>
      )}
      {err && <div style={{ color: "var(--red)", marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}
