import { useEffect, useRef, useState } from "react";
import "./card-camera-frame.css";
import { frameToVideoRect } from "../utils/cardCameraFrame.mjs";

// Live camera with a card-shaped frame (Nov 17 2026). Lining the card up in the
// frame gives the card reader an upright, full-size card, which is what makes
// reading reliable on busy tables and at odd angles. Only the area inside the
// frame is captured; the camera stream stops as soon as this closes.
export default function CardCameraFrame({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

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
        setReady(true);
      } catch (cause) {
        if (active) setError(cause?.name === "NotAllowedError"
          ? "Camera access was not allowed. Allow the camera for Code 3 TCG in your phone settings, or take a photo instead."
          : "The camera could not start on this device. Take a photo or choose one instead.");
      }
    })();
    return () => { active = false; stream?.getTracks().forEach((track) => track.stop()); };
  }, []);

  async function capture() {
    const video = videoRef.current, box = boxRef.current, frameEl = frameRef.current;
    if (!video?.videoWidth || !box || !frameEl || busy) return;
    setBusy(true);
    try {
      const boxRect = box.getBoundingClientRect(), frameRect = frameEl.getBoundingClientRect();
      const area = frameToVideoRect({
        boxWidth: boxRect.width, boxHeight: boxRect.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        frame: { x: frameRect.left - boxRect.left, y: frameRect.top - boxRect.top, width: frameRect.width, height: frameRect.height },
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(area.width);
      canvas.height = Math.round(area.height);
      canvas.getContext("2d").drawImage(video, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      canvas.width = 0; canvas.height = 0;
      if (blob) await onCapture?.(new File([blob], "card-scan.jpg", { type: "image/jpeg" }));
    } finally {
      setBusy(false);
    }
  }

  return <section className="card-camera-frame" aria-label="Card camera">
    <div className="card-camera-frame__view" ref={boxRef}>
      <video ref={videoRef} playsInline muted aria-hidden="true" />
      <div className="card-camera-frame__guide" ref={frameRef} aria-hidden="true"><span className="card-camera-frame__name">Name here</span><span className="card-camera-frame__number">Number here</span></div>
      {!ready && !error ? <p className="card-camera-frame__status" role="status">Starting the camera…</p> : null}
      {error ? <p className="card-camera-frame__status" role="alert">{error}</p> : null}
    </div>
    <p className="card-camera-frame__hint">Hold the card upright inside the frame, name at the top. Avoid glare on the card.</p>
    <div className="card-camera-frame__actions">
      <button type="button" className="card-camera-frame__shutter" onClick={capture} disabled={!ready || busy}>{busy ? "Reading…" : "Scan this card"}</button>
      <button type="button" className="card-camera-frame__cancel" onClick={onCancel}>Close camera</button>
    </div>
  </section>;
}
