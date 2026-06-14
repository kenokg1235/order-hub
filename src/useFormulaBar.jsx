import React, { useRef, useState } from "react";

// Google-Sheets-style "formula bar": shows the FULL content of the cell currently
// being edited in a roomy box at the top, and lets you edit it there too.
// Usage: const { cellProps, Bar } = useFormulaBar();
//   <Bar />                                            // render once at top
//   <input {...cellProps("Label", (v)=>save(v))} defaultValue={x} />
export function useFormulaBar() {
  const [bar, setBar] = useState({ active: false, label: "", value: "" });
  const focusedEl = useRef(null);
  const commitRef = useRef(null);

  const cellProps = (label, commit) => ({
    onFocus: (e) => { focusedEl.current = e.target; commitRef.current = commit; setBar({ active: true, label, value: e.target.value }); },
    onInput: (e) => { if (focusedEl.current === e.target) setBar((b) => ({ ...b, value: e.target.value })); },
    onBlur: (e) => commit(e.target.value),
  });

  const save = () => { if (focusedEl.current) focusedEl.current.value = bar.value; commitRef.current && commitRef.current(bar.value); };

  const Bar = () => !bar.active ? null : (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff",
      border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", marginBottom: 10,
      display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
      <span className="badge blue" style={{ whiteSpace: "nowrap", marginTop: 5 }}>✏️ {bar.label || "Ô"}</span>
      <textarea value={bar.value} placeholder="Nội dung ô đang chọn…"
        rows={Math.min(8, Math.max(1, String(bar.value).split("\n").length))}
        onChange={(e) => { setBar((b) => ({ ...b, value: e.target.value })); if (focusedEl.current) focusedEl.current.value = e.target.value; }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
        className="input" style={{ flex: 1, resize: "vertical", lineHeight: 1.5 }} />
      <button className="btn primary" onMouseDown={(e) => e.preventDefault()} onClick={save} title="Lưu (Ctrl+Enter)">Lưu</button>
    </div>
  );

  return { cellProps, Bar };
}
