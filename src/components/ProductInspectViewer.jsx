import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import faces from "../data/productInspectionFaces.json";
import { faceProjection, inspectionImageUrl } from "../utils/faceProjection.mjs";
import { inspectionDrag, inspectionFace, inspectionPose, productInspectionProfile } from "../utils/productInspection.mjs";
import { surfaceLighting } from "../utils/cardSurface.mjs";
import { boxLighting, boxShadow } from "../utils/boxSurface.mjs";
import { inspectionDetailSize, inspectionGesture, inspectionLightFrame, inspectionTurn, inspectionTurnFrame } from "../utils/inspectionMotion.mjs";
import { getDisplayImageCandidates } from "../utils/imagePresentation.mjs";
import "./product-inspect.css";

function lightingStyle(yaw, pitch, light, shape) {
  if (shape === "box") return Object.fromEntries(Object.entries(boxLighting(yaw, pitch, light)).flatMap(([face, values]) => Object.entries(values).map(([name, value]) => [`--box-${face}-${name}`, name === "x" || name === "y" ? `${value}%` : value])));
  const reflection = surfaceLighting(yaw, pitch, light);
  const back = surfaceLighting(yaw + 180, -pitch, {x:100-light.x,y:light.y});
  return { "--reflection-x": `${reflection.x}%`, "--reflection-y": `${reflection.y}%`, "--foil-power": reflection.strength, "--gloss-power": reflection.sheen, "--foil-shade": reflection.shade, "--foil-angle": `${reflection.angle}deg`, "--foil-shift": `${reflection.shift}%`, "--back-reflection-x":`${back.x}%`, "--back-reflection-y":`${back.y}%`, "--back-gloss-power":back.sheen };
}

function BoxMaterial({ face, enabled }) {
  return enabled ? <span className="product-inspect__box-material" aria-hidden="true" style={{"--face-shade":`var(--box-${face}-shade)`,"--face-gloss":`var(--box-${face}-gloss)`,"--face-x":`var(--box-${face}-x)`,"--face-y":`var(--box-${face}-y)`}}/> : null;
}

