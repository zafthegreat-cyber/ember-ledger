import { getItemImageUrl } from "./productDisplayUtils.js";
import { inspectionImageUrl } from "./faceProjection.mjs";

const usable = value => typeof value === "string" && value.trim() && !/^(null|undefined|none|n\/a|na|unknown|image needed|image unavailable|placeholder)$/i.test(value.trim()) ? value.trim() : "";
const unique = values => [...new Set(values.map(usable).filter(Boolean))];
function detailSource(source) {
  try {
    const url = new URL(source);
    if (url.search || url.hash || url.username || url.password) return source;
  } catch { return source; }
  return inspectionImageUrl(source);
}

// The existing CDN serves this same product at two documented-in-app sizes.
// Responsive selection avoids downloading detail artwork for small search rows.
export function getResponsiveImageAttributes(source, { quality = "tile", sizes = "96px" } = {}) {
  const large = detailSource(source);
  return quality === "tile" && large !== source
    ? { srcSet: `${source} 200w, ${large} 1000w`, sizes }
    : {};
}

// Display only: keep the chosen owner photo and original catalog sources intact.
// Only front-artwork aliases are alternates; a gallery may contain a back/receipt.
export function getDisplayImageCandidates(product = {}, preferredSource = "", { quality = "tile" } = {}) {
  const primary = usable(preferredSource) || getItemImageUrl(product);
  const images = product.images && !Array.isArray(product.images) && typeof product.images === "object" ? product.images : {};
  const large = unique([product.largeImageUrl, product.large_image_url, product.imageLarge, product.image_large, images.large]);
  const small = unique([product.thumbnailUrl, product.thumbnail_url, product.smallImageUrl, product.small_image_url, product.imageSmall, product.image_small, images.small, images.thumbnail, images.thumb]);
  const ownerSources = unique([product.displayImage, product.itemImage, product.item_image]);
  const preferLarge = primary && small.includes(primary) && !ownerSources.includes(primary);
  const sources = unique([
    ...(preferLarge ? large : []), primary,
    ...large,
    product.imageUrl, product.imageURL, product.image_url, product.photoUrl, product.photo_url,
    product.productImage, product.product_image, product.pictureUrl, product.picture_url,
    product.cardImageUrl, product.card_image_url, images.medium, images.url, images.src,
    images.imageUrl, images.image_url, ...small,
    product.catalogImageUrl, product.catalog_image_url, product.productImageUrl, product.product_image_url,
  ]);
  return quality === "detail" ? unique(sources.flatMap(source => [detailSource(source), source])) : sources;
}
