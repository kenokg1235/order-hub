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

// Ảnh THEO BIẾN THỂ (màu): với listing nhiều variant, tìm URL ảnh eBay ở GẦN tên màu nhất
// trong HTML (khối dữ liệu biến thể thường để tên màu cạnh ảnh riêng). Không thấy đủ gần → "" (dùng ảnh mặc định).
export function extractVariantImage(html, color) {
  const c = String(color || "").trim();
  if (!c || !html) return "";
  const imgRe = /https?:\/\/i\.ebayimg\.com\/images\/g\/[^"'\s\\]+\/s-l\d+\.(?:jpg|jpeg|png|webp)/ig;
  const imgs = []; let m;
  while ((m = imgRe.exec(html))) imgs.push({ url: m[0], pos: m.index });
  if (!imgs.length) return "";
  const cEsc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const colorRe = new RegExp(cEsc, "ig");
  let best = "", bestDist = Infinity, cm;
  while ((cm = colorRe.exec(html))) {
    for (const im of imgs) { const d = Math.abs(im.pos - cm.index); if (d < bestDist) { bestDist = d; best = im.url; } }
  }
  return (best && bestDist <= 1500) ? bigThumb(best) : "";   // chỉ nhận khi ảnh đủ gần tên màu
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
