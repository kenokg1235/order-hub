// Shared UI primitives — small, reusable, keeps page files short.
import React from "react";

export function Button({ variant = "", sm, children, ...p }) {
  return <button className={`btn ${variant} ${sm ? "sm" : ""}`} {...p}>{children}</button>;
}

export function Input({ label, ...p }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <input className="input" {...p} />
    </div>
  );
}

export function Select({ label, options = [], ...p }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <select className="input" {...p}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  );
}

export function Badge({ color = "", children }) {
  return <span className={`badge ${color}`}>{children}</span>;
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="spacer" />
          <Button sm onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
