import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import { useState } from "react";
import { AppNavIcon } from "./command-system/AppNavIcon.jsx";
import { getDisplayImageCandidates, getResponsiveImageAttributes } from "../utils/imagePresentation.mjs";
import "./item-photo.css";

function PhotoSources({ candidates, alt, className, fallbackClassName, loading, fallback, quality, sizes }) {
  const [failedSources, setFailedSources] = useState([]);
  const [failedResponsiveSources, setFailedResponsiveSources] = useState([]);
  const [loadedSource, setLoadedSource] = useState("");
  const src = candidates.find(source => !failedSources.includes(source));
  const classes = ["item-photo", className].filter(Boolean).join(" ");
  if (src) {
    const responsive = failedResponsiveSources.includes(src) ? {} : getResponsiveImageAttributes(src, { quality, sizes });
    function failed() {
      if (responsive.srcSet) setFailedResponsiveSources(previous => [...previous, src]);
      else setFailedSources(previous => previous.includes(src) ? previous : [...previous, src]);
    }
    return <PrivateStorageImage className={classes} src={src} {...responsive} alt={alt} loading={loading} decoding="async" draggable={false} data-photo-state={loadedSource === src ? "ready" : "loading"} onLoad={() => setLoadedSource(src)} onError={failed} />;
  }
  if (fallback) return fallback;
  return <div className={[classes, fallbackClassName].filter(Boolean).join(" ")} data-photo-fallback="true" data-photo-state="unavailable" role={alt ? "img" : undefined} aria-label={alt ? `${alt} image unavailable` : undefined} aria-hidden={alt ? undefined : true}><AppNavIcon kind="inventory" /></div>;
}

export default function ItemPhoto({ src = "", product = {}, alt = "", className = "", fallbackClassName = "", loading = "lazy", quality = "tile", sizes = "96px", fallback = null }) {
  const candidates = getDisplayImageCandidates(product, src, { quality });
  return <PhotoSources key={JSON.stringify(candidates)} candidates={candidates} alt={alt} className={className} fallbackClassName={fallbackClassName} loading={loading} fallback={fallback} quality={quality} sizes={sizes} />;
}
