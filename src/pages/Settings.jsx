import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button } from "../ui.jsx";
import ColorPicker from "../ColorPicker.jsx";
import { lockCards, buildRekeyMap, lanKeyReady, onLanKeyChange } from "../cardKeyLan.js";
import { ORDER_COLUMNS, PROCESS_PICK_COLUMNS, DEFAULT_EXPORT_KEYS } from "../orderColumns.js";

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
      <StatusEditor title="🟢 Trạng thái thẻ HỢP LỆ (vd Live bill / Sai bill — tính số thẻ; chọn 1 sẽ KHÓA, chỉ đổi qua lại trong nhóm này)"
        list={s.cardCountStatuses || []} onSave={(l) => saveList("cardCountStatuses", l)} />
      <StatusEditor title="🔴 Trạng thái thẻ LỖI (không tính số thẻ; không đổi sang được sau khi đã khóa)"
        list={s.cardErrorStatuses || []} onSave={(l) => saveList("cardErrorStatuses", l)} />

      <StatusEditor title="Lý do Cancel đơn (chọn khi đơn 'Đã Cancel')" list={s.cancelReasons || []}
        onSave={(l) => saveList("cancelReasons", l)} />
      <StatusEditor title="Lý do tính Fail (đơn cancel do lỗi NV — dùng cho Fail rate ở Leaderboard)" list={s.failCancelReasons || []}
        onSave={(l) => saveList("failCancelReasons", l)} />

      <CleanupEditor months={s.retentionMonths ?? 2} onSaveMonths={(v) => saveList("retentionMonths", v)} />

      <ExportColumnsEditor cols={s.exportColumns} onSave={(l) => saveList("exportColumns", l)} />

      <LanKeyEditor url={s.lanKeyUrl || ""} onSave={(v) => saveList("lanKeyUrl", v)}
        label={s.cardKeyLabel || "Key"} onSaveLabel={(v) => saveList("cardKeyLabel", v)} />

      <RekeyEditor />

      <StatusColorEditor master={s.masterStatuses} process={s.processStatuses}
        card={[...new Set([...(s.cardStatuses || []), ...(s.cardCountStatuses || []), ...(s.cardErrorStatuses || [])])]}
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

