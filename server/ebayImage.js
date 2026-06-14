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

export async function fetchEbayImage(itemNumber) {
  if (!itemNumber) return "";
  try {
    const r = await fetch(`https://www.ebay.com/itm/${itemNumber}`, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
    });
    if (!r.ok) return "";
    return extractEbayImage(await r.text());
  } catch {
    return "";
  }
}
