import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Badge } from "../ui.jsx";

// AfterShip status tag → Vietnamese label + colour
const TAG = {
  Pending: { l: "Chờ", c: "" },
  InfoReceived: { l: "Đã nhận TT", c: "blue" },
  InTransit: { l: "Đang vận chuyển", c: "blue" },
  OutForDelivery: { l: "Đang giao", c: "amber" },
  AttemptFail: { l: "Giao hụt", c: "amber" },
  Delivered: { l: "Đã giao", c: "green" },
  Exception: { l: "Sự cố", c: "red" },
  Expired: { l: "Hết hạn", c: "red" },
};

export default function Tracking() {
  const [items, setItems] = useState([]);
  const [aftership, setAftership] = useState(false);
  const [quota, setQuota] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try { const d = await api.get("/api/tracking"); setItems(d.items); setAftership(d.aftership); setQuota(d.quota); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true); setErr("");
    try { await api.post("/api/tracking/refresh", {}); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => [i.trackingNumber, i.store, i.orderId, i.orderNumber].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [items, q]);

  const counts = useMemo(() => {
    const m = {}; for (const i of items) { const t = i.tag || "—"; m[t] = (m[t] || 0) + 1; } return m;
  }, [items]);
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString("vi") : "—");

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>🚚 Tracking</h2>
        <Badge color="blue">{filtered.length} mã</Badge>
        {quota && quota.keys > 0 && <Badge color={quota.used >= quota.limit ? "red" : "amber"}>Quota: {quota.used}/{quota.limit} ({quota.keys} key)</Badge>}
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 200 }} placeholder="🔍 Tìm tracking / store…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="primary" disabled={busy || !aftership} onClick={refresh}>{busy ? "Đang cập nhật…" : "🔄 Cập nhật"}</Button>
      </div>

      {!aftership && (
        <div className="card" style={{ marginBottom: 12, background: "var(--amber-bg)", border: "1px solid var(--amber)" }}>
          ⚠️ AfterShip chưa bật. Admin vào <b>Cấu hình → Tracking — AfterShip</b> nhập API key để tự lấy trạng thái.
          (Tạm thời bấm “tra cứu ↗” để xem thủ công.)
        </div>
      )}
      {err && <div style={{ color: "var(--red)", marginBottom: 10 }}>{err}</div>}

      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {Object.entries(counts).map(([t, n]) => (
          <span key={t} className={`badge ${TAG[t]?.c || ""}`}>{(TAG[t]?.l) || (t === "—" ? "Chưa check" : t)}: {n}</span>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead><tr>
            <th>Tracking number</th><th>Store</th><th>ID Order</th><th>Order#</th><th>Trạng thái</th><th>Cập nhật</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((i, idx) => {
              const tg = TAG[i.tag] || { l: i.tag || "Chưa check", c: "" };
              return (
                <tr key={i.trackingNumber + "_" + idx}>
                  <td style={{ fontWeight: 600 }}>{i.trackingNumber}</td>
                  <td>{i.store}</td>
                  <td>{i.orderId}</td>
                  <td>{i.orderNumber}</td>
                  <td>
                    <Badge color={tg.c}>{tg.l}</Badge>
                    {i.message && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{i.message}</div>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{fmt(i.checkedAt)}</td>
                  <td><a href={`https://t.17track.net/en#nums=${encodeURIComponent(i.trackingNumber)}`} target="_blank" rel="noreferrer">tra cứu ↗</a></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Chưa có tracking nào từ đơn “Đã Up”.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
