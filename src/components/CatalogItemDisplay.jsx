import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ItemPhoto from './ItemPhoto.jsx';
import FaceArtwork from './ProductFaceArtwork.jsx';
import registry from '../data/productInspectionFaces.json';
import { productInspectionProfile, resolveInspectionArtwork, validInspectionQuad } from '../utils/productInspection.mjs';
import { subscribeCatalogTilt } from '../utils/catalogMotion.mjs';
import './catalog-item-display.css';

// A lightweight front view: one texture and one shared sensor subscription,
// rather than mounting the full six-face inspector for every search result.
export default function CatalogItemDisplay({ product={}, src='', alt='', sizes='240px', fallbackClassName='' }) {
  return <ItemDisplay key={`${product.tcgplayerProductId || product.catalogProductId || product.id || ''}:${src}`} product={product} src={src} alt={alt} sizes={sizes} fallbackClassName={fallbackClassName}/>;
}
function ItemDisplay({product,src,alt,sizes,fallbackClassName}) {
  const host=useRef(null), surface=useRef(null);
  const [ratio,setRatio]=useState(1),[failed,setFailed]=useState(false);
  const catalogSource=/^https:\/\/(?:tcgplayer-cdn\.tcgplayer\.com|product-images\.tcgplayer\.com|images\.pokemontcg\.io)\//.test(src) || [product.catalogImageUrl,product.catalog_image_url].filter(Boolean).includes(src);
  const ownerPhoto=[product.displayImage,product.itemImage,product.item_image].filter(Boolean).includes(src) || (!catalogSource && [product.photoUrl,product.photo_url].filter(Boolean).includes(src));
  const artwork=ownerPhoto ? null : resolveInspectionArtwork(product,registry);
  const front=!failed && validInspectionQuad(artwork?.faces?.front?.quad) ? artwork.faces.front : null;
  const card=productInspectionProfile(product).shape==='card' && !ownerPhoto;
  const aspect=front && artwork.dimensions ? artwork.dimensions.width/artwork.dimensions.height : card ? 63/88 : ratio;
  useLayoutEffect(()=>{
    const element=host.current,node=surface.current;
    if(!element||!node)return;
    const fit=()=>{const width=Math.min(element.clientWidth,element.clientHeight*aspect);node.style.width=`${width}px`;node.style.height=`${width/aspect}px`;};
    fit();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);observer?.observe(element);
    return()=>observer?.disconnect();
  },[aspect]);
  useEffect(()=>{
    let unsubscribe;
    const apply=next=>{const node=surface.current;if(node){node.style.setProperty('--item-pitch',`${next.pitch}deg`);node.style.setProperty('--item-yaw',`${next.yaw}deg`);}};
    const observe=visible=>{unsubscribe?.();unsubscribe=visible?subscribeCatalogTilt(apply):undefined;if(!visible)apply({pitch:0,yaw:0});};
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>observe(entries[0].isIntersecting));
    if(observer)observer.observe(host.current);else observe(true);
    return()=>{observer?.disconnect();unsubscribe?.();};
  },[]);
  return <span ref={host} className="catalog-item-display"><span ref={surface} className="catalog-item-display__surface" data-card={card} data-projected={Boolean(front)}>
    {front ? <FaceArtwork texture={front} title={alt || product.name || 'Item'} face="front" loading="lazy" onReady={ready=>{if(!ready)setFailed(true);}}/> : <ItemPhoto product={product} src={src} alt={alt} sizes={sizes} fallbackClassName={fallbackClassName} onLoad={event=>{const image=event.currentTarget;if(image.naturalHeight)setRatio(image.naturalWidth/image.naturalHeight);}}/>}
  </span></span>;
}
