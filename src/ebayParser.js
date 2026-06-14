// Parse an eBay "OrdersReport" CSV (the exact export the user provided).
// The file has: a leading blank line, a quoted header row, an empty values row,
// data rows, a blank line, then footer rows ("N record(s) downloaded", "Seller ID…").
// We locate the header by the "Order Number" column and map only what we need.

function parseCSV(text) {
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
      product: get(row, ci.title),
      qty: get(row, ci.qty),
      custPhone: get(row, ci.shipPhone),
      address: addressParts.join("\n"),
      link: itemNo ? `https://www.ebay.com/itm/${itemNo}` : "",
      size: get(row, ci.variation),           // eBay variation → Size/Variation cell
      color: "",
      raw: {
        itemNumber: itemNo, buyerEmail: get(row, ci.email),
        total: get(row, ci.total), saleDate: get(row, ci.saleDate),
      },
    });
  }
  return { rows: out, count: out.length };
}
