import { useEffect, useRef, useState } from "react";
import "./card-camera-frame.css";
import { frameToVideoRect, videoToBoxRect } from "../utils/cardCameraFrame.mjs";
import { createNextCardWatcher, createSteadyTracker, frameDetail } from "../utils/scannerExtras.mjs";
import { assessCardView, CAMERA_ASSIST, captureRect, cardThumb, coachTip, createFocusCoach, createSharpnessGate, edgeSharpness, padRect, sameCardBox, sharpestOf, textStripRows, toGray } from "../utils/cardCameraAssist.mjs";

// Live camera with a card-shaped frame (Nov 17 2026). Lining the card up in the
// frame gives the card reader an upright, full-size card, which is what makes
// reading reliable on busy tables and at odd angles. Only the area inside the
// frame is captured; the camera stream stops as soon as this closes.
// slab: a taller graded-slab frame with the label at the top.
// Nov 19 2026: flashlight button, auto-scan once the card is held still, and a
// short buzz when a picture is taken.
// Nov 21 2026 (owner: "lining it up took several tries"): the frame is smaller so
// phones can focus, the camera looks at a margin around it and finds the card's
// edges itself, the picture is cut to the card it found, live tips say what to
// fix, and auto-scan waits for a found, sharp, glare-free card.
// Nov 24 2026 (scanner review): the card must be found in the same place in two
// looks in a row; a close, upright card held still ~2 s is taken even if glare or
// focus never clears; the no-edges fallback needs something in the frame (not an
// empty table); the camera restarts when the app comes back from the background;
// and it asks for 4K so small print stays readable.
// Nov 25 2026 (owner: "continuous scanner improvement"): continuous shows "Got it.
// Show the next card." as soon as the picture is taken; a new retryKey lets the same
// card be taken once more after it could not be read.
// Nov 26 2026 (owner: "keep improving the scanner"): each picture is the sharpest of
// three taken in a row; an outline shows the card the camera has found; and a view
// that stays blurry says why (too dark, too close) and points at the button that helps.
// The card is also found when it is held at a slant (up to about 10 degrees), on pale and
// patterned tables as well as dark ones, and a slanted card's picture is turned upright.

const AUTO_KEY = "code3.scanner.autoCapture.v1";
const SAMPLE = 32;
const ASSIST_WIDTH = 160;
const FALLBACK_HOLD = 10; // still for ~2.5 s with no card edges found (busy table): use the frame

function readAutoPreference() {
  try { return globalThis.localStorage?.getItem(AUTO_KEY) !== "off"; } catch { return true; }
}

function buzz(pattern = 40) {
  try { navigator.vibrate?.(pattern); } catch { /* Optional feedback. */ }
}

