const finitePositive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const ROW_UV = Object.freeze([0, .055, .14, .86, .945, 1]);
const BULGE = Object.freeze([0, 0, 1, 1, 0, 0]);
const degrees = radians => radians * 180 / Math.PI;

// Presentation-only wrapper geometry. It maps the original photographed UVs
// exactly once over shallow planar strips; it never creates or edits artwork.
// A single broad center keeps printed text continuous; only the two shoulders
// bend into the narrow, flat crimp bands.
// Coordinates are in pixels: origin at object center, +y down, +z toward viewer.
export function wrapperGeometry({ width, height, depth = width * .022, endDepth = .6 } = {}) {
  if (![width, height, depth, endDepth].every(finitePositive)) return null;
  const seamDepth = Math.min(endDepth, depth), halfDepth = depth / 2, seamHalf = seamDepth / 2;
  const boundaries = ROW_UV.map((v, index) => ({
    v, y: (v - .5) * height, halfDepth: seamHalf + (halfDepth - seamHalf) * BULGE[index],
  }));
  const rows = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1], dy = end.y - start.y, dz = end.halfDepth - start.halfDepth;
    const length = Math.hypot(dy, dz), centerY = (start.y + end.y) / 2, centerZ = (start.halfDepth + end.halfDepth) / 2;
    const angle = degrees(Math.atan2(dz, dy)), textureHeight = length / (end.v - start.v);
    return {
      index, v0: start.v, v1: end.v, y0: start.y, y1: end.y, centerY,
      length, projectedHeight: dy, halfDepth0: start.halfDepth, halfDepth1: end.halfDepth,
      textureHeight, textureOffsetY: -start.v * textureHeight,
      uv: [[0, start.v], [1, start.v], [1, end.v], [0, end.v]],
      // CSS order: translate to center, rotateX(angle), then rotateY.
      // Back therefore negates rotateX; it does not reverse UVs or mirror text.
      front: {
        centerZ, rotateX: angle, rotateY: 0,
        vertices: [[-width / 2, start.y, start.halfDepth], [width / 2, start.y, start.halfDepth], [width / 2, end.y, end.halfDepth], [-width / 2, end.y, end.halfDepth]],
      },
      back: {
        centerZ: -centerZ, rotateX: -angle, rotateY: 180,
        vertices: [[width / 2, start.y, -start.halfDepth], [-width / 2, start.y, -start.halfDepth], [-width / 2, end.y, -end.halfDepth], [width / 2, end.y, -end.halfDepth]],
      },
    };
  });
  // Each side is a single coplanar silhouette. Its narrow polygon follows every
  // row boundary, so no rectangular metallic bar or gaps between strips appear.
  const leftTrace = boundaries.map(point => [.5 - point.halfDepth / depth, point.v]);
  const rightTrace = boundaries.map(point => [.5 + point.halfDepth / depth, point.v]);
  const outline = [leftTrace[0], ...rightTrace, ...leftTrace.slice(1).reverse()];
  const edges = [-1, 1].map(sign => ({
    side: sign < 0 ? "left" : "right", width: depth, height, centerX: sign * width / 2, centerY: 0, centerZ: 0, rotateY: sign * 90,
    clipPoints: outline.map(point => [...point]),
    clipPath: `polygon(${outline.map(([u, v]) => `${u * 100}% ${v * 100}%`).join(", ")})`,
    vertices: outline.map(([u, v]) => [sign * width / 2, (v - .5) * height, -sign * (u - .5) * depth]),
  }));
  const ends = [
    { side: "top", width, height: seamDepth, centerY: -height / 2, centerZ: 0, rotateX: 90,
      vertices: [[-width / 2, -height / 2, -seamHalf], [width / 2, -height / 2, -seamHalf], [width / 2, -height / 2, seamHalf], [-width / 2, -height / 2, seamHalf]] },
    { side: "bottom", width, height: seamDepth, centerY: height / 2, centerZ: 0, rotateX: -90,
      vertices: [[-width / 2, height / 2, seamHalf], [width / 2, height / 2, seamHalf], [width / 2, height / 2, -seamHalf], [-width / 2, height / 2, -seamHalf]] },
  ];
  return { width, height, depth, endDepth: seamDepth, boundaries, rows, edges, ends };
}