function CleanupEditor({ months, onSaveMonths }) {
  const [n, setN] = useState(months);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [prev, setPrev] = useState(null);   // { cutoff, orders, cardRequests, months }
  const [delOrders, setDelOrders] = useState(true);    // mặc định: dọn đơn (Sheet Tổng + Con)
  const [delCards, setDelCards] = useState(false);     // mặc định: GIỮ dữ liệu thẻ
  useEffect(() => setN(months), [months]);

  async function preview() {
    setMsg("");
    try { setPrev(await api.get("/api/cleanup-old")); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { preview(); /* eslint-disable-next-line */ }, []);

  async function run() {
    setMsg("");
    const p = prev || (await api.get("/api/cleanup-old"));
    setPrev(p);
    if (!delOrders && !delCards) { setMsg("Hãy chọn ít nhất một loại dữ liệu để dọn."); return; }
    const nOrders = delOrders ? p.orders : 0;
    const nCards = delCards ? p.cardRequests : 0;
    if (!nOrders && !nCards) { setMsg(`Không có dữ liệu cũ để dọn (mốc xóa: trước ${p.cutoff}).`); return; }
    const lines = [];
    if (delOrders) lines.push(`• ${p.orders} đơn hàng — Sheet Tổng + Sheet Con (+ thẻ xử lý + lịch sử)`);
    if (delCards) lines.push(`• ${p.cardRequests} yêu cầu thẻ (Mua thẻ)`);
    if (confirm(`Dọn dữ liệu cũ?\n\nSẽ XÓA VĨNH VIỄN dữ liệu các tháng TRƯỚC ${p.cutoff}` +
      (p.months?.length ? ` (${p.months.join(", ")})` : "") + `:\n` + lines.join("\n") + `\n\n` +
      (delOrders && !delCards ? "✅ GIỮ nguyên dữ liệu thẻ (yêu cầu thẻ, số dư).\n" : "") +
      `Giữ lại: payout, chi phí, số dư thẻ.\nKHÔNG thể hoàn tác.`) === false) return;
    try {
      setBusy(true);
      const r = await api.post("/api/cleanup-old", { orders: delOrders, cards: delCards });
      const parts = [];
      if (delOrders) parts.push(`${r.ordersDeleted} đơn`);
      if (delCards) parts.push(`${r.cardRequestsDeleted} yêu cầu thẻ`);
      setMsg(`✅ Đã xóa ${parts.join(" + ")} (trước ${r.cutoff}).`);
      preview();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  const ck = { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" };
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--red)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🧹 Dọn dữ liệu cũ</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Giữ <b>tháng hiện tại + {n} tháng trước</b>; xóa dữ liệu của các tháng cũ hơn.
        <b> Payout, chi phí &amp; số dư thẻ KHÔNG bị xóa.</b> Vd giữ 2: ở tháng 9 sẽ xóa dữ liệu tháng 6 trở về trước.
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <span className="muted">Giữ lại (số tháng trước):</span>
        <input className="input" type="number" min="0" style={{ width: 80 }} value={n} onChange={(e) => setN(e.target.value)} />
        <Button onClick={() => { onSaveMonths(Math.max(0, Number(n) || 0)); setTimeout(preview, 400); }}>Lưu</Button>
      </div>

      <div style={{ fontSize: 13, marginBottom: 8 }}>Chọn loại dữ liệu cần dọn (mốc xóa: <b>trước {prev?.cutoff ?? "…"}</b>):</div>
      <div className="row" style={{ gap: 18, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={ck}>
          <input type="checkbox" checked={delOrders} onChange={(e) => setDelOrders(e.target.checked)} />
          <span>📄 Đơn hàng — <b>Sheet Tổng + Sheet Con</b>{prev ? ` (${prev.orders})` : ""}</span>
        </label>
        <label style={ck}>
          <input type="checkbox" checked={delCards} onChange={(e) => setDelCards(e.target.checked)} />
          <span>💳 Yêu cầu thẻ — <b>Mua thẻ</b>{prev ? ` (${prev.cardRequests})` : ""}</span>
        </label>
      </div>

      <Button variant="danger" disabled={busy} onClick={run}>{busy ? "Đang dọn…" : "🧹 Dọn dữ liệu đã chọn"}</Button>
      {msg && <div style={{ marginTop: 8, fontSize: 13 }} className="muted">{msg}</div>}
    </div>
  );
}

// Chọn cột khi XUẤT CSV. Hub ID + Mã đơn luôn có sẵn (để import lại khớp đúng).
function ExportColumnsEditor({ cols, onSave }) {
  const orderCols = ORDER_COLUMNS.filter((c) => !c.match);   // bỏ Hub ID + Mã đơn (luôn xuất)
  const procCols = PROCESS_PICK_COLUMNS;
  const allKeys = [...orderCols, ...procCols].map((c) => c.key);
  const [sel, setSel] = useState(() => new Set(Array.isArray(cols) && cols.length ? cols : DEFAULT_EXPORT_KEYS));
  const [msg, setMsg] = useState("");
  useEffect(() => { if (Array.isArray(cols) && cols.length) setSel(new Set(cols)); }, [cols]);
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const save = () => { onSave(allKeys.filter((k) => sel.has(k))); setMsg("Đã lưu ✓"); setTimeout(() => setMsg(""), 1500); };
  const group = (list) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
      {list.map((c) => (
        <label key={c.key} className="row" style={{ gap: 5, cursor: "pointer", fontSize: 13, minWidth: 120 }}>
          <input type="checkbox" checked={sel.has(c.key)} onChange={() => toggle(c.key)} /> {c.label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>📤 Cột khi Xuất CSV</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Tích các cột muốn xuất. <b>Hub ID</b> và <b>Mã đơn</b> luôn được thêm đầu file để import lại khớp đúng.
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, margin: "4px 0 6px" }}>Thông tin đơn hàng (Sheet Tổng)</div>
      {group(orderCols)}
      <div style={{ fontWeight: 600, fontSize: 13, margin: "12px 0 6px" }}>Thông tin xử lý (Sheet Con)</div>
      {group(procCols)}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <Button variant="primary" onClick={save}>Lưu</Button>
        {msg && <span className="badge green">{msg}</span>}
      </div>
    </div>
  );
}

// Xoay KHÓA mã hóa thẻ (Admin). Trình duyệt phải đang có KHÓA CŨ; nhập khóa MỚI → giải mã lại toàn bộ.
function RekeyEditor() {
  const [ready, setReady] = useState(lanKeyReady());
  const [k1, setK1] = useState(""), [k2, setK2] = useState("");
  const [gen, setGen] = useState("");        // khóa vừa tạo (hiện rõ để copy & lưu)
  const [copied, setCopied] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => onLanKeyChange(() => setReady(lanKeyReady())), []);

  function generateKey() {
    const b = new Uint8Array(24);
    (window.crypto || crypto).getRandomValues(b);         // ngẫu nhiên mật mã học (192-bit)
    const hex = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
    setK1(hex); setK2(hex); setGen(hex); setCopied(false); setMsg("");
  }
  async function copyGen() {
    try { await navigator.clipboard.writeText(gen); } catch {
      const ta = document.createElement("textarea"); ta.value = gen; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  async function doRekey() {
    setMsg("");
    if (!ready) { setMsg("Cần đang mở khóa (khóa CŨ) ở trình duyệt này trước khi đổi."); return; }
    if (k1.trim().length < 8) { setMsg("Khóa mới quá ngắn."); return; }
    if (k1 !== k2) { setMsg("Hai ô khóa mới không khớp."); return; }
    if (!backedUp) { setMsg("Hãy tích xác nhận đã sao lưu trước."); return; }
    if (!confirm("Đổi khóa mã hóa cho TOÀN BỘ thẻ? Sau đó phải cập nhật keyserver sang khóa MỚI ngay.")) return;
    setBusy(true);
    try {
      const { ciphertexts } = await api.get("/api/cards/ciphertexts");
      setMsg(`Đang mã hóa lại ${ciphertexts.length} giá trị…`);
      const { map, checkToken, failed, total } = await buildRekeyMap(k1.trim(), ciphertexts);
      if (failed > 0 && !confirm(`${failed}/${total} giá trị KHÔNG giải mã được bằng khóa hiện tại (sẽ GIỮ NGUYÊN khóa cũ → sau này hiện 🔒). Vẫn tiếp tục?`)) { setBusy(false); setMsg("Đã hủy."); return; }
      const r = await api.post("/api/cards/rekey", { map, checkToken });
      setDone({ updated: r.updated, failed });
      setK1(""); setK2("");
    } catch (e) {
      setMsg(e.code === "NO_LAN_KEY" ? "Chưa có khóa cũ trong trình duyệt — mở khóa trước." : ("Lỗi: " + e.message));
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--red)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🔑 Đổi khóa mã hóa thẻ (xoay khóa)</div>
      {done ? (
        <div>
          <div className="badge green" style={{ marginBottom: 8 }}>✓ Đã đổi khóa — cập nhật {done.updated} giá trị{done.failed ? ` (bỏ qua ${done.failed})` : ""}</div>
          <ol style={{ margin: "6px 0 0 18px", fontSize: 13, lineHeight: 1.6 }}>
            <li><b>Ngay bây giờ:</b> cập nhật <b>keyserver dùng KHÓA MỚI</b> và khởi động lại (đóng cửa sổ keyserver, chạy lại rồi nhập khóa mới).</li>
            <li>Mọi phiên đã bị khóa — mỗi máy <b>tải lại trang</b> để nạp khóa mới (hoặc người từ xa nhập lại khóa mới).</li>
            <li>Lưu <b>khóa mới</b> vào password manager; khóa cũ có thể bỏ.</li>
          </ol>
        </div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Giải mã toàn bộ thẻ bằng khóa CŨ (đang mở ở máy này) rồi mã hóa lại bằng khóa MỚI — dữ liệu cũ vẫn đọc được.
            {ready ? <b style={{ color: "var(--green)" }}> ✓ Đang có khóa cũ.</b> : <b style={{ color: "var(--red)" }}> ✗ Chưa có khóa — hãy mở khóa thẻ ở máy này trước.</b>}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <input className="input" type="password" autoComplete="off" style={{ maxWidth: 240 }} value={k1} placeholder="Khóa MỚI" onChange={(e) => { setK1(e.target.value); setGen(""); }} />
            <input className="input" type="password" autoComplete="off" style={{ maxWidth: 240 }} value={k2} placeholder="Nhập lại khóa MỚI" onChange={(e) => { setK2(e.target.value); setGen(""); }} />
            <Button onClick={generateKey} title="Tạo khóa ngẫu nhiên mạnh (192-bit)">🎲 Tạo khóa ngẫu nhiên</Button>
          </div>
          {gen && (
            <div style={{ background: "#fff6e6", border: "1px solid #e0a300", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: "#9a6b00", marginBottom: 4, fontSize: 13 }}>⚠️ LƯU KHÓA NÀY NGAY — mất khóa = mất toàn bộ thẻ:</div>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: 14, wordBreak: "break-all", background: "#fff", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }}>{gen}</code>
                <Button sm variant="primary" onClick={copyGen}>{copied ? "✓ Đã copy" : "📋 Copy"}</Button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Dán vào password manager + dùng chuỗi này để chạy keyserver sau khi đổi.</div>
            </div>
          )}
          <label className="row" style={{ gap: 6, cursor: "pointer", fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} />
            Tôi đã sao lưu dữ liệu (kéo file backup .age về máy) trước khi đổi.
          </label>
          <Button variant="danger" disabled={busy || !ready} onClick={doRekey}>{busy ? "Đang đổi khóa…" : "🔑 Đổi khóa ngay"}</Button>
          {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith("Lỗi") || msg.startsWith("Cần") ? "var(--red)" : "var(--muted)" }}>{msg}</div>}
        </>
      )}
    </div>
  );
}

function LanKeyEditor({ url, onSave, label, onSaveLabel }) {
  const [v, setV] = useState(url);
  const [msg, setMsg] = useState("");
  const [lbl, setLbl] = useState(label);
  const [lblMsg, setLblMsg] = useState("");
  const [lockMsg, setLockMsg] = useState("");
  useEffect(() => setV(url), [url]);
  useEffect(() => setLbl(label), [label]);
  async function test() {
    setMsg("Đang kiểm tra…");
    try {
      const base = String(v || "").replace(/\/+$/, "");
      const r = await fetch(base + "/ping", { cache: "no-store" });
      setMsg((await r.text()).trim() === "ok" ? "✅ Kết nối được dịch vụ khóa LAN (bạn đang ở văn phòng)." : "⚠️ Phản hồi lạ — kiểm tra lại địa chỉ.");
    } catch { setMsg("❌ Không kết nối được (không ở LAN, dịch vụ chưa chạy, hoặc chưa cài chứng chỉ CA)."); }
  }
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--primary)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🔐 Dịch vụ khóa thẻ (LAN)</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Địa chỉ dịch vụ khóa chạy trên máy Admin trong văn phòng. Trình duyệt lấy khóa từ đây để
        <b> xem/cấp số thẻ thật</b>. Ngoài LAN (hoặc dịch vụ tắt) → thẻ hiện <b>🔒</b>, chỉ dán được mã.
        Vd: <code>https://192.168.100.44:8443</code>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="input" style={{ flex: 1, minWidth: 260 }} value={v} placeholder="https://192.168.x.x:8443"
          onChange={(e) => setV(e.target.value)} />
        <Button onClick={test}>Kiểm tra</Button>
        <Button variant="primary" onClick={() => { onSave(String(v || "").trim()); setMsg("Đã lưu ✓ (tải lại trang để áp dụng)"); }}>Lưu</Button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13 }} className="muted">{msg}</div>}

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Nhãn ô nhập khóa (làm từ xa)</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Chữ hiển thị cạnh ô nhập khóa cho người làm từ xa. Để ngắn gọn, kín đáo (mặc định “Key”).
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" style={{ maxWidth: 200 }} value={lbl} placeholder="Key"
            onChange={(e) => setLbl(e.target.value)} />
          <Button variant="primary" onClick={() => { onSaveLabel(String(lbl || "").trim() || "Key"); setLblMsg("Đã lưu ✓ (tải lại trang để áp dụng)"); }}>Lưu</Button>
        </div>
        {lblMsg && <div style={{ marginTop: 8, fontSize: 13 }} className="muted">{lblMsg}</div>}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Ẩn thẻ mọi nơi ngay (kill-switch)</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Khóa thẻ trên <b>mọi phiên đang mở</b> (văn phòng và từ xa) trong vài giây — dùng khi tắt key/rời chỗ.
          Mọi máy sẽ hiện 🔒; muốn xem lại phải tải trang (văn phòng) hoặc nhập lại khóa (từ xa).
        </div>
        <Button variant="danger" onClick={async () => {
          if (!confirm("Ẩn thẻ trên TẤT CẢ phiên đang mở ngay?")) return;
          lockCards();
          try { await api.post("/api/cards/lock-now", {}); setLockMsg("✓ Đã phát tín hiệu — mọi phiên sẽ khóa trong ~10s."); }
          catch (e) { setLockMsg("Lỗi: " + e.message); }
        }}>🔒 Ẩn thẻ mọi nơi ngay</Button>
        {lockMsg && <div style={{ marginTop: 8, fontSize: 13 }} className="muted">{lockMsg}</div>}
      </div>
    </div>
  );
}

const PALETTE = ["#e6f7ec", "#fdeaea", "#e8f0fe", "#fef3e2", "#e6f7f4", "#f1e9fb",
  "#fde8f0", "#fef9e0", "#eef1f4", "#e3f6fb", "#eef7e0", "#fff3cd"];

function StatusColorEditor({ master, process, card, colors, onSave }) {
  const [map, setMap] = useState(colors);
  const [pickerFor, setPickerFor] = useState(null);   // which status' inline picker is open
  useEffect(() => setMap(colors), [colors]);
  const masterList = master || [], processList = process || [], cardList = card || [];
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
        Áp dụng cho Sheet Tổng và Sheet Con. Nhóm <b>thẻ</b> dùng để tô màu hàng ở <b>Mua thẻ</b>. Bấm <b>🎨 Tùy chỉnh</b> để mở bảng màu ghim sẵn.
      </div>
      {masterList.map((n) => renderRow(n, "tổng"))}
      {processList.map((n) => renderRow(n, "xử lý"))}
      {cardList.map((n) => renderRow(n, "thẻ"))}
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