// below: shown straight under the camera picture (the last card scanned), where it is seen without scrolling.
export default function CardCameraFrame({ onCapture, onCancel, slab = false, continuous = false, retryKey = 0, below = null }) {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const trackRef = useRef(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const [zoomRange, setZoomRange] = useState(null); // { min, step, near } when the camera can zoom
  const [zoomed, setZoomed] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [auto, setAuto] = useState(readAutoPreference);
  const autoRef = useRef(auto);
  const torchRef = useRef(false);
  useEffect(() => { torchRef.current = torch; }, [torch]);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  const torchSupportedRef = useRef(false);
  useEffect(() => { torchSupportedRef.current = torchSupported; }, [torchSupported]);
  const zoomRef = useRef({ available: false, zoomed: false });
  useEffect(() => { zoomRef.current = { available: Boolean(zoomRange), zoomed }; }, [zoomRange, zoomed]);
  const [steady, setSteady] = useState(0);
  const [tip, setTip] = useState("");
  const [suggest, setSuggest] = useState(""); // the button the tip points at: "torch", "zoom" or ""
  const [found, setFound] = useState(null); // where the found card shows on screen: { x, y, width, height, ready }
  const [waiting, setWaiting] = useState(false); // a picture was taken; waiting for the next card
  const retryRef = useRef(retryKey);
  useEffect(() => { retryRef.current = retryKey; }, [retryKey]);
  const viewRef = useRef(null); // last look: { padded, card, ready }
  const sectionRef = useRef(null);
  // On a phone the camera opens below the fold; bring it into view.
  useEffect(() => { try { sectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }); } catch { /* Optional. */ } }, []);

  // Bumped to reopen the camera: phones stop the stream when the app goes to the
  // background, which left a black frame on return.
  const [streamKey, setStreamKey] = useState(0);
  useEffect(() => {
    let stream;
    let active = true;
    const reopen = () => {
      if (!active || document.hidden) return;
      const track = trackRef.current;
      if (track && track.readyState !== "ended" && !videoRef.current?.paused) return;
      active = false;
      setReady(false);
      setTorch(false);
      setZoomed(false);
      setStreamKey((key) => key + 1);
    };
    document.addEventListener("visibilitychange", reopen);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } } });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const track = stream.getVideoTracks?.()[0];
        trackRef.current = track || null;
        track?.addEventListener?.("ended", reopen);
        let capabilities = {};
        try { capabilities = track?.getCapabilities?.() || {}; } catch { capabilities = {}; }
        setTorchSupported(Boolean(capabilities.torch));
        // Nov 24 2026: a 2x zoom lets the phone stay farther back, where it can focus,
        // while the card still fills the frame.
        if (capabilities.zoom && Number(capabilities.zoom.max) >= 1.5) {
          const min = Number(capabilities.zoom.min) || 1;
          setZoomRange({ min, near: Math.min(Number(capabilities.zoom.max), Math.max(min, 2)) });
        }
        // Keep refocusing as the card moves closer (phones that allow it).
        if (capabilities.focusMode?.includes?.("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        setReady(true);
      } catch (cause) {
        if (active) setError(cause?.name === "NotAllowedError"
          ? "Camera access was not allowed. Allow the camera for Code 3 TCG in your phone settings, or take a photo instead."
          : "The camera could not start on this device. Take a photo or choose one instead.");
      }
    })();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", reopen);
      trackRef.current = null;
      stream?.getTracks().forEach((track) => { track.removeEventListener?.("ended", reopen); track.stop(); });
    };
  }, [streamKey]);

  function frameArea() {
    const video = videoRef.current, box = boxRef.current, frameEl = frameRef.current;
    if (!video?.videoWidth || !box || !frameEl) return null;
    const boxRect = box.getBoundingClientRect(), frameRect = frameEl.getBoundingClientRect();
    return frameToVideoRect({
      boxWidth: boxRect.width, boxHeight: boxRect.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      frame: { x: frameRect.left - boxRect.left, y: frameRect.top - boxRect.top, width: frameRect.width, height: frameRect.height },
    });
  }

  // The found card (fractions of the padded view) as a box on screen, for the outline.
  function outlineOf(padded, card, isReady) {
    const video = videoRef.current, box = boxRef.current;
    if (!video?.videoWidth || !box || !padded || !card) return null;
    const boxRect = box.getBoundingClientRect();
    const shown = videoToBoxRect({
      boxWidth: boxRect.width, boxHeight: boxRect.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      rect: { x: padded.x + card.x * padded.width, y: padded.y + card.y * padded.height, width: card.w * padded.width, height: card.h * padded.height },
    });
    return { x: Math.round(shown.x), y: Math.round(shown.y), width: Math.round(shown.width), height: Math.round(shown.height), tilt: card.tilt || 0, ready: Boolean(isReady) };
  }

  // useCard: cut to the card found in the last look (manual and auto), else the frame.
  // Nov 26 2026: a few pictures in a row, and the one whose name and number are
  // sharpest is kept. A hand never holds quite still, and a single video frame
  // caught mid-wobble is a usual reason a lined-up card cannot be read.
  async function capture({ useCard = true, sameCardGuard = false } = {}) {
    const video = videoRef.current;
    const frame = frameArea();
    if (!frame || busyRef.current) return;
    const look = viewRef.current;
    const area = useCard && look?.card && !look.card.sideways ? captureRect({ padded: look.padded, frame, card: look.card }) : frame;
    busyRef.current = true;
    setBusy(true);
    buzz();
    const shots = [];
    try {
      const width = Math.round(area.width), height = Math.round(area.height);
      const strips = textStripRows(height, slab);
      const scores = [];
      for (let shot = 0; shot < CAMERA_ASSIST.burstFrames; shot += 1) {
        if (shot) await new Promise((resolve) => { setTimeout(resolve, CAMERA_ASSIST.burstGapMs); });
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (area.tilt) {
          // A card held at a slant: the picture is turned so the card reaches the reader upright.
          // What is drawn is the upright box that holds the whole slanted card, turned back about its centre.
          const angle = (-area.tilt * Math.PI) / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
          const boxWidth = area.width * cos + area.height * sin, boxHeight = area.width * sin + area.height * cos;
          const centreX = area.x + area.width / 2, centreY = area.y + area.height / 2;
          context.fillStyle = "#808080";
          context.fillRect(0, 0, width, height);
          context.translate(width / 2, height / 2);
          context.rotate(angle);
          context.imageSmoothingQuality = "high";
          context.drawImage(video, centreX - boxWidth / 2, centreY - boxHeight / 2, boxWidth, boxHeight, -boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
          context.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          context.drawImage(video, area.x, area.y, area.width, area.height, 0, 0, width, height);
        }
        shots.push(canvas);
        let score = 0;
        try {
          for (const strip of strips) score += edgeSharpness(toGray(context.getImageData(0, strip.y, width, strip.h).data), width, strip.h);
        } catch { score = 0; /* A picture that cannot be measured is still a picture. */ }
        scores.push(score);
      }
      const best = shots[Math.max(0, sharpestOf(scores))];
      const blob = await new Promise((resolve) => best.toBlob(resolve, "image/jpeg", 0.92));
      setCaptureError("");
      if (blob) await onCapture?.(new File([blob], slab ? "slab-scan.jpg" : "card-scan.jpg", { type: "image/jpeg" }), { sameCardGuard });
    } catch {
      // Nov 24 2026: a failed read used to leave the camera stuck on "Reading…" with no word why.
      setCaptureError(`That picture could not be read. Hold the ${slab ? "slab" : "card"} in the frame and try again.`);
    } finally {
      for (const canvas of shots) { canvas.width = 0; canvas.height = 0; }
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Look at the frame plus a margin a few times a second: find the card, check
  // glare and focus, and show a tip. With auto-scan on, take the picture once a
  // ready card has held still for about a second. After a picture, the view has
  // to change (a new card) before it fires again.
  const captureRef = useRef(null);
  useEffect(() => { captureRef.current = capture; });
  useEffect(() => {
    if (!ready) return undefined;
    const tracker = createSteadyTracker({ holdFrames: 4, threshold: CAMERA_ASSIST.handShake });
    const sharpness = createSharpnessGate();
    const coach = createFocusCoach();
    const small = document.createElement("canvas");
    small.width = SAMPLE; small.height = SAMPLE;
    const smallContext = small.getContext("2d", { willReadFrequently: true });
    const look = document.createElement("canvas");
    const lookContext = look.getContext("2d", { willReadFrequently: true });
    const nextCard = createNextCardWatcher();
    let guardNext = false; // the next picture follows only a small change: it may be the same card
    let waitingForChange = false;
    let stillWithoutCard = 0;
    let previousCard = null;
    let usableStill = 0;
    const usableHold = CAMERA_ASSIST.steadyLooks - 4; // looks after the tracker's own 4-look hold
    let seenRetry = retryRef.current;
    const timer = setInterval(() => {
      if (retryRef.current !== seenRetry) {
        seenRetry = retryRef.current;
        if (waitingForChange) { waitingForChange = false; guardNext = false; setWaiting(false); tracker.reset(); stillWithoutCard = 0; usableStill = 0; }
      }
      const video = videoRef.current;
      const frame = frameArea();
      if (!frame || !smallContext || !lookContext || busyRef.current || document.hidden) return;
      const padded = padRect(frame, video.videoWidth, video.videoHeight);
      const width = ASSIST_WIDTH, height = Math.max(20, Math.round(ASSIST_WIDTH * (padded.height / padded.width)));
      if (look.width !== width || look.height !== height) { look.width = width; look.height = height; }
      lookContext.drawImage(video, padded.x, padded.y, padded.width, padded.height, 0, 0, width, height);
      const gray = toGray(lookContext.getImageData(0, 0, width, height).data);
      const view = assessCardView(gray, width, height, { sharp: sharpness.push(edgeSharpness(gray, width, height)), slab });
      // A box seen once can be a passing shadow or the art window; the same box twice is the card.
      const stableCard = sameCardBox(view.card, previousCard);
      previousCard = view.card;
      viewRef.current = { padded, card: view.card, ready: view.ready };
      // The tip says what to fix; a view that stays blurry gets a reason and the button that helps.
      const advice = coachTip(view, coach.push(view), { torchAvailable: torchSupportedRef.current, torchOn: torchRef.current, zoomAvailable: zoomRef.current.available, zoomed: zoomRef.current.zoomed, slab });
      setTip(advice.tip);
      setSuggest(advice.suggest);
      // The outline follows the card once it is found in the same place twice, and steps aside after a picture.
      const outline = view.card && stableCard && !waitingForChange ? outlineOf(padded, view.card, view.ready) : null;
      setFound((current) => (current && outline && current.x === outline.x && current.y === outline.y && current.width === outline.width && current.height === outline.height && current.tilt === outline.tilt && current.ready === outline.ready ? current : outline));
      if (!autoRef.current) { setSteady(0); return; }
      smallContext.drawImage(video, frame.x, frame.y, frame.width, frame.height, 0, 0, SAMPLE, SAMPLE);
      const sample = toGray(smallContext.getImageData(0, 0, SAMPLE, SAMPLE).data);
      if (waitingForChange) {
        // Nov 26 2026: stillness is counted while waiting as well. Swapping cards moves the view, which
        // starts the count again by itself, so a next card that is already being held still is taken on
        // the following look instead of a second later (about 1 s a card instead of 2).
        tracker.push(sample);
        const settledCard = view.card && !view.card.sideways && stableCard ? cardThumb(gray, width, height, view.card) : null;
        const change = nextCard.push(sample, settledCard, { cardFound: Boolean(view.card) });
        if (change) { waitingForChange = false; guardNext = change === "maybe-same"; setWaiting(false); stillWithoutCard = 0; usableStill = 0; }
        setSteady(0);
        return;
      }
      const still = tracker.push(sample);
      // No edges found: only an image with something in it (not a bare table) is taken.
      stillWithoutCard = !view.card && tracker.progress >= 1 && frameDetail(sample) >= CAMERA_ASSIST.minFrameDetail ? stillWithoutCard + 1 : 0;
      usableStill = view.usable && !view.ready && stableCard && still ? usableStill + 1 : 0;
      const readyToShoot = view.ready && stableCard && still;
      const heldLongEnough = usableStill >= usableHold;
      const fallback = !view.card && stillWithoutCard >= FALLBACK_HOLD - 4;
      setSteady(view.ready ? tracker.progress
        : view.usable ? Math.min(1, usableStill / usableHold) * 0.9
          : view.card ? 0 : Math.min(1, stillWithoutCard / (FALLBACK_HOLD - 4)) * 0.9);
      if (readyToShoot || heldLongEnough || fallback) {
        nextCard.start(sample, (readyToShoot || heldLongEnough) && view.card ? cardThumb(gray, width, height, view.card) : null);
        waitingForChange = true;
        setWaiting(true);
        tracker.reset();
        coach.reset();
        stillWithoutCard = 0;
        usableStill = 0;
        setSteady(0);
        void captureRef.current?.({ useCard: readyToShoot || heldLongEnough, sameCardGuard: guardNext });
        guardNext = false;
      }
    }, 250);
    return () => { clearInterval(timer); small.width = 0; look.width = 0; setSteady(0); setTip(""); setSuggest(""); setFound(null); setWaiting(false); viewRef.current = null; };
  }, [ready, slab]);

  async function toggleZoom() {
    const track = trackRef.current;
    if (!track || !zoomRange) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: zoomed ? zoomRange.min : zoomRange.near }] });
      setZoomed((value) => !value);
    } catch {
      setZoomRange(null);
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch((value) => !value);
    } catch {
      setTorchSupported(false);
    }
  }

  function toggleAuto() {
    setAuto((value) => {
      try { globalThis.localStorage?.setItem(AUTO_KEY, value ? "off" : "on"); } catch { /* Optional preference. */ }
      return !value;
    });
  }

  const what = slab ? "slab" : "card";
  const status = !ready || error ? "" : busy ? "Reading…" : captureError ? captureError : continuous && waiting && auto ? "Got it. Show the next card." : steady > 0 && auto ? `Hold still… ${Math.round(steady * 100)}%` : tip || (auto ? `Auto-scan on. Hold the ${what} in the frame.` : "");

  return <section className={slab ? "card-camera-frame card-camera-frame--slab" : "card-camera-frame"} ref={sectionRef} aria-label={slab ? "Slab camera" : "Card camera"}>
    <div className="card-camera-frame__view" ref={boxRef}>
      <video ref={videoRef} playsInline muted aria-hidden="true" />
      <div className={`card-camera-frame__guide${steady > 0 ? " is-steadying" : ""}`} ref={frameRef} aria-hidden="true" style={steady > 0 ? { "--steady": steady } : undefined}>{slab ? <span className="card-camera-frame__name">Label here</span> : <><span className="card-camera-frame__name">Name here</span><span className="card-camera-frame__number">Number here</span></>}</div>
      {found && ready && !error ? <div className={`card-camera-frame__found${found.ready ? " is-ready" : ""}`} aria-hidden="true" style={{ left: found.x, top: found.y, width: found.width, height: found.height, transform: found.tilt ? `rotate(${found.tilt}deg)` : undefined }} /> : null}
      {continuous && waiting && auto && ready ? <span className="card-camera-frame__got" aria-hidden="true">✓</span> : null}
      {!ready && !error ? <p className="card-camera-frame__status" role="status">Starting the camera…</p> : null}
      {error ? <p className="card-camera-frame__status" role="alert">{error}</p> : null}
    </div>
    {below}
    {below ? null : <p className="card-camera-frame__hint">{slab ? "Fit the whole slab in the frame, label at the top. Tilt it slightly to stop glare on the plastic." : "Hold the card upright, name at the top. It doesn't have to be exact: the camera finds the card's edges."}</p>}
    {status ? <p className="card-camera-frame__auto-status" role="status" aria-live="polite">{status}</p> : null}
    <div className="card-camera-frame__toggles">
      <button type="button" className="card-camera-frame__toggle" aria-pressed={auto} onClick={toggleAuto} disabled={!ready}>{auto ? "Auto-scan: on" : "Auto-scan: off"}</button>
      {zoomRange ? <button type="button" className={`card-camera-frame__toggle${suggest === "zoom" ? " is-suggested" : ""}`} aria-pressed={zoomed} onClick={toggleZoom}>{zoomed ? "Zoom: 2x" : "Zoom: 1x"}</button> : null}
      {torchSupported ? <button type="button" className={`card-camera-frame__toggle${suggest === "torch" ? " is-suggested" : ""}`} aria-pressed={torch} onClick={toggleTorch}>{torch ? "Flashlight: on" : "Flashlight: off"}</button> : null}
    </div>
    <div className="card-camera-frame__actions">
      <button type="button" className="card-camera-frame__shutter" onClick={() => capture()} disabled={!ready || busy}>{busy ? "Reading…" : slab ? "Scan this slab" : "Scan this card"}</button>
      {continuous ? null : <button type="button" className="card-camera-frame__cancel" onClick={onCancel}>Close camera</button>}
    </div>
  </section>;
}
