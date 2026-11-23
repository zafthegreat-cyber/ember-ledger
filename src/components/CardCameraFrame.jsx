import { useEffect, useRef, useState } from "react";
import "./card-camera-frame.css";
import { frameToVideoRect } from "../utils/cardCameraFrame.mjs";
import { createSteadyTracker, frameDifference } from "../utils/scannerExtras.mjs";
import { assessCardView, captureRect, createSharpnessGate, edgeSharpness, padRect, toGray } from "../utils/cardCameraAssist.mjs";

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

export default function CardCameraFrame({ onCapture, onCancel, slab = false }) {
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
  const [auto, setAuto] = useState(readAutoPreference);
  const autoRef = useRef(auto);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  const [steady, setSteady] = useState(0);
  const [tip, setTip] = useState("");
  const viewRef = useRef(null); // last look: { padded, card, ready }
  const sectionRef = useRef(null);
  // On a phone the camera opens below the fold; bring it into view.
  useEffect(() => { try { sectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }); } catch { /* Optional. */ } }, []);

  useEffect(() => {
    let stream;
    let active = true;
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
        let capabilities = {};
        try { capabilities = track?.getCapabilities?.() || {}; } catch { capabilities = {}; }
        setTorchSupported(Boolean(capabilities.torch));
        // Keep refocusing as the card moves closer (phones that allow it).
        if (capabilities.focusMode?.includes?.("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        setReady(true);
      } catch (cause) {
        if (active) setError(cause?.name === "NotAllowedError"
          ? "Camera access was not allowed. Allow the camera for Code 3 TCG in your phone settings, or take a photo instead."
          : "The camera could not start on this device. Take a photo or choose one instead.");
      }
    })();
    return () => { active = false; trackRef.current = null; stream?.getTracks().forEach((track) => track.stop()); };
  }, []);

  function frameArea() {
    const video = videoRef.current, box = boxRef.current, frameEl = frameRef.current;
    if (!video?.videoWidth || !box || !frameEl) return null;
    const boxRect = box.getBoundingClientRect(), frameRect = frameEl.getBoundingClientRect();
    return frameToVideoRect({
      boxWidth: boxRect.width, boxHeight: boxRect.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      frame: { x: frameRect.left - boxRect.left, y: frameRect.top - boxRect.top, width: frameRect.width, height: frameRect.height },
    });
  }

  // useCard: cut to the card found in the last look (manual and auto), else the frame.
  async function capture({ useCard = true } = {}) {
    const video = videoRef.current;
    const frame = frameArea();
    if (!frame || busyRef.current) return;
    const look = viewRef.current;
    const area = useCard && look?.card && !look.card.sideways ? captureRect({ padded: look.padded, frame, card: look.card }) : frame;
    busyRef.current = true;
    setBusy(true);
    buzz();
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(area.width);
      canvas.height = Math.round(area.height);
      canvas.getContext("2d").drawImage(video, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      canvas.width = 0; canvas.height = 0;
      if (blob) await onCapture?.(new File([blob], slab ? "slab-scan.jpg" : "card-scan.jpg", { type: "image/jpeg" }));
    } finally {
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
    const tracker = createSteadyTracker({ holdFrames: 4 });
    const sharpness = createSharpnessGate();
    const small = document.createElement("canvas");
    small.width = SAMPLE; small.height = SAMPLE;
    const smallContext = small.getContext("2d", { willReadFrequently: true });
    const look = document.createElement("canvas");
    const lookContext = look.getContext("2d", { willReadFrequently: true });
    let lastShot = null;
    let waitingForChange = false;
    let stillWithoutCard = 0;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const frame = frameArea();
      if (!frame || !smallContext || !lookContext || busyRef.current || document.hidden) return;
      const padded = padRect(frame, video.videoWidth, video.videoHeight);
      const width = ASSIST_WIDTH, height = Math.max(20, Math.round(ASSIST_WIDTH * (padded.height / padded.width)));
      if (look.width !== width || look.height !== height) { look.width = width; look.height = height; }
      lookContext.drawImage(video, padded.x, padded.y, padded.width, padded.height, 0, 0, width, height);
      const gray = toGray(lookContext.getImageData(0, 0, width, height).data);
      const view = assessCardView(gray, width, height, { sharp: sharpness.push(edgeSharpness(gray, width, height)), slab });
      viewRef.current = { padded, card: view.card, ready: view.ready };
      setTip(view.tip);
      if (!autoRef.current) { setSteady(0); return; }
      smallContext.drawImage(video, frame.x, frame.y, frame.width, frame.height, 0, 0, SAMPLE, SAMPLE);
      const sample = toGray(smallContext.getImageData(0, 0, SAMPLE, SAMPLE).data);
      if (waitingForChange) {
        if (frameDifference(lastShot, sample) > 18) { waitingForChange = false; tracker.reset(); stillWithoutCard = 0; }
        setSteady(0);
        return;
      }
      const still = tracker.push(sample);
      stillWithoutCard = !view.card && tracker.progress >= 1 ? stillWithoutCard + 1 : 0;
      const readyToShoot = view.ready && still;
      const fallback = !view.card && stillWithoutCard >= FALLBACK_HOLD - 4;
      setSteady(view.ready ? tracker.progress : view.card ? 0 : Math.min(1, stillWithoutCard / (FALLBACK_HOLD - 4)) * 0.9);
      if (readyToShoot || fallback) {
        lastShot = sample;
        waitingForChange = true;
        tracker.reset();
        stillWithoutCard = 0;
        setSteady(0);
        void captureRef.current?.({ useCard: readyToShoot });
      }
    }, 250);
    return () => { clearInterval(timer); small.width = 0; look.width = 0; setSteady(0); setTip(""); viewRef.current = null; };
  }, [ready, slab]);

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
  const status = !ready || error ? "" : busy ? "Reading…" : steady > 0 && auto ? `Hold still… ${Math.round(steady * 100)}%` : tip || (auto ? `Auto-scan on. Hold the ${what} in the frame.` : "");

  return <section className={slab ? "card-camera-frame card-camera-frame--slab" : "card-camera-frame"} ref={sectionRef} aria-label={slab ? "Slab camera" : "Card camera"}>
    <div className="card-camera-frame__view" ref={boxRef}>
      <video ref={videoRef} playsInline muted aria-hidden="true" />
      <div className={`card-camera-frame__guide${steady > 0 ? " is-steadying" : ""}`} ref={frameRef} aria-hidden="true" style={steady > 0 ? { "--steady": steady } : undefined}>{slab ? <span className="card-camera-frame__name">Label here</span> : <><span className="card-camera-frame__name">Name here</span><span className="card-camera-frame__number">Number here</span></>}</div>
      {!ready && !error ? <p className="card-camera-frame__status" role="status">Starting the camera…</p> : null}
      {error ? <p className="card-camera-frame__status" role="alert">{error}</p> : null}
    </div>
    <p className="card-camera-frame__hint">{slab ? "Fit the whole slab in the frame, label at the top. Tilt it slightly to stop glare on the plastic." : "Hold the card upright, name at the top. It doesn't have to be exact: the camera finds the card's edges."}</p>
    {status ? <p className="card-camera-frame__auto-status" role="status" aria-live="polite">{status}</p> : null}
    <div className="card-camera-frame__toggles">
      <button type="button" className="card-camera-frame__toggle" aria-pressed={auto} onClick={toggleAuto} disabled={!ready}>{auto ? "Auto-scan: on" : "Auto-scan: off"}</button>
      {torchSupported ? <button type="button" className="card-camera-frame__toggle" aria-pressed={torch} onClick={toggleTorch}>{torch ? "Flashlight: on" : "Flashlight: off"}</button> : null}
    </div>
    <div className="card-camera-frame__actions">
      <button type="button" className="card-camera-frame__shutter" onClick={() => capture()} disabled={!ready || busy}>{busy ? "Reading…" : slab ? "Scan this slab" : "Scan this card"}</button>
      <button type="button" className="card-camera-frame__cancel" onClick={onCancel}>Close camera</button>
    </div>
  </section>;
}
