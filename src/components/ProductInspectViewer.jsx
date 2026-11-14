import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import FaceArtwork from "./ProductFaceArtwork.jsx";
import WrapperArtwork from "./WrapperArtwork.jsx";
import PhoneMotionControl from "./PhoneMotionControl.jsx";
import { subscribeCatalogTilt } from "../utils/catalogMotion.mjs";
import faces from "../data/productInspectionFaces.json";

import { INSPECTION_FACE_NAMES, inspectionDrag, inspectionFace, inspectionGeometry, inspectionPose, productInspectionProfile, resolveInspectionArtwork } from "../utils/productInspection.mjs";
import { surfaceLighting } from "../utils/cardSurface.mjs";
import { boxLighting, boxShadow } from "../utils/boxSurface.mjs";
import { inspectionBoxViewport, inspectionDetailSize, inspectionGesture, inspectionLightFrame, inspectionTurn, inspectionTurnFrame } from "../utils/inspectionMotion.mjs";

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


export default function ProductInspectViewer({ product = {}, src = "", title = "Item" }) {
  const artwork = resolveInspectionArtwork(product, faces);
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
  const phonePose = useRef({yaw:0,pitch:0});
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
  const [selectedPhoto, setSelectedPhoto] = useState("front");
  const [failedFaces, setFailedFaces] = useState([]);
  const isCard = profile.shape === "card";
  const intendedGeometry = inspectionGeometry(profile);
  const geometry = ["box","pack"].includes(intendedGeometry) && failedFaces.length ? "photo" : intendedGeometry;
  const fullRotation = geometry === "box" || geometry === "pack" || (isCard && Boolean(profile.faces.back));
  const tiltLimit = geometry === "box" ? 90 : 28;
  const galleryFaces = INSPECTION_FACE_NAMES.filter(face => !failedFaces.includes(face) && (profile.faces[face] || (face === "front" && src)));
  const currentPhoto = geometry === "photo" ? (galleryFaces.includes(selectedPhoto) ? selectedPhoto : galleryFaces[0] || "front") : "front";
  const currentPhotoLabel = currentPhoto === "front" && !profile.faces.front ? "Main" : currentPhoto[0].toUpperCase() + currentPhoto.slice(1);
  const currentTexture = profile.faces[currentPhoto];
  // Partial galleries show the original photograph, not an inferred box face
  // stretched to another product's dimensions. Complete models use verified UVs.
  const frontTexture = geometry === "photo" && currentTexture ? {...currentTexture,quad:undefined} : currentTexture;
  function faceReady(face, ready) {
    if (!ready && !isCard && profile.faces[face]) setFailedFaces(previous => previous.includes(face) ? previous : [...previous,face]);
  }

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
    const displayPose = inspectionPose(drawnPose.current.yaw + phonePose.current.yaw, drawnPose.current.pitch + phonePose.current.pitch, 90);
    node.style.setProperty("--inspect-yaw", `${displayPose.yaw}deg`);
    node.style.setProperty("--inspect-pitch", `${displayPose.pitch}deg`);
    node.dataset.moving = String(Boolean(motion.current));
    const lightingPose = displayPose;
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
    if (!tiltEnabled || expanded) { phonePose.current={yaw:0,pitch:0}; schedulePaint(); return; }
    return subscribeCatalogTilt(next => {
      if (drag.current) return;
      if (phonePose.current.yaw === next.yaw && phonePose.current.pitch === next.pitch) return;
      phonePose.current={yaw:next.yaw,pitch:next.pitch};
      lightTarget.current={x:42+next.x*24,y:38+next.y*24};
      schedulePaint();
    });
  }, [tiltEnabled,expanded,schedulePaint]);

  useEffect(() => {
    if (geometry !== "photo") return;
    pose.current = {yaw:0,pitch:0};
    drawnPose.current = {...pose.current};
    motion.current = null;
    schedulePaint();
    setView(`${currentPhotoLabel} photo`);
  }, [geometry,currentPhotoLabel,schedulePaint]);

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
      const size = inspectionDetailSize(element.clientWidth, geometry, profile.dimensions);
      if (!size) return;
      element.style.setProperty("--detail-width", `${size.width}px`);
      element.style.setProperty("--detail-stage-height", `${size.height}px`);
      const boxSize = geometry === "box" ? inspectionBoxViewport(element.clientWidth, profile.dimensions, detail) : null;
      if (boxSize) {
        element.style.setProperty("--fitted-box-width", `${boxSize.width}px`);
        element.style.setProperty("--fitted-box-height", `${boxSize.height}px`);
      }
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [geometry, profile.dimensions, detail]);
  function move(yaw, pitch, announce = false, faceName = "") {
    const target = inspectionPose(fullRotation ? yaw : Math.max(-32, Math.min(32, yaw)), pitch, tiltLimit);
    motion.current = faceName && motionAllowed.current && tiltEnabled && geometry !== "photo" ? inspectionTurn(drawnPose.current, target) : null;
    pose.current = target;
    if (object.current) object.current.dataset.moving = String(Boolean(motion.current));
    schedulePaint();
    if (announce) setView(geometry === "photo" ? `${currentPhotoLabel} photo` : faceName ? `${faceName} view` : inspectionFace(pose.current.yaw, pose.current.pitch));
  }
  function stopDrag(event) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setView(geometry === "photo" ? `${currentPhotoLabel} photo` : inspectionFace(pose.current.yaw, pose.current.pitch));
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
  function showPhoto(face) {
    setSelectedPhoto(face);
    setArtReady(false);
    move(0, 0);
    setView(`${face === "front" && !profile.faces.front ? "Main" : face[0].toUpperCase() + face.slice(1)} photo`);
  }

  const shadow = boxShadow(initialYaw, initialPitch, profile.dimensions);
  return <section className="product-inspect" aria-label={`${title} interactive preview`}>
    <PhoneMotionControl compact />
    <div className="product-inspect__topline"><span>{fullRotation ? "Swipe to turn" : "Drag to tilt"}</span><div className="product-inspect__tools">{canExpand ? <button type="button" onClick={() => setExpanded(true)}>Full screen</button> : null}<button type="button" aria-pressed={detail} onClick={()=>setDetail(value=>!value)}>{detail ? "Standard view" : "Closer view"}</button><button type="button" aria-pressed={!tiltEnabled} onClick={toggleInteraction}>{tiltEnabled ? "Still image" : "Enable tilt"}</button></div></div>
    <div ref={stage} className="product-inspect__stage" tabIndex={0} role="group" aria-label={`Rotate ${title}`} aria-describedby={`${id}-help`} data-interactive={tiltEnabled} data-detail={detail} data-shape={geometry} style={geometry === "box" ? {"--box-shadow-span":shadow.span,"--box-shadow-bottom":shadow.bottom} : undefined} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerLeave={pointerLeave} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={keyDown}>
      {geometry === "box" ? <span className="product-inspect__box-shadow" aria-hidden="true"/> : null}
      <div ref={object} className="product-inspect__object" data-shape={geometry} style={{"--inspect-yaw":`${initialYaw}deg`,"--inspect-pitch":`${initialPitch}deg`,"--photo-aspect":photoAspect,...lightingStyle(initialYaw, initialPitch, { x: 42, y: 38 }, geometry),"--foil-mask":profile.surface.layout === "unknown" ? "none" : `url('/assets/inspection/${profile.surface.layout}-${finish === "reverse" ? "reverse" : "holo"}-mask.svg')`,"--ink-mask":profile.inkMask ? `url('${profile.inkMask}')` : "none",...(profile.dimensions ? {"--box-height":profile.dimensions.height/profile.dimensions.width,"--box-depth":profile.dimensions.depth/profile.dimensions.width,"--surface-color":profile.surfaceColor} : {})}} data-has-back={Boolean(profile.faces.back)} data-finish={isCard ? finish : "regular"} data-foil-area={fullArt ? "full" : "artwork"} data-foil-layout={profile.surface.layout} data-foil-pattern={profile.surface.pattern} data-art-ready={artReady} data-back-ready={backReady} data-moving="false">
        {geometry === "pack" ? <WrapperArtwork faces={profile.faces} dimensions={profile.dimensions} title={title} onReady={(face,ready)=>{if(face === "front")setArtReady(ready);else setBackReady(ready);faceReady(face,ready);}} /> : <>
        <div className="product-inspect__face product-inspect__front"><FaceArtwork key={`${geometry}:${currentPhoto}`} texture={failedFaces.includes(currentPhoto) ? undefined : frontTexture} src={src} product={imageProduct} title={title} face={currentPhoto} onReady={(ready, size) => { setArtReady(ready); faceReady(currentPhoto, ready); if (geometry === "photo" && size?.width > 0 && size?.height > 0) setPhotoAspect(Math.max(.5, Math.min(2, size.height / size.width))); }} fit={isCard ? "card" : undefined} /><span className="product-inspect__foil-shade" aria-hidden="true"><span className="product-inspect__material"/></span><span className="product-inspect__foil" aria-hidden="true"><span className="product-inspect__material"><span className="product-inspect__diffraction"/><span className="product-inspect__metal"/><span className="product-inspect__grain"/></span></span><span className="product-inspect__glare" aria-hidden="true" /><BoxMaterial face="front" enabled={geometry === "box"}/></div>
        {geometry !== "photo" ? <>
          <div className="product-inspect__face product-inspect__back">{profile.faces.back ? <FaceArtwork texture={profile.faces.back} title={title} face="back" onReady={ready => {setBackReady(ready);faceReady("back",ready);}} /> : null}<span className="product-inspect__back-glare" aria-hidden="true"/><BoxMaterial face="back" enabled={geometry === "box"}/></div>
          <div className="product-inspect__face product-inspect__left">{profile.faces.left ? <FaceArtwork texture={profile.faces.left} title={title} face="left" onReady={ready=>faceReady("left",ready)} /> : null}<BoxMaterial face="left" enabled={geometry === "box"}/></div>
          <div className="product-inspect__face product-inspect__right">{profile.faces.right ? <FaceArtwork texture={profile.faces.right} title={title} face="right" onReady={ready=>faceReady("right",ready)} /> : null}<BoxMaterial face="right" enabled={geometry === "box"}/></div>
          <div className="product-inspect__face product-inspect__top">{profile.faces.top ? <FaceArtwork texture={profile.faces.top} title={title} face="top" onReady={ready=>faceReady("top",ready)} /> : null}<BoxMaterial face="top" enabled={geometry === "box"}/></div><div className="product-inspect__face product-inspect__bottom">{profile.faces.bottom ? <FaceArtwork texture={profile.faces.bottom} title={title} face="bottom" onReady={ready=>faceReady("bottom",ready)} /> : null}<BoxMaterial face="bottom" enabled={geometry === "box"}/></div>
        </> : null}
        </>}
      </div>
    </div>
    <p id={`${id}-help`} className="product-inspect__hint">{tiltEnabled ? geometry === "photo" ? "Swipe sideways to tilt this photo; swipe vertically to scroll. Use arrow keys to tilt and Home to reset the angle." : "Swipe sideways to turn; swipe vertically to scroll. Use arrow keys to tilt and Home to reset." : "Still view. Use the controls below to change the angle."}</p>
    <div className="product-inspect__rotation" role="group" aria-label="View controls">
      <button type="button" aria-label="Rotate left" onClick={() => rotate(-45, 0)}>↶</button>
      <button type="button" aria-label="Tilt up" onClick={() => rotate(0, 12)}>↑</button>
      <button type="button" onClick={() => move(0, 0, true, "Front")}>Reset view</button>
      <button type="button" aria-label="Tilt down" onClick={() => rotate(0, -12)}>↓</button>
      <button type="button" aria-label="Rotate right" onClick={() => rotate(45, 0)}>↷</button>
    </div>
    <p className="product-inspect__view" role="status">{view}</p>
    {(isCard || geometry === "pack") && profile.faces.back ? <div className="product-inspect__faces product-inspect__faces--card" role="group" aria-label={geometry === "pack" ? "Wrapper faces" : "Card faces"}>{[["Front",0],["Back",180]].map(([name,yaw])=><button key={name} type="button" aria-pressed={view === `${name} view`} onClick={()=>move(yaw,0,true,name)}>{name}</button>)}</div> : null}
    {geometry === "box" ? <div className="product-inspect__faces" role="group" aria-label="Box faces">{Object.entries({Front:[0,0],Left:[90,0],Back:[180,0],Right:[-90,0],Top:[0,-90],Bottom:[0,90]}).filter(([name])=>profile.faces[name.toLowerCase()]).map(([name,[yaw,pitch]])=><button key={name} type="button" aria-pressed={view === `${name} view`} onClick={()=>move(yaw,pitch,true,name)}>{name}</button>)}</div> : null}
    {geometry === "photo" && galleryFaces.length > 1 ? <div className="product-inspect__faces" role="group" aria-label="Product photos">{galleryFaces.map(face=><button key={face} type="button" aria-pressed={currentPhoto===face} onClick={()=>showPhoto(face)}>{face === "front" && !profile.faces.front ? "Main photo" : face[0].toUpperCase()+face.slice(1)}</button>)}</div> : null}
    {expanded ? <ExpandedInspection profile={profile} src={src} title={title} imageProduct={imageProduct} onClose={() => setExpanded(false)} /> : null}
  </section>;
}
