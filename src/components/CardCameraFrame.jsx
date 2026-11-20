import { useEffect, useRef, useState } from "react";
import "./card-camera-frame.css";
import { frameToVideoRect } from "../utils/cardCameraFrame.mjs";
import { createSteadyTracker, frameDifference } from "../utils/scannerExtras.mjs";

// Live camera with a card-shaped frame (Nov 17 2026). Lining the card up in the
// frame gives the card reader an upright, full-size card, which is what makes
// reading reliable on busy tables and at odd angles. Only the area inside the
// frame is captured; the camera stream stops as soon as this closes.
// slab: a taller graded-slab frame with the label at the top.
// Nov 19 2026: flashlight button, auto-scan once the card is held still, and a
// short buzz when a picture is taken.

const AUTO_KEY = "code3.scanner.autoCapture.v1";
const SAMPLE = 32;

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
  const [steady, setSteady] = useState(0);

  useEffect(() => {
    let stream;
    let active = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const track = stream.getVideoTracks?.()[0];
        trackRef.current = track || null;
        try { setTorchSupported(Boolean(track?.getCapabilities?.().torch)); } catch { setTorchSupported(false); }
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

  async function capture() {
    const video = videoRef.current;
    const area = frameArea();
    if (!area || busyRef.current) return;
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

  // Auto-scan: sample the framed area a few times a second; once it has held
  // still for about a second, take the picture. After a picture, the view has
  // to change (a new card) before it fires again.
  const captureRef = useRef(null);
  useEffect(() => { captureRef.current = capture; });
  useEffect(() => {
    if (!ready || !auto) return undefined;
    const tracker = createSteadyTracker({ holdFrames: 4 });
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE; canvas.height = SAMPLE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let lastShot = null;
    let waitingForChange = false;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const area = frameArea();
      if (!area || !context || busyRef.current || document.hidden) return;
      context.drawImage(video, area.x, area.y, area.width, area.height, 0, 0, SAMPLE, SAMPLE);
      const pixels = context.getImageData(0, 0, SAMPLE, SAMPLE).data;
      const gray = new Uint8Array(SAMPLE * SAMPLE);
      for (let index = 0; index < gray.length; index += 1) gray[index] = (pixels[index * 4] * 3 + pixels[index * 4 + 1] * 6 + pixels[index * 4 + 2]) / 10;
      if (waitingForChange) {
        if (frameDifference(lastShot, gray) > 18) { waitingForChange = false; tracker.reset(); }
        setSteady(0);
        return;
      }
      const fire = tracker.push(gray);
      setSteady(tracker.progress);
      if (fire) {
        lastShot = gray;
        waitingForChange = true;
        tracker.reset();
        setSteady(0);
        void captureRef.current?.();
      }
    }, 250);
    return () => { clearInterval(timer); canvas.width = 0; setSteady(0); };
  }, [ready, auto]);

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
  const status = !ready || error ? "" : busy ? "Reading…" : auto ? (steady > 0 ? `Hold still… ${Math.round(steady * 100)}%` : `Auto-scan on. Hold the ${what} still in the frame.`) : "";

  return <section className={slab ? "card-camera-frame card-camera-frame--slab" : "card-camera-frame"} aria-label={slab ? "Slab camera" : "Card camera"}>
    <div className="card-camera-frame__view" ref={boxRef}>
      <video ref={videoRef} playsInline muted aria-hidden="true" />
      <div className={`card-camera-frame__guide${steady > 0 ? " is-steadying" : ""}`} ref={frameRef} aria-hidden="true" style={steady > 0 ? { "--steady": steady } : undefined}>{slab ? <span className="card-camera-frame__name">Label here</span> : <><span className="card-camera-frame__name">Name here</span><span className="card-camera-frame__number">Number here</span></>}</div>
      {!ready && !error ? <p className="card-camera-frame__status" role="status">Starting the camera…</p> : null}
      {error ? <p className="card-camera-frame__status" role="alert">{error}</p> : null}
    </div>
    <p className="card-camera-frame__hint">{slab ? "Fit the whole slab in the frame, label at the top. Tilt it slightly to stop glare on the plastic." : "Hold the card upright inside the frame, name at the top. Avoid glare on the card."}</p>
    {status ? <p className="card-camera-frame__auto-status" role="status" aria-live="polite">{status}</p> : null}
    <div className="card-camera-frame__toggles">
      <button type="button" className="card-camera-frame__toggle" aria-pressed={auto} onClick={toggleAuto} disabled={!ready}>{auto ? "Auto-scan: on" : "Auto-scan: off"}</button>
      {torchSupported ? <button type="button" className="card-camera-frame__toggle" aria-pressed={torch} onClick={toggleTorch}>{torch ? "Flashlight: on" : "Flashlight: off"}</button> : null}
    </div>
    <div className="card-camera-frame__actions">
      <button type="button" className="card-camera-frame__shutter" onClick={capture} disabled={!ready || busy}>{busy ? "Reading…" : slab ? "Scan this slab" : "Scan this card"}</button>
      <button type="button" className="card-camera-frame__cancel" onClick={onCancel}>Close camera</button>
    </div>
  </section>;
}
