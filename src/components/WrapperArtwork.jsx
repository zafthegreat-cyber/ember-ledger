import { useLayoutEffect, useRef, useState } from "react";
import FaceArtwork from "./ProductFaceArtwork.jsx";
import { wrapperGeometry } from "../utils/wrapperGeometry.mjs";

// The photographed foil is draped over shallow connected strips. Sealed ends
// close to a hairline rather than inheriting the thickness of a rigid box.
export default function WrapperArtwork({ faces, dimensions, title, onReady }) {
  const host = useRef(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const update = () => {
      const layout = node.ownerDocument.defaultView?.getComputedStyle(node);
      const width = parseFloat(layout?.width) || node.clientWidth, height = parseFloat(layout?.height) || node.clientHeight;
      if (width && height) setSize(previous => previous?.width === width && previous?.height === height ? previous : { width, height });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);
  const ratio = dimensions?.width > 0 ? dimensions.depth / dimensions.width : .022;
  const mesh = size ? wrapperGeometry({ ...size, depth: size.width * Math.min(.028, Math.max(.012, ratio || .022)), endDepth: .55 }) : null;
  return <div ref={host} className="product-inspect__wrapper">
    {mesh?.rows.flatMap(row => ["front", "back"].map(face => <div key={`${face}-${row.index}`} className="product-inspect__face product-inspect__wrapper-row" data-wrapper-face={face} aria-hidden={row.index !== 0 || undefined} style={{height:row.length+1.6,marginTop:-row.length/2-.8,transform:`translateY(${row.centerY}px) translateZ(${row[face].centerZ}px) rotateX(${row[face].rotateX}deg) rotateY(${row[face].rotateY}deg)`}}>
      <div className="product-inspect__wrapper-photo" style={{height:row.textureHeight,top:row.textureOffsetY+.8}}><FaceArtwork texture={faces[face]} title={title} face={face} onReady={ready=>onReady?.(face,ready)} /></div>
    </div>))}
    {mesh?.edges.map(edge=><span key={edge.side} className="product-inspect__wrapper-edge" aria-hidden="true" style={{width:edge.width,height:edge.height,marginLeft:-edge.width/2,marginTop:-edge.height/2,clipPath:edge.clipPath,transform:`translateX(${edge.centerX}px) rotateY(${edge.rotateY}deg)`}}/>)}
    {mesh ? [-1,1].map(side=><span key={`end-${side}`} className="product-inspect__wrapper-end" aria-hidden="true" style={{height:mesh.endDepth,marginTop:-mesh.endDepth/2,transform:`translateY(${side*size.height/2}px) rotateX(${-side*90}deg)`}}/>) : null}
  </div>;
}
