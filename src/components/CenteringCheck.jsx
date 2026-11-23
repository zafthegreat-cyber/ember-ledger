import { lazy, Suspense, useMemo, useState } from "react";
import { centeringRatios, centeringSummary, detectCardBorders, ratioLabel } from "../utils/cardCentering.mjs";
import "./centering-check.css";

const CardCameraFrame = lazy(() => import("./CardCameraFrame.jsx"));

// Centering check (Nov 19 2026): measures the borders in a photo of the card on
// this device. The lines are found automatically and can be dragged with the
// sliders. Centering is one part of a grade; this is not a grade prediction.

const LINES = [
  ["outer", "left", "Card edge, left"], ["inner", "left", "Border end, left"],
  ["inner", "right", "Border end, right"], ["outer", "right", "Card edge, right"],
  ["outer", "top", "Card edge, top"], ["inner", "top", "Border end, top"],
  ["inner", "bottom", "Border end, bottom"], ["outer", "bottom", "Card edge, bottom"],
];
const MAX_SIDE = 640;

async function measureFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("decode"));
      element.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let index = 0; index < gray.length; index += 1) gray[index] = (pixels[index * 4] * 3 + pixels[index * 4 + 1] * 6 + pixels[index * 4 + 2]) / 10;
    const preview = canvas.toDataURL("image/jpeg", 0.85);
    canvas.width = 0;
    return { preview, edges: detectCardBorders(gray, width, height), aspect: width / height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CenteringCheck({ onUseResult }) {
  const [side, setSide] = useState("front");
  const [camera, setCamera] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [edges, setEdges] = useState(null);
  const [status, setStatus] = useState("");


  async function readPhoto(file) {
    if (!file || !String(file.type).startsWith("image/")) { setStatus("Choose a photo of the card."); return; }
    setStatus("Measuring…");
    try {
      const result = await measureFile(file);
      setPhoto({ src: result.preview, aspect: result.aspect });
      setEdges(result.edges);
      setStatus("Check the lines sit on the card edge and where the border ends. Adjust them below if not.");
    } catch {
      setStatus("That photo could not be read. Try another one.");
    }
  }

  const ratios = useMemo(() => (edges ? centeringRatios(edges) : null), [edges]);
  const summary = ratios ? centeringSummary(ratios, side) : [];
  const resultText = ratios ? `Centering (${side}, measured from a photo): left/right ${ratioLabel(ratios.lr)}, top/bottom ${ratioLabel(ratios.tb)}. Centering guides: ${summary.join("; ")}.` : "";

  const setLine = (group, key, value) => setEdges((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));

  return (
    <section className="centering-check" aria-label="Centering check">
      <div className="centering-check__head">
        <strong>Centering check</strong>
        <p>Measure the borders from a straight-on photo of the card. Plain background, no sleeve glare.</p>
      </div>
      <div className="centering-check__side" role="group" aria-label="Which side">
        {["front", "back"].map((value) => (
          <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)}>{value === "front" ? "Front" : "Back"}</button>
        ))}
      </div>
      {camera ? (
        <Suspense fallback={<p role="status">Opening the camera…</p>}>
          <CardCameraFrame onCancel={() => setCamera(false)} onCapture={async (file) => { setCamera(false); await readPhoto(file); }} />
        </Suspense>
      ) : (
        <div className="centering-check__inputs">
          <button type="button" className="secondary-button" onClick={() => setCamera(true)}>Use the card camera</button>
          <label className="secondary-button file-action-label">
            Choose a photo
            <input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0])} />
          </label>
        </div>
      )}
      {status ? <p className="centering-check__status" role="status">{status}</p> : null}
      {photo && edges ? (
        <>
          <div className="centering-check__photo" style={{ aspectRatio: String(photo.aspect) }}>
            <img src={photo.src} alt="Card photo used for the centering check" />
            {LINES.map(([group, key]) => {
              const vertical = key === "left" || key === "right";
              const value = edges[group][key];
              return <span key={`${group}-${key}`} aria-hidden="true" className={`centering-check__line is-${group} ${vertical ? "is-vertical" : "is-horizontal"}`} style={vertical ? { left: `${value * 100}%` } : { top: `${value * 100}%` }} />;
            })}
          </div>
          <div className="centering-check__result" role="status" aria-live="polite">
            <div><small>Left / right</small><strong>{ratioLabel(ratios.lr)}</strong></div>
            <div><small>Top / bottom</small><strong>{ratioLabel(ratios.tb)}</strong></div>
          </div>
          <ul className="centering-check__guides">
            {summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="centering-check__note">Compared with the centering guides PSA, BGS and CGC publish for the {side}. Centering is only one part of a grade; corners, edges and surface count too, and the companies can change their guides.</p>
          <details className="centering-check__adjust">
            <summary>Adjust the lines</summary>
            {LINES.map(([group, key, label]) => (
              <label key={`${group}-${key}`}>
                <span>{label}</span>
                <input type="range" min="0" max="1000" value={Math.round(edges[group][key] * 1000)} onChange={(event) => setLine(group, key, Number(event.target.value) / 1000)} />
              </label>
            ))}
          </details>
          {onUseResult ? <button type="button" className="primary-button" onClick={() => onUseResult(resultText)}>Add to notes</button> : null}
        </>
      ) : null}
    </section>
  );
}
