import React, { useEffect, useRef, useState } from "react";

// Phóng lớn ảnh khi rê chuột — KHÔNG re-render cả bảng theo từng pixel chuột.
// Trước đây onMouseMove gọi setState ở trang → mỗi lần di chuột trên ảnh vẽ lại toàn bộ Sheet
// (hàng trăm ô) → treo. Nay vị trí ảnh phóng được cập nhật TRỰC TIẾP qua ref, chỉ hiện/ẩn mới re-render.
//
// Usage: const { previewProps, PreviewLayer } = useImagePreview();
//   <img {...previewProps(url)} />
//   <PreviewLayer />   // render once ở cuối trang
export function useImagePreview() {
  const ref = useRef(null);
  if (!ref.current) {
    const listeners = new Set();
    let state = { url: "", x: 0, y: 0 };
    const notify = () => listeners.forEach((l) => l());
    const show = (url, x, y) => { state = { url, x, y }; notify(); };
    const hide = () => { if (state.url) { state = { url: "", x: 0, y: 0 }; notify(); } };

    // Gắn vào <img>: hiện khi vào, ẩn khi rời. KHÔNG gắn onMouseMove ở đây (tránh setState liên tục).
    const previewProps = (url) => ({
      onMouseEnter: (e) => url && show(url, e.clientX, e.clientY),
      onMouseLeave: hide,
    });

    const SIZE = 460, PAD = 20;
    const place = (el, x, y) => {
      if (!el) return;
      let nx = x + PAD, ny = y + PAD;
      if (nx + SIZE > window.innerWidth) nx = x - SIZE - PAD;
      if (ny + SIZE > window.innerHeight) ny = Math.max(0, window.innerHeight - SIZE - PAD);
      el.style.left = Math.max(0, nx) + "px"; el.style.top = Math.max(0, ny) + "px";
    };

    function PreviewLayer() {
      const [, force] = useState(0);
      const boxRef = useRef(null);
      useEffect(() => {
        const l = () => force((x) => x + 1);
        listeners.add(l);
        return () => listeners.delete(l);
      }, []);
      const u = state.url;
      useEffect(() => {
        if (!u) return;
        place(boxRef.current, state.x, state.y);                 // đặt ngay vị trí lúc rê vào
        const move = (e) => place(boxRef.current, e.clientX, e.clientY);  // di chuột → cập nhật qua ref, KHÔNG re-render
        window.addEventListener("mousemove", move);
        return () => window.removeEventListener("mousemove", move);
      }, [u]);
      if (!u) return null;
      return (
        <div ref={boxRef} style={{ position: "fixed", left: state.x, top: state.y, zIndex: 1000, pointerEvents: "none",
          background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,.25)", padding: 4 }}>
          <img src={u} alt="" style={{ width: SIZE, height: SIZE, objectFit: "contain", display: "block" }} />
        </div>
      );
    }

    ref.current = { previewProps, PreviewLayer };
  }
  return ref.current;
}
