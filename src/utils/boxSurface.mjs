const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const radians = value => (Number.isFinite(value) ? value : 0) * Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const unit = vector => { const length = Math.hypot(...vector); return vector.map(value => value / length); };

// Face axes match the CSS transforms, including the opposite top/bottom UVs.
const faces = {
  front: [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  back: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  left: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  right: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  top: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  bottom: [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
};

// Modest studio shading on photographed shrink wrap. The same world-space light
// reaches every face; the box never inherits card foil or a fixed side stripe.
export function boxLighting(yaw = 0, pitch = 0, pointer = { x: 42, y: 38 }) {
  const y = radians(yaw), p = radians(pitch);
  const rotate = ([x, v, z]) => {
    const a = x * Math.cos(y) + z * Math.sin(y), b = -x * Math.sin(y) + z * Math.cos(y);
    return [a, v * Math.cos(p) - b * Math.sin(p), v * Math.sin(p) + b * Math.cos(p)];
  };
  const px = Number.isFinite(pointer?.x) ? clamp(pointer.x, 0, 100) : 42;
  const py = Number.isFinite(pointer?.y) ? clamp(pointer.y, 0, 100) : 38;
  const lamp = unit([-.5 + (px - 50) * .004, -.65 + (py - 50) * .004, 1]);
  const half = unit([lamp[0], lamp[1], lamp[2] + 1]);
  return Object.fromEntries(Object.entries(faces).map(([name, [normal, horizontal, vertical]]) => {
    const n = rotate(normal), diffuse = Math.max(0, dot(n, lamp));
    const reflection = Math.max(0, dot(n, half));
    return [name, {
      shade: .025 + (1 - diffuse) * .18,
      gloss: .012 + Math.pow(reflection, 20) * .085,
      x: clamp(50 + dot(rotate(horizontal), half) * 125, -60, 160),
      y: clamp(50 + dot(rotate(vertical), half) * 125, -60, 160),
    }];
  }));
}

// Project the actual eight corners, so the shadow follows the lower silhouette
// through side/top turns instead of remaining far beneath a floating box.
export function boxShadow(yaw = 0, pitch = 0, dimensions = {}) {
  const y = radians(yaw), p = radians(pitch);
  const width = Number(dimensions.width) > 0 ? Number(dimensions.width) : 18.4;
  const height = Number(dimensions.height) > 0 ? Number(dimensions.height) / width : 16.3 / 18.4;
  const depth = Number(dimensions.depth) > 0 ? Number(dimensions.depth) / width : 8.5 / 18.4;
  const points = [];
  for (const x of [-.5, .5]) for (const v of [-height / 2, height / 2]) for (const z of [-depth / 2, depth / 2]) {
    const a = x * Math.cos(y) + z * Math.sin(y), b = -x * Math.sin(y) + z * Math.cos(y);
    points.push([a, v * Math.cos(p) - b * Math.sin(p)]);
  }
  return { span: Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])), bottom: Math.max(...points.map(point => point[1])) };
}
