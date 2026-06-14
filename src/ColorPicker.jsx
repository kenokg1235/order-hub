import React, { useEffect, useRef, useState } from "react";

// Inline (pinned) color picker — SV gradient square + hue slider + hex.
// Stays open until the caller closes it (unlike the native <input type=color>).

function hexToRgb(hex) {
  const m = (hex || "#ffffff").replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx === 0 ? 0 : d / mx, mx];
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export default function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(value)));
  const lastEmit = useRef(value);
  // Re-sync only when the value changes from OUTSIDE (not from our own emit).
  useEffect(() => {
    if (value && value.toLowerCase() !== String(lastEmit.current || "").toLowerCase()) {
      setHsv(rgbToHsv(...hexToRgb(value)));
      lastEmit.current = value;
    }
  }, [value]);

  const [h, s, v] = hsv;
  const emit = (nh, ns, nv) => {
    setHsv([nh, ns, nv]);
    const hex = rgbToHex(...hsvToRgb(nh, ns, nv));
    lastEmit.current = hex;
    onChange(hex);
  };

  const svRef = useRef();
  const dragging = useRef(false);
  const onSV = (e) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
    emit(h, x, 1 - y);
  };
  useEffect(() => {
    const move = (e) => { if (dragging.current) onSV(e); };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });

  const hueColor = rgbToHex(...hsvToRgb(h, 1, 1));
  const curHex = rgbToHex(...hsvToRgb(h, s, v));

  return (
    <div style={{ width: 240 }}>
      <div ref={svRef} onMouseDown={(e) => { dragging.current = true; onSV(e); }}
        style={{ position: "relative", width: 240, height: 150, borderRadius: 8, cursor: "crosshair",
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}>
        <div style={{ position: "absolute", left: `${s * 100}%`, top: `${(1 - v) * 100}%`,
          width: 14, height: 14, transform: "translate(-50%,-50%)", borderRadius: "50%",
          border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.4)", background: curHex }} />
      </div>
      <input type="range" className="hue-slider" min={0} max={360} value={Math.round(h)}
        onChange={(e) => emit(Number(e.target.value), s, v)} style={{ width: 240, marginTop: 12 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", background: curHex }} />
        <input className="input" style={{ width: 120 }} value={curHex}
          onChange={(e) => {
            const x = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(x)) { setHsv(rgbToHsv(...hexToRgb(x))); lastEmit.current = x; onChange(x); }
          }} />
      </div>
    </div>
  );
}
