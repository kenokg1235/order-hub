// Fetch an eBay listing's cover image by item number.
// Uses the "Yahoo Ad monitoring" User-Agent which eBay's DataDome whitelists
// (same technique proven in the previous app). Extracts twitter:image / og:image
// or an i.ebayimg.com CDN URL, then normalises the size to a light thumbnail.
const UA = "Mozilla/5.0 (compatible; Yahoo Ad monitoring; +https://help.yahoo.com)";

function metaContent(html, key) {
  const re = new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return "";
  const c = tag[0].match(/content=["']([^"']+)["']/i);
  return c ? c[1] : "";
}

const bigThumb = (url) => url ? url.replace(/s-l\d+\.(jpg|jpeg|png|webp)/i, "s-l500.$1") : url;

export function extractEbayImage(html) {
  let url = metaContent(html, "twitter:image") || metaContent(html, "og:image");
  if (!url) {
    const m = html.match(/https?:\/\/i\.ebayimg\.com\/images\/g\/[^"'\s]+\/s-l\d+\.(?:jpg|jpeg|png|webp)/i);
    url = m ? m[0] : "";
  }
  return bigThumb(url); // light thumbnail
}

// So khớp tên màu: bỏ hoa/thường + khoảng trắng + dấu để "Multi-Color" == "Multi Color".
const squeezeColor = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ebayPictureUrl (…/z/<imageId>/$_57.JPG) → thumbnail chuẩn i.ebayimg.com/images/g/<id>/s-l500.jpg
function picToThumb(picUrl) {
  if (!picUrl) return "";
  const m = picUrl.match(/\/z\/([^/]+)\//) || picUrl.match(/\/g\/([^/]+)\//);
  return m ? `https://i.ebayimg.com/images/g/${m[1]}/s-l500.jpg` : bigThumb(picUrl);
}

// Tách chuỗi thành các TỪ đã chuẩn hóa (bỏ hoa/thường + ký tự lạ). "Blue & Lavender" → ["blue","lavender"]
const wordsOf = (s) => String(s || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);

// ── Chiến lược 1: menuItemMap (tên màu → matchingVariationIds) + variationId → ebayPictureUrl ──
// Regex linh hoạt (chịu được đảo thứ tự field): bắt valueName rồi tìm matchingVariationIds trong ~300 ký tự.
function colorMenuItems(html) {
  const out = [];
  const re = /"valueName":"([^"]+)"[\s\S]{0,300}?"matchingVariationIds":\[([0-9,]+)\]/g;
  let m; while ((m = re.exec(html))) out.push({ name: m[1], ids: m[2].split(",") });
  return out;
}
function variationImageMap(html) {
  const map = new Map();
  const re = /"variationId":"(\d+)"[\s\S]{0,400}?"ebayPictureUrl":"([^"]+)"/g;
  let m; while ((m = re.exec(html))) if (!map.has(m[1])) map.set(m[1], m[2]);
  return map;
}
function matchColorItem(items, color) {
  const sq = squeezeColor(color);
  if (sq.length < 2) return null;
  let hit = items.find((x) => squeezeColor(x.name) === sq);                 // khớp đúng
  if (hit) return hit;
  // tên màu là PHẦN ĐẦU của chuỗi order (order kèm size…) → tên dài nhất (cụ thể nhất)
  const nameStarts = items.filter((x) => { const xn = squeezeColor(x.name); return xn.length >= 4 && sq.startsWith(xn); })
    .sort((a, b) => squeezeColor(b.name).length - squeezeColor(a.name).length);
  if (nameStarts.length) return nameStarts[0];
  // order là PHẦN ĐẦU của tên màu (viết tắt) → chỉ nhận khi DUY NHẤT (tránh mơ hồ "Blue")
  const qStarts = items.filter((x) => sq.length >= 4 && squeezeColor(x.name).startsWith(sq));
  return qStarts.length === 1 ? qStarts[0] : null;
}
function variantByMenu(html, color) {
  const items = colorMenuItems(html);
  if (!items.length) return null;                 // không có menuItemMap → để chiến lược khác xử lý
  const hit = matchColorItem(items, color);
  if (hit) {
    const imgMap = variationImageMap(html);
    for (const id of hit.ids) { const u = imgMap.get(id); if (u) return picToThumb(u); }
  }
  return "";                                       // CÓ menuItemMap nhưng không ra ảnh → "" (đừng đoán)
}

