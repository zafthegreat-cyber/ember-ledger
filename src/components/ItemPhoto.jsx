import { useState } from "react";
import { AppNavIcon } from "./command-system/AppNavIcon.jsx";

export default function ItemPhoto({ src = "", alt = "", className = "", fallbackClassName = "", loading = "lazy" }) {
  const [failedSource, setFailedSource] = useState(null);
  if (src && src !== failedSource) {
    return <img className={className || undefined} src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailedSource(src)} />;
  }
  return <div className={[className, fallbackClassName].filter(Boolean).join(" ")} data-photo-fallback="true" aria-hidden="true"><AppNavIcon kind="inventory" /></div>;
}
