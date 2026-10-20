// Danh mục CỘT đơn dùng chung cho XUẤT CSV và IMPORT. 2 nhóm:
//  - group "order"  : thông tin ĐƠN HÀNG (Sheet Tổng) → bảng orders.
//  - group "process": thông tin XỬ LÝ (Sheet Con)     → bảng purchases (dòng thẻ đầu tiên của đơn).
// Cột "match" (Hub ID / Mã đơn) dùng để KHỚP đơn, không bị cập nhật.
//  get(o): lấy giá trị để xuất.  field: tên cột DB server cập nhật.  aliases: tiêu đề khác chấp nhận khi import.
const MATCH_COLUMNS = [
  { key: "hubId",   label: "Hub ID", field: "id",       group: "match", match: true, updatable: false, get: (o) => o.id,      aliases: ["hubid", "id"] },
  { key: "orderNo", label: "Mã đơn", field: "order_no", group: "match", match: true, updatable: false, get: (o) => o.orderNo, aliases: ["ma don", "id order", "order number", "order", "mã order", "ma order"] },
];

const ORDER_FIELD_COLUMNS = [
  { key: "store",        label: "Store",        field: "store",         group: "order", get: (o) => o.store },
  { key: "address",      label: "Địa chỉ",      field: "address",       group: "order", get: (o) => o.address,      aliases: ["dia chi"] },
  { key: "custPhone",    label: "SĐT",          field: "cust_phone",    group: "order", get: (o) => o.custPhone,     aliases: ["sdt", "điện thoại", "dien thoai"] },
  { key: "qty",          label: "SL",           field: "qty",           group: "order", get: (o) => o.qty,          aliases: ["so luong", "số lượng", "quantity"] },
  { key: "product",      label: "Sản phẩm",     field: "product",       group: "order", get: (o) => o.product,      aliases: ["san pham", "item title"] },
  { key: "link",         label: "Link",         field: "link",          group: "order", get: (o) => o.link,         aliases: ["url", "link sp"] },
  { key: "size",         label: "Size",         field: "size",          group: "order", get: (o) => o.size,         aliases: ["variation"] },
  { key: "color",        label: "Màu",          field: "color",         group: "order", get: (o) => o.color,        aliases: ["mau"] },
  { key: "profit",       label: "Profit",       field: "profit",        group: "order", type: "number", get: (o) => o.profit, aliases: ["loi nhuan", "lợi nhuận"] },
  { key: "deadline",     label: "Thời hạn",     field: "deadline",      group: "order", get: (o) => o.deadline,     aliases: ["han", "hạn", "deadline", "ship by", "hạn ship"] },
  { key: "masterStatus", label: "Trạng thái",   field: "master_status", group: "order", get: (o) => o.masterStatus, aliases: ["trang thai", "status"] },
  { key: "masterNote",   label: "Ghi chú tổng", field: "master_note",   group: "order", get: (o) => o.masterNote,   aliases: ["ghi chu", "seller note"] },
  { key: "cancelReason", label: "Lý do hủy",    field: "cancel_reason", group: "order", get: (o) => o.cancelReason, aliases: ["ly do huy", "cancel reason"] },
  { key: "staffNote",    label: "Note NV",      field: "staff_note",    group: "order", get: (o) => o.staffNote,     aliases: ["staff note"] },
  { key: "urgentNote",   label: "Note gấp",     field: "urgent_note",   group: "order", get: (o) => o.urgentNote,    aliases: ["note gap"] },
  { key: "note1",        label: "Note 1",       field: "note1",         group: "order", get: (o) => o.note1 },
  { key: "note2",        label: "Note 2",       field: "note2",         group: "order", get: (o) => o.note2 },
  { key: "note3",        label: "Note 3",       field: "note3",         group: "order", get: (o) => o.note3 },
  { key: "note4",        label: "Note 4",       field: "note4",         group: "order", get: (o) => o.note4 },
  { key: "image",        label: "Ảnh",          field: "image",         group: "order", get: (o) => o.image,        aliases: ["anh"] },
];

