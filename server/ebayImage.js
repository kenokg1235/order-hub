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

export function extractEbayImage(html) {
  let url = metaContent(html, "twitter:image") || metaContent(html, "og:image");
  if (!url) {
    const m = html.match(/https?:\/\/i\.ebayimg\.com\/images\/g\/[^"'\s]+\/s-l\d+\.(?:jpg|jpeg|png|webp)/i);
    url = m ? m[0] : "";
  }
  if (url) url = url.replace(/s-l\d+\.(jpg|jpeg|png|webp)/i, "s-l500.$1"); // light thumbnail
  return url;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// eBay trả trang chặn bot (DataDome) thay vì trang sản phẩm → nhận diện để dừng sớm.
const BLOCK_RE = /Pardon Our Interruption|datadome|captcha-delivery/i;

// Trả { url, blocked }. Có TIMEOUT (không để 1 request treo làm nghẽn hàng đợi) + 1 lần thử lại.
export async function fetchEbayImage(itemNumber, { timeoutMs = 12000, retries = 1 } = {}) {
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
          const img = extractEbayImage(html);
          if (img) return { url: img, blocked: false };
        }
      }
    } catch (e) { if (e && e.name === "TimeoutError") blocked = true; }
    if (attempt < retries) await sleep(700);
  }
  return { url: "", blocked };
}
