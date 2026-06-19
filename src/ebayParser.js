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

const norm = (s) => String(s || "").trim().toLowerCase();

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
  return { rows: out, count: out.length };
}

// Parse mẫu nhập CHUẨN của OrderHub (người dùng tự điền). Cột tiếng Việt thân thiện.
// Bắt buộc có cột "ID Order". Địa chỉ gộp từ: Người nhận + Địa chỉ + (Thành phố, Bang Zip) + Quốc gia.
export function parseOrderHubCsv(text) {
  const rows = parseCSV(text);
  const hIdx = rows.findIndex((r) => r.some((c) => ["id order", "order number", "mã đơn", "ma don"].includes(norm(c))));
  if (hIdx < 0) throw new Error("Mẫu OrderHub: thiếu cột 'ID Order'.");
  const header = rows[hIdx].map(norm);
  const find = (...names) => { for (const n of names) { const i = header.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
  const ci = {
    id: find("ID Order", "Order Number", "Mã đơn"),
    name: find("Người nhận", "Tên người nhận", "Ship To Name", "Ten"),
    addr: find("Địa chỉ", "Address", "Dia chi"),
    city: find("Thành phố", "City", "Thanh pho"),
    state: find("Bang", "State", "Tỉnh"),
    zip: find("Zip", "Zip code", "Mã zip"),
    country: find("Quốc gia", "Country", "Quoc gia"),
    phone: find("SĐT", "Điện thoại", "Phone", "SDT"),
    qty: find("SL", "Số lượng", "Quantity", "So luong"),
    product: find("Sản phẩm", "Product", "Item Title", "San pham"),
    link: find("Link", "Link sản phẩm", "URL"),
    size: find("Size", "Variation", "Size/Variation"),
    color: find("Màu", "Color", "Mau"),
    profit: find("Profit", "Lợi nhuận", "Loi nhuan"),
    deadline: find("Thời hạn", "Deadline", "Ship By", "Han"),
    note: find("Ghi chú", "Note", "Note tổng", "Ghi chu"),
    itemNo: find("Item Number", "eBay Item Number", "Item No"),
  };
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
    out.push({
      id, orderNumber: id, itemNumber: itemNo,
      product: get(row, ci.product), qty: get(row, ci.qty), custPhone: get(row, ci.phone),
      address: addressParts.join("\n"),
      link: get(row, ci.link) || (itemNo ? `https://www.ebay.com/itm/${itemNo}` : ""),
      size: get(row, ci.size), color: get(row, ci.color),
      profit: get(row, ci.profit), deadline: dl(get(row, ci.deadline)),
      masterNote: get(row, ci.note),
      raw: { itemNumber: itemNo },
    });
  }
  return { rows: out, count: out.length };
}
