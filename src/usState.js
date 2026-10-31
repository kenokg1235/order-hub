// Lấy mã bang Mỹ (2 chữ) từ địa chỉ dạng "Warner Robins, GA 31088-2515". Không rõ → "".
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "VI", "GU", "AS", "MP", "AA", "AE", "AP",
]);

export function stateOf(address) {
  // Lấy cặp "bang + zip" CUỐI CÙNG (số nhà/tên đường phía trước có thể trùng dạng này).
  const hits = [...String(address || "").matchAll(/\b([A-Za-z]{2})[\s,]+\d{5}(?:-\d{4})?\b/g)];
  for (let i = hits.length - 1; i >= 0; i--) {
    const s = hits[i][1].toUpperCase();
    if (US_STATES.has(s)) return s;
  }
  return "";
}

// So sánh 2 đơn theo bang. Đơn không rõ bang luôn nằm cuối, dù sắp xếp chiều nào.
export function compareState(a, b, dir) {
  const sa = stateOf(a.address), sb = stateOf(b.address);
  if (!sa || !sb) return sa ? -1 : sb ? 1 : 0;
  return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
}
