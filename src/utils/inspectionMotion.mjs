import { inspectionPose } from "./productInspection.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A vertical touch belongs to page scrolling. Capture only a deliberate
// horizontal turn, leaving pinch zoom and accidental taps to the browser.
export function inspectionGesture(dx, dy, pointerType = "mouse") {
  if (pointerType !== "touch") return "turn";
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return "pending";
  return Math.abs(dy) > Math.abs(dx) * 1.15 ? "scroll" : "turn";
}

export function inspectionTurn(from, target) {
  const delta = inspectionPose(target.yaw - from.yaw).yaw;
  // A half-turn has two equally short paths. Keep repeated face taps predictable.
  const yaw = from.yaw + (delta === -180 ? 180 : delta);
  const distance = Math.max(Math.abs(yaw - from.yaw), Math.abs(target.pitch - from.pitch));
  if (distance < .01) return null;
  return { from: { ...from }, to: { yaw, pitch: target.pitch }, duration: Math.min(340, 150 + distance) };
}

export function inspectionTurnFrame(turn, elapsed) {
  const progress = clamp(Number.isFinite(elapsed) ? elapsed / turn.duration : 0, 0, 1);
  const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
  return {
    yaw: turn.from.yaw + (turn.to.yaw - turn.from.yaw) * eased,
    pitch: turn.from.pitch + (turn.to.pitch - turn.from.pitch) * eased,
    done: progress === 1,
  };
}

export function inspectionLightFrame(current, target, elapsed = 16) {
  const alpha = 1 - Math.exp(-clamp(Number.isFinite(elapsed) ? elapsed : 16, 1, 32) / 55);
  const x = current.x + (target.x - current.x) * alpha;
  const y = current.y + (target.y - current.y) * alpha;
  const done = Math.abs(x - target.x) + Math.abs(y - target.y) < .08;
  return done ? { ...target, done } : { x, y, done };
}

export function inspectionDetailSize(width, profile, dimensions) {
  if (!Number.isFinite(width) || width <= 0) return null;
  const box = profile === "box";
  const objectWidth = Math.max(100, Math.min(box ? 320 : 340, box ? width * .78 : width - 16));
  const packRatio = dimensions?.width > 0 && dimensions?.height > 0 ? dimensions.height / dimensions.width : 1.846;
  return { width: objectWidth, height: Math.ceil(objectWidth * (box ? 1.2 : profile === "pack" ? packRatio : 1.4) + (box ? 50 : 40)) };
}

// Fit the entire rotating package, including tall bundles and portrait cartons.
// A sphere around its eight corners bounds every yaw/pitch. Account for the
// stage's 1100px perspective so a near corner cannot be clipped during a turn.
export function inspectionBoxViewport(width, dimensions, detail = false) {
  if (!Number.isFinite(width) || width <= 0 || !dimensions || ![dimensions.width, dimensions.height, dimensions.depth].every(value => Number.isFinite(value) && value > 0)) return null;
  const diagonal = Math.hypot(1, dimensions.height / dimensions.width, dimensions.depth / dimensions.width);
  const available = Math.max(1, width - 24), perspective = 1100;
  const maxWidth = available / (diagonal * Math.sqrt(1 + (available / (2 * perspective)) ** 2));
  const objectWidth = Math.min(detail ? 320 : 250, width * (detail ? .82 : .58), maxWidth);
  const radius = objectWidth * diagonal / 2;
  const projectedDiameter = 2 * radius * perspective / Math.sqrt(perspective ** 2 - radius ** 2);
  return { width: objectWidth, height: Math.ceil(projectedDiameter + 28) };
}
