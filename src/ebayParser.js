// Parse an eBay "OrdersReport" CSV (the exact export the user provided).
// The file has: a leading blank line, a quoted header row, an empty values row,
// data rows, a blank line, then footer rows ("N record(s) downloaded", "Seller ID…").
// We locate the header by the "Order Number" column and map only what we need.

function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");   // bỏ BOM (Excel UTF-8)
  const rows = []; let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Chuẩn hóa Unicode (NFC) để so khớp tiêu đề ổn định — dấu tiếng Việt gõ trong Google Sheets
// có thể ở dạng tổ hợp (NFD) khác với chuỗi trong code, nếu không normalize sẽ so KHÔNG khớp.
const norm = (s) => String(s || "").normalize("NFC").trim().toLowerCase();

// Đơn nhiều sản phẩm: eBay tách 1 dòng "tổng" (có địa chỉ, KHÔNG sản phẩm) + các dòng sản phẩm
// (KHÔNG địa chỉ). → chép địa chỉ/SĐT/thời hạn sang dòng sản phẩm, bỏ dòng tổng trống.
function mergeMultiItem(rows) {
  const by = {};
  for (const r of rows) (by[r.orderNumber] || (by[r.orderNumber] = [])).push(r);
  const out = [];
  for (const group of Object.values(by)) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const pick = (f) => (group.find((g) => String(g[f] || "").trim()) || {})[f] || "";
    const addr = pick("address"), phone = pick("custPhone"), deadline = pick("deadline");
    const products = group.filter((g) => String(g.product || "").trim() || g.itemNumber);
    const keep = products.length ? products : group;   // không tách được thì giữ nguyên
    for (const it of keep)
      out.push({ ...it, address: it.address || addr, custPhone: it.custPhone || phone, deadline: it.deadline || deadline });
  }
  return out;
}

// Chuyển ngày eBay (vd "Jun-24-2026", "06/24/2026", "2026-06-24") → "DD/MM".
function toDDMM(s) {
  s = String(s || "").trim();
  if (!s) return "";
  const d = new Date(s.replace(/-/g, " ").replace(/,/g, " "));   // tên tháng hoặc MM/DD/YYYY (US)
  if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);            // MM/DD/YYYY
  if (m) return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                   // YYYY-MM-DD
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}`;
  return "";
}

export function parseEbayCsv(text) {
  const rows = parseCSV(text);
  // Find the header row (contains "Order Number").
  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "order number"));
  if (hIdx < 0) throw new Error("Không nhận ra file eBay OrdersReport (thiếu cột 'Order Number').");
  const header = rows[hIdx].map(norm);
  const col = (name) => header.indexOf(norm(name));

  const ci = {
    order: col("Order Number"),
    shipName: col("Ship To Name"), shipPhone: col("Ship To Phone"),
    addr1: col("Ship To Address 1"), addr2: col("Ship To Address 2"),
    city: col("Ship To City"), state: col("Ship To State"),
    zip: col("Ship To Zip"), country: col("Ship To Country"),
    itemNo: col("Item Number"), title: col("Item Title"),
    qty: col("Quantity"), variation: col("Variation Details"),
    email: col("Buyer Email"), total: col("Total Price"), saleDate: col("Sale Date"),
  };
  // Cột "Ship By Date" — tên có thể khác nhau giữa các bản eBay, dò linh hoạt.
  let shipByIdx = [col("Ship By Date"), col("Ship By"), col("Shipping Date"), col("Date To Ship By")].find((i) => i >= 0);
  if (shipByIdx == null) shipByIdx = header.findIndex((h) => h.includes("ship by"));
  const get = (row, idx) => (idx >= 0 ? (row[idx] || "").trim() : "");

  const out = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const id = get(row, ci.order);
    // Skip the empty row + footer rows ("N record(s) downloaded", "Seller ID …").
    // A real eBay order number always contains a digit.
    if (!id || !/\d/.test(id) || /record\(s\)|downloaded|seller id/i.test(id)) continue;
    const addressParts = [
      get(row, ci.shipName),
      get(row, ci.addr1),
      get(row, ci.addr2),
      [get(row, ci.city), [get(row, ci.state), get(row, ci.zip)].filter(Boolean).join(" ")]
        .filter(Boolean).join(", "),
      get(row, ci.country),
    ].filter(Boolean);
    const itemNo = get(row, ci.itemNo);
    out.push({
      id,
      orderNumber: id,          // eBay order number (nhiều dòng có thể chung)
      itemNumber: itemNo,       // eBay item number (phân biệt sản phẩm trong cùng đơn)
      product: get(row, ci.title),
      qty: get(row, ci.qty),
      custPhone: get(row, ci.shipPhone),
      address: addressParts.join("\n"),
      link: itemNo ? `https://www.ebay.com/itm/${itemNo}` : "",
      size: get(row, ci.variation),           // eBay variation → Size/Variation cell
      color: "",
      deadline: toDDMM(get(row, shipByIdx)),   // ngày ship-by của eBay → Thời hạn (DD/MM)
      raw: {
        itemNumber: itemNo, buyerEmail: get(row, ci.email),
        total: get(row, ci.total), saleDate: get(row, ci.saleDate),
      },
    });
  }
  const merged = mergeMultiItem(out);
  return { rows: merged, count: merged.length };
}

