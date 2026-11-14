import { useLayoutEffect, useRef, useState } from "react";
import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import { faceProjection, inspectionImageUrl } from "../utils/faceProjection.mjs";
import { getDisplayImageCandidates } from "../utils/imagePresentation.mjs";
import { inspectionCardFront } from "../utils/cardBacks.mjs";
export default function FaceArtwork({ texture, src, product = {}, title, face, onReady, fit, loading = "eager" }) {
  const photo = texture?.src || src || "";
  const [failedSources, setFailedSources] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [nativeSize, setNativeSize] = useState(null);
  const host = useRef(null);
  const enhanced = texture?.quad ? photo : inspectionImageUrl(photo);
  const candidates = texture ? [...new Set([enhanced, photo])].filter(Boolean) : getDisplayImageCandidates(product, src, {quality:"detail"});
  const existingSource = candidates.find(source => !failedSources.includes(source));
  const reviewedFallback = face === "front" && !texture && !existingSource ? inspectionCardFront(product) : null;
  const fallback = reviewedFallback && !failedSources.includes(reviewedFallback.src) ? reviewedFallback : null;
  const displayedTexture = fallback || texture;
  const current = existingSource || fallback?.src;
  const sourceSize = nativeSize?.source === current ? nativeSize : null;
  useLayoutEffect(() => {
    if (!displayedTexture?.quad || !host.current) return;
    const element = host.current;
    // Keep the photograph at its native pixel size before projection. Shrinking
    // it to a thin box edge first discards detail before the crop is enlarged.
    const update = () => {
      const layout = element.ownerDocument.defaultView?.getComputedStyle(element);
      const width = parseFloat(layout?.width) || element.clientWidth;
      const height = parseFloat(layout?.height) || element.clientHeight;
      setMatrix({source: current, value: faceProjection(displayedTexture.quad, width, height, sourceSize?.width || width, sourceSize?.height || height)});
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element); return () => observer?.disconnect();
  }, [displayedTexture, sourceSize, current]);
  const failed = !current;
  const projection = displayedTexture?.quad && matrix?.source === current ? matrix.value : null;
  const catalogCard = fit === "card" && /^https:\/\/(?:tcgplayer-cdn\.tcgplayer\.com|images\.pokemontcg\.io)\//.test(current || photo);
  return <div className="product-inspect__texture" ref={host} data-projected={Boolean(displayedTexture?.quad)} data-fit={displayedTexture?.reference || catalogCard ? "card" : undefined}>
    {!failed ? <PrivateStorageImage key={current} src={current} alt={displayedTexture?.reference ? displayedTexture.label : `${title}, ${face}`} draggable={false} loading={loading} style={projection ? {transform:`matrix3d(${projection.join(",")})`,...(sourceSize ? {width:sourceSize.width,height:sourceSize.height,"--face-source-width":`${sourceSize.width}px`,"--face-source-height":`${sourceSize.height}px`} : {})} : undefined} onLoad={event=>{const size={width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight};if(displayedTexture?.quad)setNativeSize(previous=>previous?.source===current&&previous?.width===size.width&&previous?.height===size.height?previous:{source:current,...size});onReady?.(true,size);}} onError={()=>{setFailedSources(sources => [...sources,current]);onReady?.(false);}}/> : face === "front" ? <span className="product-inspect__missing">Photo unavailable</span> : null}
  </div>;
}
