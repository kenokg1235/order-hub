import React, { useState } from "react";
import { api, setToken } from "../api.js";
import { Button } from "../ui.jsx";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const { token, user } = await api.post("/api/auth/login", { email, password });
      setToken(token);
      onLogin(user);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form className="card" onSubmit={submit} style={{ width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>Order Hub</div>
          <div className="muted" style={{ fontSize: 13 }}>Quản lý & phân phối đơn hàng</div>
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" type="email" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)} placeholder="admin@orderhub.local" />
        </div>
        <div className="field">
          <label className="label">Mật khẩu</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {err && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <Button variant="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 14 }}>
          Mặc định: admin@orderhub.local / admin123
        </div>
      </form>
    </div>
  );
}