// Mã đơn: "14-15124-99674" (3 nhóm), "m19178308392" (eBay chữ+số), "27-15112-15902"…
// Nhận diện linh hoạt để dò cột mã đơn theo DỮ LIỆU (kể cả khi cột không/khó đặt tiêu đề).
const looksLikeOrderCode = (v) => {
  const s = String(v || "").trim();
  if (!s) return false;
  if (/^[A-Za-z0-9]{1,4}-\d{3,7}-\d{3,8}$/.test(s)) return true;   // dạng 3 nhóm có gạch
  if (/^[A-Za-z]{1,3}\d{8,}$/.test(s)) return true;                // dạng eBay: m + nhiều số
  return false;
};
// Suy tên sản phẩm dễ đọc từ link (khi sheet không có cột "Sản phẩm").
// vd .../p/brooks-mens-ghost-17-running-shoe/602592 → "Brooks Mens Ghost 17 Running Shoe".
function productFromLink(link) {
  const u = String(link || "").trim();
  if (!u || /ebay\.com\/itm\//i.test(u)) return "";   // link eBay dạng itm/số → không có slug
  const path = u.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  let best = "";
  for (const seg of path.split("/")) {
    const alpha = (seg.match(/[a-zA-Z]/g) || []).length;
    if (alpha >= 4 && alpha > (best.match(/[a-zA-Z]/g) || []).length) best = seg;
  }
  if (!best) return "";
  return best.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
}
// Dò cột theo DỮ LIỆU khi không tìm được theo tiêu đề (chọn cột có nhiều ô khớp nhất).
function detectColumn(rows, hIdx, test) {
  const nCol = rows.slice(hIdx + 1, hIdx + 30).reduce((m, r) => Math.max(m, r.length), 0);
  let best = -1, bestCount = 0;
  for (let c = 0; c < nCol; c++) {
    let cnt = 0;
    for (let r = hIdx + 1; r < Math.min(rows.length, hIdx + 60); r++) if (test(rows[r][c])) cnt++;
    if (cnt > bestCount) { bestCount = cnt; best = c; }
  }
  return bestCount > 0 ? best : -1;
}
const detectIdColumn = (rows, hIdx) => detectColumn(rows, hIdx, looksLikeOrderCode);
// Cột link = cột có nhiều ô là URL http(s) nhất (tên tiêu đề tùy ý).
const detectLinkColumn = (rows, hIdx) => detectColumn(rows, hIdx, (v) => /^\s*https?:\/\//i.test(String(v || "")));

// Parse mẫu nhập CHUẨN của OrderHub (người dùng tự điền) HOẶC sheet Google tự tạo (cột tiếng Việt).
// Tự dò cột mã đơn theo dữ liệu nếu tiêu đề trống. Địa chỉ gộp từ các cột địa chỉ (hoặc 1 ô địa chỉ gộp sẵn).
export function parseOrderHubCsv(text) {
  const rows = parseCSV(text);
  // Nhận diện hàng tiêu đề: quét các keyword đặc trưng ở HÀNG 1 (tên cột linh hoạt).
  const HEAD_MARKERS = ["id order", "order number", "order", "mã đơn", "ma don", "địa chỉ", "address", "add", "variation", "size", "link", "hạn", "hạn ship", "seller note"];
  const hasMarker = (r) => r.some((c) => { const n = norm(c); return n && HEAD_MARKERS.some((m) => n === m || n.includes(m)); });
  let hIdx = rows.findIndex(hasMarker);
  if (hIdx < 0) hIdx = 0;   // không rõ tiêu đề → coi hàng đầu là tiêu đề
  const header = rows[hIdx].map(norm);
  // Khớp tiêu đề theo keyword: ưu tiên KHỚP CHÍNH XÁC, sau đó CHỨA keyword (>=3 ký tự) — để quét
  // các tên cột viết tắt như "Order", "Add", "Hạn Ship", "Seller Note", "sl", "link", "size".
  const usedCols = new Set();
  const find = (...names) => {
    for (const n of names) { const i = header.indexOf(norm(n)); if (i >= 0 && !usedCols.has(i)) { usedCols.add(i); return i; } }
    for (const n of names) { const nk = norm(n); if (nk.length >= 3) { const i = header.findIndex((h, j) => !usedCols.has(j) && h.includes(nk)); if (i >= 0) { usedCols.add(i); return i; } } }
    return -1;
  };
  const ci = {
    id: find("ID Order", "Order Number", "Mã đơn", "Ma don"),   // "Order" đơn lẻ dễ trùng cột khác → dò theo dữ liệu bên dưới
    name: find("Người nhận", "Tên người nhận", "Ship To Name", "Ten"),
    addr: find("Địa chỉ", "Địa chỉ ship", "Dia chi ship", "Address", "Dia chi", "Add"),
    city: find("Thành phố", "City", "Thanh pho"),
    state: find("Bang", "State", "Tỉnh"),
    zip: find("Zip", "Zip code", "Mã zip"),
    country: find("Quốc gia", "Country", "Quoc gia"),
    phone: find("SĐT", "Điện thoại", "Phone", "SDT"),
    qty: find("SL", "Số lượng", "Quantity", "So luong"),
    product: find("Sản phẩm", "Product", "Item Title", "San pham", "SKU"),
    link: find("Link", "Link sản phẩm", "Đường link", "Duong link", "Link sp", "URL", "link1", "Link1", "Product link"),
    size: find("Size", "Variation", "Size/Variation"),
    color: find("Màu", "Color", "Mau"),
    profit: find("Profit", "Lợi nhuận", "Loi nhuan"),
    deadline: find("Thời hạn", "Deadline", "Ship By", "Hạn Ship", "Hạn", "Han"),
    note: find("Ghi chú", "Seller Note", "Note", "Note tổng", "Ghi chu"),
    itemNo: find("Item Number", "eBay Item Number", "Item No"),
  };
  if (ci.id < 0) ci.id = detectIdColumn(rows, hIdx);       // tiêu đề trống → dò theo dữ liệu
  // Link: nếu cột theo tiêu đề rỗng/không phải URL → dò cột thật sự chứa URL (tên cột tùy ý).
  const colHasUrl = (c) => c >= 0 && rows.slice(hIdx + 1, hIdx + 60).some((r) => /^\s*https?:\/\//i.test(String(r[c] || "")));
  if (!colHasUrl(ci.link)) { const d = detectLinkColumn(rows, hIdx); if (d >= 0) ci.link = d; }
  if (ci.id < 0) throw new Error("Không tìm ra cột mã đơn — thêm tiêu đề 'ID Order' cho cột mã đơn.");
  const get = (row, idx) => (idx >= 0 ? (row[idx] || "").trim() : "");
  const dl = (v) => (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(v) ? v.replace(/\s/g, "") : (toDDMM(v) || v));
  const out = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const id = get(row, ci.id);
    if (!id || !/\d/.test(id) || /record\(s\)|downloaded|seller id/i.test(id)) continue;
    const addressParts = [
      get(row, ci.name), get(row, ci.addr),
      [get(row, ci.city), [get(row, ci.state), get(row, ci.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      get(row, ci.country),
    ].filter(Boolean);
    const itemNo = get(row, ci.itemNo);
    const rawProduct = get(row, ci.product);
    const productIsUrl = /^\s*https?:\/\//i.test(rawProduct);   // cột "Sản phẩm" chứa link
    const link = get(row, ci.link) || (productIsUrl ? rawProduct : "") || (itemNo ? `https://www.ebay.com/itm/${itemNo}` : "");
    // Tên sản phẩm: nếu cột SP là URL → suy tên đẹp từ URL; nếu trống → suy từ link.
    const product = productIsUrl ? productFromLink(rawProduct) : (rawProduct || productFromLink(link));
    out.push({
      id, orderNumber: id, itemNumber: itemNo,
      product,
      qty: get(row, ci.qty), custPhone: get(row, ci.phone),
      address: addressParts.join("\n"),
      link,
      size: get(row, ci.size), color: get(row, ci.color),
      profit: get(row, ci.profit), deadline: dl(get(row, ci.deadline)),
      masterNote: get(row, ci.note),
      raw: { itemNumber: itemNo },
    });
  }
  const merged = mergeMultiItem(out);
  return { rows: merged, count: merged.length };
}
