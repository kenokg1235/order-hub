import React, { useEffect, useRef, useState } from "react";

// Multi-value column filter (Google-Sheets style): tick several values at once.
// value = array of selected option values ([] = no filter / all). onChange(array).
export default function MultiFilter({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = value || [];
  const toggle = (v) => onChange(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  const label = sel.length === 0 ? "Tất cả"
    : sel.length === 1 ? (options.find((o) => o.v === sel[0])?.l || sel[0])
    : `${sel.length} mục`;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button className="input" onClick={() => setOpen((o) => !o)}
        style={{ padding: "3px 6px", fontSize: 12, minWidth: 72, maxWidth: 130, cursor: "pointer", textAlign: "left",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          background: sel.length ? "var(--primary-bg)" : "#fff", color: sel.length ? "var(--primary-d)" : "inherit" }}>
        {label} ▾
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 60, background: "#fff",
          border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,.2)",
          minWidth: 160, maxHeight: 260, overflow: "auto", padding: 6 }}>
          <div style={{ display: "flex", gap: 6, padding: "2px 4px 6px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            <button className="btn sm" onClick={() => onChange(options.map((o) => o.v))}>Tất cả</button>
            <button className="btn sm" onClick={() => onChange([])}>Bỏ chọn</button>
          </div>
          {options.length === 0 && <div className="muted" style={{ padding: 6, fontSize: 12 }}>—</div>}
          {options.map((o) => (
            <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 4px", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={sel.includes(o.v)} onChange={() => toggle(o.v)} /> {o.l}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