const p0 = (o) => (o.purchases && o.purchases[0]) || null;   // dòng xử lý (thẻ) đầu tiên của đơn
const PROCESS_COLUMNS = [
  { key: "procOrderNumber", label: "Order#",            field: "order_number",   group: "process", get: (o) => p0(o)?.orderNumber || "", aliases: ["order #", "order no", "ma san", "mã sàn"] },
  { key: "procTracking",    label: "Tracking",          field: "tracking",       group: "process", get: (o) => p0(o)?.tracking || "",    aliases: ["tracking number", "ma van don", "mã vận đơn"] },
  { key: "procStatus",      label: "Trạng thái xử lý",  field: "process_status", group: "process", get: (o) => p0(o)?.processStatus || "", aliases: ["process status", "trang thai xu ly"] },
  { key: "procName",        label: "Tên (xử lý)",       field: "name",           group: "process", get: (o) => p0(o)?.name || "",        aliases: ["ten xu ly", "buyer name"] },
  { key: "procEmail",       label: "Email",             field: "email",          group: "process", get: (o) => p0(o)?.email || "",       aliases: ["buyer email"] },
  { key: "procPhone",       label: "Phone (xử lý)",     field: "phone",          group: "process", get: (o) => p0(o)?.phone || "",       aliases: ["phone xu ly"] },
  { key: "procZip",         label: "Zip",               field: "zip",            group: "process", get: (o) => p0(o)?.zip || "",         aliases: ["zip code"] },
  { key: "procAmount",      label: "Số tiền",           field: "amount",         group: "process", type: "number", get: (o) => p0(o)?.amount ?? "", aliases: ["so tien", "amount"] },
];

export const ORDER_COLUMNS = [...MATCH_COLUMNS, ...ORDER_FIELD_COLUMNS];        // tương thích cũ (xuất cấp đơn)
export const PROCESS_PICK_COLUMNS = PROCESS_COLUMNS;                            // cho bộ chọn cột xử lý
const ALL_COLUMNS = [...MATCH_COLUMNS, ...ORDER_FIELD_COLUMNS, ...PROCESS_COLUMNS];
export const COL_BY_KEY = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c]));
export const DEFAULT_EXPORT_KEYS = ["store", "product", "size", "color", "qty", "address", "custPhone", "deadline", "profit", "masterStatus", "masterNote"];

const norm = (s) => String(s || "").normalize("NFC").trim().toLowerCase();
const csvEsc = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

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

// Dựng CSV: luôn có Hub ID + Mã đơn ở đầu (để import khớp lại), rồi các cột đã chọn (đơn hoặc xử lý).
export function buildOrderCsv(orders, columnKeys) {
  const picked = (columnKeys && columnKeys.length ? columnKeys : DEFAULT_EXPORT_KEYS)
    .filter((k) => k !== "hubId" && k !== "orderNo" && COL_BY_KEY[k]);
  const cols = [COL_BY_KEY.hubId, COL_BY_KEY.orderNo, ...picked.map((k) => COL_BY_KEY[k])];
  const head = cols.map((c) => csvEsc(c.label)).join(",");
  const lines = (orders || []).map((o) => cols.map((c) => csvEsc(c.get(o))).join(","));
  return "﻿" + [head, ...lines].join("\r\n");
}

function colForHeader(h) {
  const n = norm(h);
  if (!n) return null;
  return ALL_COLUMNS.find((c) => norm(c.label) === n || c.key.toLowerCase() === n || (c.aliases || []).includes(n)) || null;
}

// Đọc CSV → danh sách { id, orderNo, set:{field:value} }. group = "order" | "process": chỉ áp cột NHÓM ĐÓ.
// Cột trùng tên của nhóm khác → bỏ qua. Ô trống → bỏ qua (không xóa dữ liệu cũ).
export function parseUpdateCsv(text, group) {
  const rows = parseCSV(text).filter((r) => r.length && r.some((c) => String(c).trim()));
  if (rows.length < 2) return { error: "File trống hoặc chỉ có tiêu đề." };
  const header = rows[0];
  const colMap = header.map(colForHeader);
  const hubIdIdx = colMap.findIndex((c) => c && c.key === "hubId");
  const orderNoIdx = colMap.findIndex((c) => c && c.key === "orderNo");
  if (hubIdIdx < 0 && orderNoIdx < 0)
    return { error: "Thiếu cột để khớp đơn — cần cột 'Mã đơn' (hoặc 'Hub ID')." };
  const setCols = colMap.map((c, i) => ({ c, i })).filter(({ c }) => c && c.updatable !== false && c.group === group);
  const matchedCols = setCols.map(({ c }) => c.label);
  const otherGroupCols = colMap.filter((c) => c && c.updatable !== false && c.group !== "match" && c.group !== group).map((c) => c.label);
  const unknownCols = header.filter((h, i) => String(h).trim() && !colMap[i]);
  if (!setCols.length) return { error: group === "process" ? "Không có cột XỬ LÝ nào trùng tên để cập nhật." : "Không có cột ĐƠN HÀNG nào trùng tên để cập nhật.", unknownCols };

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
      if (v === "") continue;
      set[c.field] = c.type === "number" ? (Number(v.replace(/[^0-9.\-]/g, "")) || 0) : v;
    }
    if (Object.keys(set).length) updates.push({ id, orderNo, set });
  }
  return { updates, matchedCols, unknownCols, otherGroupCols };
}
