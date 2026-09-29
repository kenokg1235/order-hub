import React, { useEffect, useRef, useState } from "react";

// Google-Sheets-style "formula bar": shows the FULL content of the cell currently
// being edited in a roomy box at the top, and lets you edit it there too.
// Read-only cells (read-back) can also be shown via viewCell() — display + copy, no save.
//
// QUAN TRỌNG (hiệu năng): trạng thái thanh công thức nằm trong 1 STORE riêng (ngoài React state
// của trang), chỉ <Bar/> đăng ký lắng nghe. Nhờ vậy gõ phím trong ô KHÔNG re-render cả bảng
// (hàng trăm ô) — trước đây setState ở trang khiến toàn bộ Sheet Con vẽ lại mỗi ký tự → treo.
//
// Usage: const { cellProps, Bar, viewCell } = useFormulaBar();
//   <Bar />                                            // render once at top
//   <input {...cellProps("Label", (v)=>save(v))} defaultValue={x} />
//   <div onClick={() => viewCell("Tracking", value)}>…</div>   // read-only show
export function useFormulaBar() {
  const ref = useRef(null);
  if (!ref.current) {
    const listeners = new Set();
    let state = { active: false, label: "", value: "", readonly: false };
    const store = {
      focusedEl: { current: null },
      commitRef: { current: null },
      get: () => state,
      set: (partial) => { state = { ...state, ...partial }; listeners.forEach((l) => l()); },
      subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    };

    const cellProps = (label, commit) => ({
      onFocus: (e) => { store.focusedEl.current = e.target; store.commitRef.current = commit; store.set({ active: true, label, value: e.target.value, readonly: false }); },
      onInput: (e) => { if (store.focusedEl.current === e.target) store.set({ value: e.target.value }); },
      onBlur: (e) => commit(e.target.value),
    });

    // Hiển thị nội dung 1 ô (read-only) lên thanh trên để xem đầy đủ + copy.
    const viewCell = (label, value) => { store.focusedEl.current = null; store.commitRef.current = null; store.set({ active: true, label, value: String(value ?? ""), readonly: true }); };

    // Thành phần thanh công thức — CHỈ nó re-render khi store đổi (đăng ký qua subscribe).
    function Bar() {
      const [, force] = useState(0);
      const [copied, setCopied] = useState(false);
      useEffect(() => store.subscribe(() => force((x) => x + 1)), []);
      const bar = store.get();
      if (!bar.active) return null;

      const save = () => { if (store.focusedEl.current) store.focusedEl.current.value = bar.value; store.commitRef.current && store.commitRef.current(bar.value); };
      const close = () => store.set({ active: false, label: "", value: "", readonly: false });
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

      return (
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff",
          border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", marginBottom: 10,
          display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <span className={"badge " + (bar.readonly ? "" : "blue")} style={{ whiteSpace: "nowrap", marginTop: 5 }}>
            {bar.readonly ? "👁️" : "✏️"} {bar.label || "Ô"}
          </span>
          <textarea value={bar.value} readOnly={bar.readonly} placeholder="Nội dung ô đang chọn…"
            rows={Math.min(8, Math.max(1, String(bar.value).split("\n").length))}
            onFocus={(e) => { if (bar.readonly) e.target.select(); }}
            onChange={(e) => { if (bar.readonly) return; store.set({ value: e.target.value }); if (store.focusedEl.current) store.focusedEl.current.value = e.target.value; }}
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
    }

    ref.current = { cellProps, viewCell, Bar };
  }
  return ref.current;
}