// ── Chiến lược 2: photosWithAltText — mỗi ảnh có imageAltText thường BẮT ĐẦU bằng tên màu ──
// ("Black Carhartt J140 …"). Khớp màu ở ĐẦU alt (từ 0 hoặc sau 1 từ như NWT/Mens) → tránh dính
// "brown logo patch" ở giữa câu. Trả ảnh của biến thể đúng; không có listing này → null.
function variantByAlt(html, color) {
  const re = /"ebayPictureUrl":"([^"]+)"\}\s*,\s*"imageAltText":"([^"]*)"/g;
  const photos = []; let m;
  while ((m = re.exec(html))) photos.push({ url: m[1], alt: m[2] });
  if (!photos.length) return null;                 // listing không có cấu trúc này
  const c = wordsOf(color);
  if (!c.length) return "";
  const startsWith = (altWords) => [0, 1].some((s) => {
    if (altWords.length - s < c.length) return false;
    for (let i = 0; i < c.length; i++) if (altWords[s + i] !== c[i]) return false;
    return true;
  });
  for (const p of photos) if (startsWith(wordsOf(p.alt))) return picToThumb(p.url);
  return "";                                       // CÓ ảnh-có-alt nhưng không khớp màu → "" (dùng mặc định)
}

// Ảnh THEO BIẾN THỂ (màu) — CHỈ từ dữ liệu có thẩm quyền của eBay, KHÔNG đoán mò (đoán hay gắn
// nhầm ảnh màu khác → gửi nhầm hàng). Không xác định được → "" để dùng ẢNH MẶC ĐỊNH.
export function extractVariantImage(html, color) {
  const c = String(color || "").trim();
  if (!c || !html) return "";
  const byMenu = variantByMenu(html, c);           // chiến lược 1 (menuItemMap)
  if (byMenu !== null) return byMenu;
  const byAlt = variantByAlt(html, c);             // chiến lược 2 (alt-text theo màu)
  if (byAlt !== null) return byAlt;
  return "";                                        // listing không lộ dữ liệu biến thể → ảnh mặc định
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// eBay trả trang chặn bot (DataDome) thay vì trang sản phẩm → nhận diện để dừng sớm.
const BLOCK_RE = /Pardon Our Interruption|datadome|captcha-delivery/i;

// Trả { url, blocked }. Có TIMEOUT (không để 1 request treo làm nghẽn hàng đợi) + 1 lần thử lại.
export async function fetchEbayImage(itemNumber, { timeoutMs = 12000, retries = 1, color = "" } = {}) {
  if (!itemNumber) return { url: "", blocked: false };
  let blocked = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(`https://www.ebay.com/itm/${itemNumber}`, {
        headers: { "User-Agent": UA, "Accept": "text/html" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status === 403 || r.status === 429) blocked = true;
      else if (r.ok) {
        const html = await r.text();
        if (BLOCK_RE.test(html)) blocked = true;
        else {
          // Ưu tiên ảnh theo BIẾN THỂ (màu); không có màu / không tìm được → ảnh mặc định.
          const img = (color && extractVariantImage(html, color)) || extractEbayImage(html);
          if (img) return { url: img, blocked: false };
        }
      }
    } catch (e) { if (e && e.name === "TimeoutError") blocked = true; }
    if (attempt < retries) await sleep(700);
  }
  return { url: "", blocked };
}
