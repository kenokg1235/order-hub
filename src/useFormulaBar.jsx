import React, { useRef, useState } from "react";

// Google-Sheets-style "formula bar": shows the FULL content of the cell currently
// being edited in a roomy box at the top, and lets you edit it there too.
// Read-only cells (read-back) can also be shown via viewCell() — display + copy, no save.
// Usage: const { cellProps, Bar, viewCell } = useFormulaBar();
//   <Bar />                                            // render once at top
//   <input {...cellProps("Label", (v)=>save(v))} defaultValue={x} />
//   <div onClick={() => viewCell("Tracking", value)}>…</div>   // read-only show
export function useFormulaBar() {
  const [bar, setBar] = useState({ active: false, label: "", value: "", readonly: false });
  const [copied, setCopied] = useState(false);
  const focusedEl = useRef(null);
  const commitRef = useRef(null);

  const cellProps = (label, commit) => ({
    onFocus: (e) => { focusedEl.current = e.target; commitRef.current = commit; setBar({ active: true, label, value: e.target.value, readonly: false }); },
    onInput: (e) => { if (focusedEl.current === e.target) setBar((b) => ({ ...b, value: e.target.value })); },
    onBlur: (e) => commit(e.target.value),
  });

  // Hiển thị nội dung 1 ô (read-only) lên thanh trên để xem đầy đủ + copy.
  const viewCell = (label, value) => { focusedEl.current = null; commitRef.current = null; setCopied(false); setBar({ active: true, label, value: String(value ?? ""), readonly: true }); };

  const save = () => { if (focusedEl.current) focusedEl.current.value = bar.value; commitRef.current && commitRef.current(bar.value); };
  const close = () => setBar({ active: false, label: "", value: "", readonly: false });
  const copy = async () => {
    try { await navigator.clipboard.writeText(bar.value); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = bar.value; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const Bar = () => !bar.active ? null : (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff",
      border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", marginBottom: 10,
      display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <span className={"badge " + (bar.readonly ? "" : "blue")} style={{ whiteSpace: "nowrap", marginTop: 5 }}>
        {bar.readonly ? "👁️" : "✏️"} {bar.label || "Ô"}
      </span>
      <textarea value={bar.value} readOnly={bar.readonly} placeholder="Nội dung ô đang chọn…"
        rows={Math.min(8, Math.max(1, String(bar.value).split("\n").length))}
        onFocus={(e) => { if (bar.readonly) e.target.select(); }}
        onChange={(e) => { if (bar.readonly) return; setBar((b) => ({ ...b, value: e.target.value })); if (focusedEl.current) focusedEl.current.value = e.target.value; }}
        onKeyDown={(e) => { if (!bar.readonly && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
        className="input" style={{ flex: 1, resize: "vertical", lineHeight: 1.5 }} />
      {bar.readonly ? (
        <>
          <button className="btn primary" onClick={copy} title="Copy toàn bộ">{copied ? "✓ Đã copy" : "📋 Copy"}</button>
          <button className="btn" onClick={close} title="Đóng">✕</button>
        </>
      ) : (
        <button className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={save} title="Lưu (Ctrl+Enter)">Lưu</button>
      )}
    </div>
  );

  return { cellProps, Bar, viewCell };
}
