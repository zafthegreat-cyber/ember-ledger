import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { getDisplayImageCandidates, getResponsiveImageAttributes } from "../src/utils/imagePresentation.mjs";
import { getItemImageUrl } from "../src/utils/productDisplayUtils.js";

const compiled = await build({ entryPoints: ["src/components/ItemPhoto.jsx"], bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"], logLevel: "silent", plugins: [{ name: "isolated-artwork", setup(api) {
  api.onLoad({ filter: /PrivateReceipt\.jsx$/ }, () => ({ contents: 'import React from "react"; export function PrivateStorageImage(props){return <img {...props} data-private-resolver="unchanged"/>}', loader: "jsx" }));
} }] });
const compiledModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), compiledModule, compiledModule.exports);
const ItemPhoto = compiledModule.exports.default;

async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/", pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  const render = props => act(async () => root.render(React.createElement(ItemPhoto, props)));
  const emit = type => act(async () => document.querySelector("img").dispatchEvent(new dom.window.Event(type)));
  try { await run({ root, render, emit }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}

test("display prefers existing large artwork over identified thumbnails while preserving an owner's chosen photo", () => {
  const product = Object.freeze({ imageUrl: "/small.jpg", imageSmall: "/small.jpg", imageLarge: "/large.jpg", backImageUrl: "/back.jpg", photos: Object.freeze(["/receipt.jpg"]) });
  const before = JSON.stringify(product);
  assert.deepEqual(getDisplayImageCandidates(product), ["/large.jpg", "/small.jpg"]);
  assert.deepEqual(getDisplayImageCandidates({ ...product, item_image: "/owner.jpg" }), ["/owner.jpg", "/large.jpg", "/small.jpg"]);
  assert.deepEqual(getDisplayImageCandidates(product, "/selected-owner.jpg"), ["/selected-owner.jpg", "/large.jpg", "/small.jpg"]);
  assert.equal(getItemImageUrl(product), "/small.jpg", "Stored selection resolver remains unchanged");
  assert.equal(JSON.stringify(product), before);
});

test("detail quality uses only the established CDN upgrade with original fallback and keeps private/signature references exact", () => {
  const thumbnail = "https://tcgplayer-cdn.tcgplayer.com/product/101_200w.jpg";
  assert.deepEqual(getDisplayImageCandidates({}, thumbnail, { quality: "tile" }), [thumbnail]);
  assert.deepEqual(getDisplayImageCandidates({}, thumbnail, { quality: "detail" }), ["https://tcgplayer-cdn.tcgplayer.com/product/101_in_1000x1000.jpg", thumbnail]);
  for (const source of ["private://artwork/owner/front", "/storage/v1/object/authenticated/artwork/a.jpg", "https://example.invalid/front.jpg?token=fixture", "https://tcgplayer-cdn.tcgplayer.com/product/101_200w.jpg?token=fixture", "https://other.invalid/product/101_200w.jpg"]) assert.deepEqual(getDisplayImageCandidates({}, source, { quality: "detail" }), [source]);
  assert.deepEqual(getDisplayImageCandidates({ imageUrl: "placeholder", imageLarge: {}, images: { large: "/front.jpg", small: "/front.jpg" } }), ["/front.jpg"]);
});

test("responsive tile images expose exact device-sized choices only for supported unsigned catalog URLs", () => {
  const source = "https://tcgplayer-cdn.tcgplayer.com/product/101_200w.jpg";
  assert.deepEqual(getResponsiveImageAttributes(source, { sizes: "44vw" }), { srcSet: `${source} 200w, https://tcgplayer-cdn.tcgplayer.com/product/101_in_1000x1000.jpg 1000w`, sizes: "44vw" });
  assert.equal(getResponsiveImageAttributes(source, { sizes: "56px" }).sizes, "56px");
  for (const protectedSource of [source + "?token=fixture", "/owner/front.jpg", "private://photos/front", "https://other.invalid/product/101_200w.jpg"]) assert.deepEqual(getResponsiveImageAttributes(protectedSource), {});
  assert.deepEqual(getResponsiveImageAttributes(source, { quality: "detail" }), {});
});

test("responsive high-resolution failure retries the original thumbnail before other artwork", async () => environment(async ({ render, emit }) => {
  const source = "https://tcgplayer-cdn.tcgplayer.com/product/101_200w.jpg";
  await render({ src: source, product: { imageLarge: "/alternate-front.jpg" }, sizes: "44vw", alt: "Card" });
  assert.match(document.querySelector("img").getAttribute("srcset"), /1000x1000/);
  assert.equal(document.querySelector("img").getAttribute("sizes"), "44vw");
  await emit("error"); assert.equal(document.querySelector("img").getAttribute("srcset"), null);
  assert.equal(document.querySelector("img").getAttribute("src"), source);
  await emit("error"); assert.equal(document.querySelector("img").getAttribute("src"), "/alternate-front.jpg");
  await emit("load"); assert.equal(document.querySelector("img").dataset.photoState, "ready");
}));

test("failed primary art tries each same-item alternative once and ends with an accessible bounded fallback", async () => environment(async ({ render, emit }) => {
  const product = Object.freeze({ imageUrl: "/missing.jpg", imageLarge: "/front-large.jpg", imageSmall: "/missing.jpg" });
  await render({ product, alt: "Fixture card", className: "tile-art" });
  assert.equal(document.querySelector("img").getAttribute("src"), "/front-large.jpg");
  assert.equal(document.querySelector("img").getAttribute("loading"), "lazy");
  assert.equal(document.querySelector("img").getAttribute("decoding"), "async");
  assert.equal(document.querySelector("img").getAttribute("draggable"), "false");
  assert.equal(document.querySelector("img").dataset.privateResolver, "unchanged");
  assert.equal(document.querySelector("img").dataset.photoState, "loading");
  await emit("error"); assert.equal(document.querySelector("img").getAttribute("src"), "/missing.jpg");
  await emit("error"); assert.equal(document.querySelector("img"), null);
  assert.ok(document.querySelector('.item-photo.tile-art[data-photo-fallback="true"][role="img"][aria-label="Fixture card image unavailable"]'));
}));

test("new search image resets stale failure and loading state without remounting its result row", async () => environment(async ({ render, emit }) => {
  await render({ src: "/first.jpg", alt: "First card" }); await emit("error"); assert.ok(document.querySelector('[data-photo-fallback="true"]'));
  await render({ src: "/second.jpg", alt: "Second card" }); assert.equal(document.querySelector("img").getAttribute("src"), "/second.jpg");
  await emit("load"); assert.equal(document.querySelector("img").dataset.photoState, "ready");
  await render({ src: "/first.jpg", alt: "First card" }); assert.equal(document.querySelector("img").getAttribute("src"), "/first.jpg");
  assert.equal(document.querySelector("img").dataset.photoState, "loading");
}));

test("detail fallback keeps the original card and decorative missing art does not repeat the tile label", async () => environment(async ({ render, emit }) => {
  const source = "https://tcgplayer-cdn.tcgplayer.com/product/101_200w.jpg";
  await render({ src: source, quality: "detail", alt: "Card" });
  assert.match(document.querySelector("img").getAttribute("src"), /1000x1000/); await emit("error");
  assert.equal(document.querySelector("img").getAttribute("src"), source);
  await render({ src: "", alt: "" }); assert.equal(document.querySelector('[data-photo-fallback="true"]').getAttribute("aria-hidden"), "true");
  await render({ src: "", fallback: React.createElement("span", null, "Catalog image unavailable") });
  assert.equal(document.body.textContent, "Catalog image unavailable");
}));