function FaceArtwork({ texture, src, product = {}, title, face, onReady, fit }) {
  const photo = texture?.src || src || "";
  const [failedSources, setFailedSources] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const host = useRef(null);
  const enhanced = texture?.quad ? photo : inspectionImageUrl(photo);
  const candidates = texture ? [...new Set([enhanced, photo])].filter(Boolean) : getDisplayImageCandidates(product, src, {quality:"detail"});
  const current = candidates.find(source => !failedSources.includes(source));
  useLayoutEffect(() => {
    if (!texture?.quad || !host.current) return;
    const element = host.current;
    const update = () => setMatrix(faceProjection(texture.quad, element.clientWidth, element.clientHeight));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element); return () => observer?.disconnect();
  }, [texture]);
  const failed = !current;
  const catalogCard = fit === "card" && /^https:\/\/(?:tcgplayer-cdn\.tcgplayer\.com|images\.pokemontcg\.io)\//.test(current || photo);
  return <div className="product-inspect__texture" ref={host} data-projected={Boolean(texture?.quad)} data-fit={texture?.reference || catalogCard ? "card" : undefined}>
    {!failed ? <PrivateStorageImage src={current} alt={texture?.reference ? texture.label : `${title}, ${face}`} draggable={false} loading="eager" style={matrix ? {transform:`matrix3d(${matrix.join(",")})`} : undefined} onLoad={event=>onReady?.(true,{width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={()=>{setFailedSources(sources => [...sources,current]);onReady?.(false);}}/> : face === "front" ? <span className="product-inspect__missing">Photo unavailable</span> : null}
  </div>;
}

export default function ProductInspectViewer({ product = {}, src = "", title = "Item" }) {
  const artwork = faces[`tcgplayer:${product.tcgplayerProductId || ""}`];
  const profile = productInspectionProfile(product, artwork);
  const identity = product.tcgplayerProductId || product.catalogProductId || product.id || title;
  return <Inspection key={`${identity}:${src}:${profile.shape}:${JSON.stringify(profile.faces)}`} profile={profile} src={src} title={title} imageProduct={product} />;
}

function ExpandedInspection({ profile, src, title, imageProduct, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    if (node?.showModal) node.showModal();
    else node?.setAttribute("open", "");
    return () => { if (node?.open) node.close?.(); };
  }, []);
  return <dialog ref={dialog} className="product-inspect__fullscreen" aria-label={`${title} full-screen inspection`} onKeyDown={event => { if(event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}><header><h2>{title}</h2><button type="button" onClick={onClose}>Close full screen</button></header><Inspection profile={profile} src={src} title={title} imageProduct={imageProduct} canExpand={false} /></dialog>;
}

function Inspection({ profile, src, title, imageProduct, canExpand = true }) {
  const id = useId();
  const stage = useRef(null);
  const object = useRef(null);
  const frame = useRef(null);
  const initialYaw = 0;
  const initialPitch = 0;
  const pose = useRef({ yaw: initialYaw, pitch: initialPitch });
  const drawnPose = useRef({ yaw: initialYaw, pitch: initialPitch });
  const motion = useRef(null);
  const motionAllowed = useRef(false);
  const lastPaint = useRef(null);
  const drag = useRef(null);
  const light = useRef({ x: 42, y: 38 });
  const lightTarget = useRef({ x: 42, y: 38 });
  const [view, setView] = useState("Front view");
  const finish = profile.initialFinish, fullArt = profile.fullArt;
  const [artReady, setArtReady] = useState(false);
  const [backReady, setBackReady] = useState(false);
  const [photoAspect, setPhotoAspect] = useState(1);
  const [tiltEnabled, setTiltEnabled] = useState(true);
  const [detail, setDetail] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isCard = profile.shape === "card";
  const hasOtherFace = Object.keys(profile.faces).some(face => face !== "front");
  const geometry = (profile.shape === "box" && (!profile.faces.front || !hasOtherFace)) || (profile.shape === "pack" && !profile.faces.back) ? "photo" : profile.shape;
  const fullRotation = geometry === "box" || Boolean(profile.faces.back);
  const tiltLimit = geometry === "box" ? 90 : 28;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const paint = useCallback(function paint(time) {
    frame.current = null;
    const node = object.current;
    if (!node) return;
    if (motion.current) {
      const turn = motion.current;
      turn.startedAt ??= time;
      const next = inspectionTurnFrame(turn, time - turn.startedAt);
      drawnPose.current = { yaw: next.yaw, pitch: next.pitch };
      if (next.done) { motion.current = null; drawnPose.current = { ...pose.current }; }
    } else drawnPose.current = { ...pose.current };
    const nextLight = motionAllowed.current ? inspectionLightFrame(light.current, lightTarget.current, lastPaint.current === null ? 16 : time - lastPaint.current) : { ...lightTarget.current, done: true };
    light.current = { x: nextLight.x, y: nextLight.y };
    lastPaint.current = time;
    node.style.setProperty("--inspect-yaw", `${drawnPose.current.yaw}deg`);
    node.style.setProperty("--inspect-pitch", `${drawnPose.current.pitch}deg`);
    node.dataset.moving = String(Boolean(motion.current));
    const lightingPose = inspectionPose(drawnPose.current.yaw, drawnPose.current.pitch, 90);
    for (const [property, value] of Object.entries(lightingStyle(lightingPose.yaw, lightingPose.pitch, light.current, geometry))) node.style.setProperty(property, String(value));
    if (geometry === "box") {
      const shadow = boxShadow(lightingPose.yaw, lightingPose.pitch, profile.dimensions);
      stage.current?.style.setProperty("--box-shadow-span", String(shadow.span));
      stage.current?.style.setProperty("--box-shadow-bottom", String(shadow.bottom));
    }
    if (motion.current || !nextLight.done) frame.current = requestAnimationFrame(paint);
  }, [geometry, profile.dimensions]);
  const schedulePaint = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const update = () => {
      motionAllowed.current = !preference.matches;
      if (preference.matches && (motion.current || light.current.x !== lightTarget.current.x || light.current.y !== lightTarget.current.y)) {
        motion.current = null;
        light.current = { ...lightTarget.current };
        schedulePaint();
      }
    };
    update();
    if (preference.addEventListener) preference.addEventListener("change", update);
    else preference.addListener?.(update);
    return () => {
      if (preference.removeEventListener) preference.removeEventListener("change", update);
      else preference.removeListener?.(update);
    };
  }, [schedulePaint]);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const update = () => {
      const size = inspectionDetailSize(element.clientWidth, geometry);
      if (!size) return;
      element.style.setProperty("--detail-width", `${size.width}px`);
      element.style.setProperty("--detail-stage-height", `${size.height}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [geometry]);
  function move(yaw, pitch, announce = false, faceName = "") {
    const target = inspectionPose(fullRotation ? yaw : Math.max(-32, Math.min(32, yaw)), pitch, tiltLimit);
    motion.current = faceName && motionAllowed.current && tiltEnabled && geometry !== "photo" ? inspectionTurn(drawnPose.current, target) : null;
    pose.current = target;
    if (object.current) object.current.dataset.moving = String(Boolean(motion.current));
    schedulePaint();
    if (announce) setView(faceName ? `${faceName} view` : inspectionFace(pose.current.yaw, pose.current.pitch));
  }
  function stopDrag(event) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setView(inspectionFace(pose.current.yaw, pose.current.pitch));
  }
  function pointerDown(event) {
    if (!tiltEnabled || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (event.pointerType !== "touch") stage.current?.focus({ preventScroll: true });
    if (motion.current) {
      pose.current = inspectionPose(drawnPose.current.yaw, drawnPose.current.pitch, tiltLimit);
      motion.current = null;
      schedulePaint();
    }
    lightTarget.current = { x: 42, y: 38 };
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: bounds.width, pointerType: event.pointerType, intent: event.pointerType === "touch" ? "pending" : "turn", ...pose.current };
    event.currentTarget.dataset.dragging = String(drag.current.intent === "turn");
    if (drag.current.intent === "turn") event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!tiltEnabled) return;
    const active = drag.current;
    if (active) {
      if (active.id !== event.pointerId) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (active.intent === "pending") {
        active.intent = inspectionGesture(dx, dy, active.pointerType);
        if (active.intent === "scroll") { drag.current = null; return; }
        if (active.intent === "pending") return;
        event.currentTarget.dataset.dragging = "true";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        stage.current?.focus({ preventScroll: true });
      }
      const next = inspectionDrag(active, dx, dy, active.width, tiltLimit);
      move(next.yaw, next.pitch);
    } else if (event.pointerType === "mouse" && !event.buttons && motionAllowed.current) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      lightTarget.current = { x: x * 100, y: y * 100 };
      // Hover changes the light, not the chosen spin angle.
      schedulePaint();
    }
  }
  function keyDown(event) {
    const delta = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[event.key];
    if (delta) { const current = controlPose(); event.preventDefault(); move(current.yaw + delta[0], current.pitch + delta[1], true); }
    if (event.key === "Home") { event.preventDefault(); move(0, 0, true, "Front"); }
  }
  function controlPose() { return motion.current ? drawnPose.current : pose.current; }
  function rotate(yaw, pitch) { const current = controlPose(); move(current.yaw + yaw, current.pitch + pitch, true); }
  function pointerLeave(event) {
    if (event.pointerType !== "mouse" || drag.current) return;
    lightTarget.current = { x: 42, y: 38 };
    schedulePaint();
  }
  function toggleInteraction() {
    drag.current = null;
    if (stage.current) stage.current.dataset.dragging = "false";
    setTiltEnabled(value => !value);
    lightTarget.current = { x: 42, y: 38 };
    light.current = { x: 42, y: 38 };
    move(0, 0, true);
  }

  const shadow = boxShadow(initialYaw, initialPitch, profile.dimensions);
  return <section className="product-inspect" aria-label={`${title} interactive preview`}>
    <div className="product-inspect__topline"><span>{fullRotation ? "Swipe to turn" : "Drag to tilt"}</span><div className="product-inspect__tools">{canExpand ? <button type="button" onClick={() => setExpanded(true)}>Full screen</button> : null}<button type="button" aria-pressed={detail} onClick={()=>setDetail(value=>!value)}>{detail ? "Standard view" : "Closer view"}</button><button type="button" aria-pressed={!tiltEnabled} onClick={toggleInteraction}>{tiltEnabled ? "Still image" : "Enable tilt"}</button></div></div>
    <div ref={stage} className="product-inspect__stage" tabIndex={0} role="group" aria-label={`Rotate ${title}`} aria-describedby={`${id}-help`} data-interactive={tiltEnabled} data-detail={detail} data-shape={geometry} style={geometry === "box" ? {"--box-shadow-span":shadow.span,"--box-shadow-bottom":shadow.bottom} : undefined} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerLeave={pointerLeave} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={keyDown}>
      {geometry === "box" ? <span className="product-inspect__box-shadow" aria-hidden="true"/> : null}
      <div ref={object} className="product-inspect__object" data-shape={geometry} style={{"--inspect-yaw":`${initialYaw}deg`,"--inspect-pitch":`${initialPitch}deg`,"--photo-aspect":photoAspect,...lightingStyle(initialYaw, initialPitch, { x: 42, y: 38 }, geometry),"--foil-mask":profile.surface.layout === "unknown" ? "none" : `url('/assets/inspection/${profile.surface.layout}-${finish === "reverse" ? "reverse" : "holo"}-mask.svg')`,"--ink-mask":profile.inkMask ? `url('${profile.inkMask}')` : "none",...(profile.dimensions ? {"--box-height":profile.dimensions.height/profile.dimensions.width,"--box-depth":profile.dimensions.depth/profile.dimensions.width,"--surface-color":profile.surfaceColor} : {})}} data-has-back={Boolean(profile.faces.back)} data-finish={isCard ? finish : "regular"} data-foil-area={fullArt ? "full" : "artwork"} data-foil-layout={profile.surface.layout} data-foil-pattern={profile.surface.pattern} data-art-ready={artReady} data-back-ready={backReady} data-moving="false">
        <div className="product-inspect__face product-inspect__front"><FaceArtwork texture={profile.faces.front} src={src} product={imageProduct} title={title} face="front" onReady={(ready, size) => { setArtReady(ready); if (geometry === "photo" && size?.width > 0 && size?.height > 0) setPhotoAspect(Math.max(.5, Math.min(2, size.height / size.width))); }} fit={isCard ? "card" : undefined} /><span className="product-inspect__foil-shade" aria-hidden="true"><span className="product-inspect__material"/></span><span className="product-inspect__foil" aria-hidden="true"><span className="product-inspect__material"><span className="product-inspect__diffraction"/><span className="product-inspect__metal"/><span className="product-inspect__grain"/></span></span><span className="product-inspect__glare" aria-hidden="true" /><BoxMaterial face="front" enabled={geometry === "box"}/></div>
        <div className="product-inspect__face product-inspect__back">{profile.faces.back ? <FaceArtwork texture={profile.faces.back} title={title} face="back" onReady={setBackReady} /> : null}<span className="product-inspect__back-glare" aria-hidden="true"/><BoxMaterial face="back" enabled={geometry === "box"}/></div>
        <div className="product-inspect__face product-inspect__left">{profile.faces.left ? <FaceArtwork texture={profile.faces.left} title={title} face="left" /> : null}<BoxMaterial face="left" enabled={geometry === "box"}/></div>
        <div className="product-inspect__face product-inspect__right">{profile.faces.right ? <FaceArtwork texture={profile.faces.right} title={title} face="right" /> : null}<BoxMaterial face="right" enabled={geometry === "box"}/></div>
        <div className="product-inspect__face product-inspect__top">{profile.faces.top ? <FaceArtwork texture={profile.faces.top} title={title} face="top" /> : null}<BoxMaterial face="top" enabled={geometry === "box"}/></div><div className="product-inspect__face product-inspect__bottom">{profile.faces.bottom ? <FaceArtwork texture={profile.faces.bottom} title={title} face="bottom" /> : null}<BoxMaterial face="bottom" enabled={geometry === "box"}/></div>
      </div>
    </div>
    <p id={`${id}-help`} className="product-inspect__hint">{tiltEnabled ? "Swipe sideways to turn; swipe vertically to scroll. Use arrow keys to tilt and Home to reset." : "Still view. Use the controls below to change the angle."}</p>
    <div className="product-inspect__rotation" role="group" aria-label="View controls">
      <button type="button" aria-label="Rotate left" onClick={() => rotate(-45, 0)}>↶</button>
      <button type="button" aria-label="Tilt up" onClick={() => rotate(0, 12)}>↑</button>
      <button type="button" onClick={() => move(0, 0, true, "Front")}>Reset view</button>
      <button type="button" aria-label="Tilt down" onClick={() => rotate(0, -12)}>↓</button>
      <button type="button" aria-label="Rotate right" onClick={() => rotate(45, 0)}>↷</button>
    </div>
    <p className="product-inspect__view" role="status">{view}</p>
    {isCard && profile.faces.back ? <div className="product-inspect__faces product-inspect__faces--card" role="group" aria-label="Card faces">{[["Front",0],["Back",180]].map(([name,yaw])=><button key={name} type="button" aria-pressed={view === `${name} view`} onClick={()=>move(yaw,0,true,name)}>{name}</button>)}</div> : null}
    {geometry === "box" ? <div className="product-inspect__faces" role="group" aria-label="Box faces">{Object.entries({Front:[0,0],Left:[90,0],Back:[180,0],Right:[-90,0],Top:[0,-90],Bottom:[0,90]}).filter(([name])=>profile.faces[name.toLowerCase()]).map(([name,[yaw,pitch]])=><button key={name} type="button" aria-pressed={view === `${name} view`} onClick={()=>move(yaw,pitch,true,name)}>{name}</button>)}</div> : null}
    {expanded ? <ExpandedInspection profile={profile} src={src} title={title} imageProduct={imageProduct} onClose={() => setExpanded(false)} /> : null}
  </section>;
}
