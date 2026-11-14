import { cameraFailureMessage } from "../utils/scannerPresentation.mjs";
import { useEffect, useRef, useState } from "react";
import "./ui-workflow-details.css";

const loadReader = () => import("@zxing/browser");

export default function BarcodeScanner({ onScan, onClose, title = "Scan barcode", helper = "Point your camera at the barcode. Use good lighting and hold the barcode flat.", readyLabel = "", manualLabel = "Enter manually", readerLoader = loadReader }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("starting");
  const [retry, setRetry] = useState(0);
  const [deviceId, setDeviceId] = useState("");
  const [cameras, setCameras] = useState([]);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [controlNotice, setControlNotice] = useState("");
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => {
    let active = true;
    let decoded = false;
    let ownControls;
    async function start() {
      setError(""); setStatus("starting"); setTorch(false); setTorchSupported(false); setControlNotice("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser. Enter the barcode manually.");
        if (window.isSecureContext === false) throw new Error("A secure HTTPS connection is required.");
        const { BrowserMultiFormatReader } = await readerLoader();
        if (!active) return;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 1500 });
        const result = value => {
          const text = String(value?.getText?.() || "").trim();
          if (!text || !active || decoded) return;
          decoded = true; setStatus("found");
          try { navigator.vibrate?.(40); } catch { /* Optional feedback. */ }
          ownControls?.stop(); onScanRef.current?.(text);
        };
        try {
          ownControls = await reader.decodeFromConstraints({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }, videoRef.current, result);
        } catch (failure) {
          if (!active || deviceId || failure?.name === "NotAllowedError") throw failure;
          ownControls = await reader.decodeFromVideoDevice(undefined, videoRef.current, result);
        }
        if (!active || decoded) { ownControls?.stop(); return; }
        controlsRef.current = ownControls;
        setStatus("scanning");
        setTorchSupported(typeof ownControls.switchTorch === "function");
        const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []);
        if (active) setCameras((devices || []).filter(device => device.kind === "videoinput"));
      } catch (failure) {
        if (active) { setError(cameraFailureMessage(failure)); setStatus("error"); }
      }
    }
    void start();
    return () => { active = false; ownControls?.stop(); if (controlsRef.current === ownControls) controlsRef.current = null; };
  }, [retry, deviceId, readerLoader]);
  async function toggleTorch() {
    if (torchBusy || !controlsRef.current?.switchTorch) return;
    setTorchBusy(true); setControlNotice("");
    try { await controlsRef.current.switchTorch(!torch); setTorch(value => !value); }
    catch { setControlNotice("The flashlight could not be changed. Try brighter lighting."); }
    finally { setTorchBusy(false); }
  }
  return <section className="panel scanner-camera-panel">
    <h2>{title}</h2>
    <strong className="scanner-ready-label" role="status" aria-live="polite">{status === "starting" ? "Starting camera…" : status === "found" ? "Barcode found. Looking it up…" : status === "error" ? "Camera unavailable" : readyLabel || "Camera on. Looking for a barcode…"}</strong>
    {error ? <div className="scanner-camera-empty"><p role="alert">{error}</p><button type="button" className="primary-button scanner-camera-retry" onClick={() => setRetry(value => value + 1)}>Try camera again</button></div> : <><p>{helper}</p><video ref={videoRef} autoPlay muted playsInline className="scanner-video" /></>}
    <div className="scanner-device-controls">
      {cameras.length > 1 && <label>Camera<select value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">Automatic back camera</option>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label>}
      {torchSupported && !error && <button type="button" className="secondary-button" disabled={torchBusy} aria-pressed={torch} onClick={toggleTorch}>{torch ? "Turn flashlight off" : "Turn flashlight on"}</button>}
      <button type="button" className="secondary-button scanner-camera-help" onClick={onClose}>{manualLabel}</button>
    </div>
    {controlNotice && <p role="status">{controlNotice}</p>}
  </section>;
}
