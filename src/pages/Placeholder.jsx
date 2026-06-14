import React from "react";

// Temporary page for features arriving in later phases.
export default function Placeholder({ title, phase, desc }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>🚧</div>
      <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
      <div className="muted" style={{ marginBottom: 10 }}>{desc}</div>
      <span className="badge blue">Sẽ có ở {phase}</span>
    </div>
  );
}
