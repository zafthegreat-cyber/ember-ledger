import test from "node:test";
import assert from "node:assert/strict";
import { wrapperGeometry } from "../src/utils/wrapperGeometry.mjs";
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message || `${actual} != ${expected}`);
const pointClose = (actual, expected) => actual.forEach((n, i) => close(n, expected[i]));
const hasPoint = (vertices, point) => vertices.some(vertex => vertex.every((n, i) => Math.abs(n - point[i]) < 1e-8));

test("five wrapper bands retain one unbroken printed body and the exact full front/back UV range", () => {
  const mesh = wrapperGeometry({ width: 180, height: 332.3 });
  assert.equal(mesh.rows.length, 5); assert.equal(mesh.boundaries.length, 6); assert.equal(mesh.edges.length, 2); assert.equal(mesh.ends.length, 2);
  assert.equal(mesh.rows[2].front.rotateX,0); assert.equal(mesh.rows[2].v0,.14); assert.equal(mesh.rows[2].v1,.86);
  close(mesh.depth, 3.96); close(mesh.endDepth, .6);
  assert.equal(mesh.rows[0].v0, 0); assert.equal(mesh.rows.at(-1).v1, 1);
  close(mesh.rows.reduce((sum, row) => sum + row.v1 - row.v0, 0), 1);
  for (const row of mesh.rows) {
    close(row.textureOffsetY + row.v0 * row.textureHeight, 0);
    close(row.textureOffsetY + row.v1 * row.textureHeight, row.length);
    assert.deepEqual(row.uv, [[0,row.v0],[1,row.v0],[1,row.v1],[0,row.v1]]);
  }
});

test("adjacent front/back strips meet at the same physical vertices and share their UV boundary", () => {
  const mesh = wrapperGeometry({ width: 270, height: 498, depth: 5.94 });
  for (let i = 1; i < mesh.rows.length; i++) {
    const previous = mesh.rows[i - 1], next = mesh.rows[i]; close(previous.v1, next.v0);
    for (const face of ["front", "back"]) {
      pointClose(previous[face].vertices[3], next[face].vertices[0]);
      pointClose(previous[face].vertices[2], next[face].vertices[1]);
    }
    close(previous.halfDepth1, next.halfDepth0);
  }
});

test("CSS translate then rotateX then rotateY reconstructs both photographed planes without mirroring the back UVs", () => {
  const mesh = wrapperGeometry({ width: 185, height: 341, depth: 4.07 });
  for (const row of mesh.rows) for (const face of [row.front, row.back]) {
    const xAngle = face.rotateX * Math.PI / 180, yAngle = face.rotateY * Math.PI / 180;
    const local = [[-mesh.width/2,-row.length/2],[mesh.width/2,-row.length/2],[mesh.width/2,row.length/2],[-mesh.width/2,row.length/2]];
    local.forEach(([x,y], i) => {
      // Transform right to left, as CSS does: Y rotation, X rotation, translation.
      const xx = x*Math.cos(yAngle), zz = -x*Math.sin(yAngle);
      const yy = y*Math.cos(xAngle) - zz*Math.sin(xAngle);
      const z = y*Math.sin(xAngle) + zz*Math.cos(xAngle);
      pointClose([xx,yy+row.centerY,z+face.centerZ], face.vertices[i]);
    });
  }
});

test("crimped ends are thin, closed, and meet the photographed faces and side silhouettes exactly", () => {
  const mesh = wrapperGeometry({ width: 180, height: 332, depth: 3.96, endDepth: .5 });
  for (const edge of mesh.edges) {
    assert.equal(edge.vertices.length, 12); assert.ok(edge.clipPoints.flat().every(n => n >= 0 && n <= 1));
    for (const point of mesh.boundaries) for (const z of [-point.halfDepth, point.halfDepth]) assert.ok(hasPoint(edge.vertices, [edge.centerX,point.y,z]));
  }
  for (const [end,row,indices] of [[mesh.ends[0],mesh.rows[0],[0,1]],[mesh.ends[1],mesh.rows.at(-1),[2,3]]]) {
    close(end.height, .5);
    for (const face of [row.front,row.back]) for (const index of indices) assert.ok(hasPoint(end.vertices,face.vertices[index]));
    for (const vertex of end.vertices) assert.ok(mesh.edges.some(edge => hasPoint(edge.vertices,vertex)));
  }
  assert.ok(mesh.boundaries[2].halfDepth > mesh.boundaries[0].halfDepth);
  assert.equal(mesh.rows[0].front.rotateX, 0); assert.equal(mesh.rows.at(-1).front.rotateX, 0);
});

test("the shape is symmetric, finite at phone and expanded sizes, and never thickens a thinner supplied wrapper", () => {
  for (const width of [120,180,270,440]) {
    const mesh = wrapperGeometry({ width, height: width*1.846, depth: width*.022 });
    for (let i=0;i<mesh.boundaries.length;i++) close(mesh.boundaries[i].halfDepth,mesh.boundaries.at(-1-i).halfDepth);
    for (const row of mesh.rows) for (const face of [row.front,row.back]) assert.ok(face.vertices.flat().every(Number.isFinite));
    assert.ok(mesh.rows.every(row => Math.abs(row.front.rotateX) < 8));
  }
  const thin = wrapperGeometry({width:180,height:332,depth:.25,endDepth:.6});
  assert.equal(thin.endDepth,.25); assert.ok(thin.boundaries.every(point => point.halfDepth===.125));
});

test("zero or non-finite layout measurements return no mesh rather than invalid transforms", () => {
  for (const value of [0,-1,NaN,Infinity,null,"180",undefined]) {
    assert.equal(wrapperGeometry({width:value,height:332}),null);
    assert.equal(wrapperGeometry({width:180,height:value}),null);
  }
  assert.equal(wrapperGeometry({width:180,height:332,depth:NaN}),null);
  assert.equal(wrapperGeometry({width:180,height:332,endDepth:0}),null);
});
