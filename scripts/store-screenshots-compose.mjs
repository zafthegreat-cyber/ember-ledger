// Frames raw screens with a headline for App Store / Google Play, and draws the Play feature graphic.
// Usage: node compose-store-shots.mjs <repoDir> <rawDir> <outDir>
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [repo, raw, out] = process.argv.slice(2);
const require = createRequire(join(repo, "package.json"));
const { chromium } = require("playwright");
mkdirSync(out, { recursive: true });

const font = readFileSync(join(repo, "public/assets/fonts/SpaceGrotesk-Variable.ttf")).toString("base64");
const icon = readFileSync(join(repo, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")).toString("base64");
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

const captions = {
  "1-home": ["Find restocks near you", "Share what you see and help the next collector."],
  "2-restocks": ["See recent community reports", "Share reports nationwide. Store coverage varies by area."],
  "3-report-details": ["Every report, with context", "When it was seen, how trusted it is, and Report or Block in one tap."],
  "4-report-form": ["Share a store visit", "Choose a store, say what you saw, then review before saving."],
  "5-collection": ["Keep your collection organized", "Sealed product and singles, tracked in one place."],
};

const css = `
@font-face { font-family: "C3"; src: url(data:font/ttf;base64,${font}) format("truetype"); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: "C3", sans-serif; background: radial-gradient(120% 70% at 50% 0%, #5a1420 0%, #2a0a10 55%, #140608 100%); color: #f6efe6; overflow: hidden; }
`;

function shotHtml({ w, h, pad, title, sub, img, imgW, imgH, titleSize, subSize, radius }) {
  return `<html><head><style>${css}
  .wrap { display: flex; flex-direction: column; align-items: center; width: ${w}px; height: ${h}px; padding: ${Math.round(pad * 1.1)}px ${pad}px ${Math.round(pad * 0.7)}px; }
  .copy { flex: 0 0 auto; width: 100%; text-align: center; margin-bottom: ${Math.round(pad * 0.75)}px; }
  h1 { color: #e8c66a; font-size: ${titleSize}px; font-weight: 700; line-height: 1.08; letter-spacing: -0.01em; }
  p { margin-top: ${Math.round(subSize * 0.6)}px; color: #f1e6da; font-size: ${subSize}px; font-weight: 400; line-height: 1.35; opacity: .92; }
  .phone { flex: 1 1 auto; min-height: 0; aspect-ratio: ${imgW} / ${imgH}; max-width: ${Math.round(imgW * 1.06)}px; border-radius: ${radius}px; overflow: hidden;
    border: ${Math.round(radius / 7)}px solid #0d0607; box-shadow: 0 0 0 2px rgba(232,198,106,.55), 0 40px 90px rgba(0,0,0,.55); }
  .phone img { width: 100%; height: 100%; display: block; object-fit: contain; object-position: top; }
  </style></head><body><div class="wrap"><div class="copy"><h1>${title}</h1><p>${sub}</p></div>
  <div class="phone"><img src="${img}"></div></div></body></html>`;
}

const targets = [
  { set: "ios", w: 1320, h: 2868, pad: 96, imgW: 1150, imgH: 2300, titleSize: 92, subSize: 44, radius: 70 },
  { set: "play", w: 1080, h: 1920, pad: 64, imgW: 780, imgH: 1385, titleSize: 66, subSize: 32, radius: 50 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.w, height: t.h });
  for (const [id, [title, sub]] of Object.entries(captions)) {
    await page.setContent(shotHtml({ ...t, title, sub, img: dataUrl(join(raw, `${t.set}-${id}.png`)) }), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const file = join(out, `${t.set === "ios" ? "app-store-iphone-6.9" : "google-play-phone"}-${id}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    console.log("saved", file);
  }
}

// Google Play feature graphic, 1024x500.
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<html><head><style>${css}
  body { background: radial-gradient(90% 140% at 20% 50%, #6a1824 0%, #2a0a10 60%, #140608 100%); }
  .row { display: flex; align-items: center; gap: 56px; height: 500px; padding: 0 80px; }
  img { width: 260px; height: 260px; border-radius: 58px; box-shadow: 0 0 0 3px rgba(232,198,106,.6), 0 26px 60px rgba(0,0,0,.6); }
  h1 { color: #e8c66a; font-size: 84px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  p { margin-top: 18px; font-size: 34px; color: #f1e6da; line-height: 1.3; }
  </style></head><body><div class="row"><img src="data:image/png;base64,${icon}"><div><h1>Code 3 TCG</h1><p>Find restocks.<br>Track your collection.</p></div></div></body></html>`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, "google-play-feature-graphic.png") });
console.log("saved feature graphic");
await browser.close();
