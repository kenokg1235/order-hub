import { useEffect, useState } from "react";
import { onLanKeyChange, warmDecrypt, cardText, lanKeyReady } from "./cardKeyLan.js";

// Hook hiển thị thẻ: tự re-render khi khóa/giải mã đổi, tự giải mã trước danh sách ciphertext.
// Trả { text, ready }: text(ciphertext) → số thật (có khóa) / 🔒 (không khóa) / "…" (đang giải).
export function useCardDecrypt(values) {
  const [, force] = useState(0);
  useEffect(() => onLanKeyChange(() => force((n) => n + 1)), []);
  const dep = Array.isArray(values) ? values.filter(Boolean).join("|") : "";
  const ready = lanKeyReady();
  // Giải mã lại khi danh sách đổi HOẶC khi khóa vừa nạp xong (khóa về sau dữ liệu).
  useEffect(() => { if (dep && ready) warmDecrypt(dep.split("|")); }, [dep, ready]);
  return { text: cardText, ready };
}
