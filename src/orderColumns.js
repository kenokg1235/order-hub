// Danh mục CỘT đơn (Sheet Tổng) dùng chung cho XUẤT CSV và IMPORT cập nhật.
//  - get(o): lấy giá trị từ object order (orderOut) để xuất.
//  - field: tên cột trong DB (server dùng để cập nhật).
//  - match: cột dùng để KHỚP đơn khi import (Hub ID / Mã đơn) — không bị cập nhật.
//  - updatable=false: chỉ xuất, không cho import ghi đè.
//  - aliases: tên tiêu đề khác chấp nhận khi import (ngoài label/key).
export const ORDER_COLUMNS = [
  { key: "hubId",        label: "Hub ID",       field: "id",            get: (o) => o.id,           match: true,  updatable: false, aliases: ["hubid", "id"] },
  { key: "orderNo",      label: "Mã đơn",       field: "order_no",      get: (o) => o.orderNo,      match: true,  updatable: false, aliases: ["ma don", "id order", "order number", "order", "mã order", "ma order"] },
  { key: "store",        label: "Store",        field: "store",         get: (o) => o.store },
  { key: "address",      label: "Địa chỉ",      field: "address",       get: (o) => o.address,      aliases: ["dia chi", "address"] },
  { key: "custPhone",    label: "SĐT",          field: "cust_phone",    get: (o) => o.custPhone,    aliases: ["sdt", "phone", "điện thoại", "dien thoai"] },
  { key: "qty",          label: "SL",           field: "qty",           get: (o) => o.qty,          aliases: ["so luong", "số lượng", "quantity", "qty"] },
  { key: "product",      label: "Sản phẩm",     field: "product",       get: (o) => o.product,      aliases: ["san pham", "product", "item title"] },
  { key: "link",         label: "Link",         field: "link",          get: (o) => o.link,         aliases: ["url", "link sp"] },
  { key: "size",         label: "Size",         field: "size",          get: (o) => o.size,         aliases: ["variation"] },
  { key: "color",        label: "Màu",          field: "color",         get: (o) => o.color,        aliases: ["mau", "color"] },
  { key: "profit",       label: "Profit",       field: "profit",        get: (o) => o.profit,       type: "number", aliases: ["loi nhuan", "lợi nhuận"] },
  { key: "deadline",     label: "Thời hạn",     field: "deadline",      get: (o) => o.deadline,     aliases: ["han", "hạn", "deadline", "ship by", "hạn ship"] },
  { key: "masterStatus", label: "Trạng thái",   field: "master_status", get: (o) => o.masterStatus, aliases: ["trang thai", "status", "trạng thái tổng"] },
  { key: "masterNote",   label: "Ghi chú tổng", field: "master_note",   get: (o) => o.masterNote,   aliases: ["ghi chu", "note tổng", "seller note"] },
  { key: "cancelReason", label: "Lý do hủy",    field: "cancel_reason", get: (o) => o.cancelReason, aliases: ["ly do huy", "cancel reason"] },
  { key: "staffNote",    label: "Note NV",      field: "staff_note",    get: (o) => o.staffNote,    aliases: ["note nhan vien", "staff note"] },
  { key: "urgentNote",   label: "Note gấp",     field: "urgent_note",   get: (o) => o.urgentNote,   aliases: ["note gap", "urgent note"] },
  { key: "note1",        label: "Note 1",       field: "note1",         get: (o) => o.note1 },
  { key: "note2",        label: "Note 2",       field: "note2",         get: (o) => o.note2 },
  { key: "note3",        label: "Note 3",       field: "note3",         get: (o) => o.note3 },
  { key: "note4",        label: "Note 4",       field: "note4",         get: (o) => o.note4 },
  { key: "image",        label: "Ảnh",          field: "image",         get: (o) => o.image,        aliases: ["anh", "image"] },
];

export const COL_BY_KEY = Object.fromEntries(ORDER_COLUMNS.map((c) => [c.key, c]));
// Cột mặc định khi chưa cấu hình (ngoài Hub ID + Mã đơn luôn có).
export const DEFAULT_EXPORT_KEYS = ["store", "product", "size", "color", "qty", "address", "custPhone", "deadline", "profit", "masterStatus", "masterNote"];

const norm = (s) => String(s || "").normalize("NFC").trim().toLowerCase();
const csvEsc = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

// CSV parser tối giản (hỗ trợ "..." có dấu phẩy/xuống dòng, "" escape).
function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");
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

// Dựng nội dung CSV từ danh sách đơn + các cột đã chọn (luôn có Hub ID + Mã đơn ở đầu để import khớp lại).
export function buildOrderCsv(orders, columnKeys) {
  const picked = (columnKeys && columnKeys.length ? columnKeys : DEFAULT_EXPORT_KEYS)
    .filter((k) => k !== "hubId" && k !== "orderNo" && COL_BY_KEY[k]);
  const cols = [COL_BY_KEY.hubId, COL_BY_KEY.orderNo, ...picked.map((k) => COL_BY_KEY[k])];
  const head = cols.map((c) => csvEsc(c.label)).join(",");
  const lines = (orders || []).map((o) => cols.map((c) => csvEsc(c.get(o))).join(","));
  return "﻿" + [head, ...lines].join("\r\n");   // BOM để Excel đọc UTF-8 đúng
}

// Khớp 1 tiêu đề cột với 1 cột trong registry (theo label / key / alias).
function colForHeader(h) {
  const n = norm(h);
  if (!n) return null;
  return ORDER_COLUMNS.find((c) => norm(c.label) === n || c.key.toLowerCase() === n || (c.aliases || []).includes(n)) || null;
}

// Đọc CSV import → danh sách cập nhật { id, orderNo, set:{field:value} }.
// Chỉ nhận cột TRÙNG TÊN (label/alias); ô TRỐNG được BỎ QUA (không xóa giá trị cũ).
export function parseUpdateCsv(text) {
  const rows = parseCSV(text).filter((r) => r.length && r.some((c) => String(c).trim()));
  if (rows.length < 2) return { error: "File trống hoặc chỉ có tiêu đề." };
  const header = rows[0];
  const colMap = header.map(colForHeader);
  const idxOf = (key) => colMap.findIndex((c) => c && c.key === key);
  const hubIdIdx = idxOf("hubId"), orderNoIdx = idxOf("orderNo");
  if (hubIdIdx < 0 && orderNoIdx < 0)
    return { error: "Thiếu cột để khớp đơn — cần cột 'Mã đơn' (hoặc 'Hub ID')." };
  const setCols = colMap.map((c, i) => ({ c, i })).filter(({ c }) => c && c.updatable !== false && !c.match);
  const matchedCols = setCols.map(({ c }) => c.label);
  const unknownCols = header.filter((h, i) => String(h).trim() && !colMap[i]);
  if (!setCols.length) return { error: "Không có cột nào trùng tên để cập nhật.", unknownCols };

  const updates = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = hubIdIdx >= 0 ? String(row[hubIdIdx] || "").trim() : "";
    const orderNo = orderNoIdx >= 0 ? String(row[orderNoIdx] || "").trim() : "";
    if (!id && !orderNo) continue;
    const set = {};
    for (const { c, i } of setCols) {
      const raw = row[i];
      if (raw === undefined) continue;
      const v = String(raw).trim();
      if (v === "") continue;                          // ô trống → bỏ qua (không xóa dữ liệu cũ)
      set[c.field] = c.type === "number" ? (Number(v.replace(/[^0-9.\-]/g, "")) || 0) : v;
    }
    if (Object.keys(set).length) updates.push({ id, orderNo, set });
  }
  return { updates, matchedCols, unknownCols };
}
