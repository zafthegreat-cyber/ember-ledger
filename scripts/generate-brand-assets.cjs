const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const brandDir = path.join(publicDir, "assets", "brand");

const COLORS = {
  navy: "#04111f",
  navy2: "#08223a",
  ember: "#ff6a13",
  ember2: "#ff9a1f",
  tide: "#38bdf8",
  tide2: "#0ea5e9",
  white: "#f8fafc",
  muted: "#a8b8ca",
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function brandMarkSvg({ size = 512, maskable = false, transparent = false } = {}) {
  const pad = maskable ? 68 : 38;
  const view = 512;
  const scale = (view - pad * 2) / 392;
  const tx = pad + 8;
  const ty = pad + 12;
  const bgRect = transparent ? "" : `
    <rect width="${view}" height="${view}" fill="${COLORS.navy}"/>
    <rect width="${view}" height="${view}" rx="108" fill="url(#bg)"/>
    <rect x="18" y="18" width="${view - 36}" height="${view - 36}" rx="92" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4"/>
  `;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}" role="img" aria-label="Ember & Tide flame and wave mark">
  <defs>
    <radialGradient id="bg" cx="26%" cy="18%" r="82%">
      <stop offset="0" stop-color="#0c2b47"/>
      <stop offset=".56" stop-color="${COLORS.navy2}"/>
      <stop offset="1" stop-color="${COLORS.navy}"/>
    </radialGradient>
    <linearGradient id="emberGrad" x1="160" y1="52" x2="308" y2="318" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COLORS.ember2}"/>
      <stop offset=".45" stop-color="${COLORS.ember}"/>
      <stop offset="1" stop-color="#f0440b"/>
    </linearGradient>
    <linearGradient id="tideGrad" x1="108" y1="300" x2="386" y2="392" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COLORS.tide}"/>
      <stop offset=".7" stop-color="${COLORS.tide2}"/>
      <stop offset="1" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="packGrad" x1="120" y1="70" x2="380" y2="430" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#150a34"/>
      <stop offset=".46" stop-color="#08172d"/>
      <stop offset="1" stop-color="#020712"/>
    </linearGradient>
    <linearGradient id="neonEdge" x1="92" y1="64" x2="432" y2="438" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff6a13"/>
      <stop offset=".34" stop-color="#ff2fb3"/>
      <stop offset=".68" stop-color="#7c3cff"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
    <radialGradient id="packGlow" cx="50%" cy="42%" r="58%">
      <stop offset="0" stop-color="#ff2fb3" stop-opacity=".42"/>
      <stop offset=".46" stop-color="#38bdf8" stop-opacity=".22"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000814" flood-opacity=".42"/>
    </filter>
    <filter id="neonGlow" x="-45%" y="-45%" width="190%" height="190%">
      <feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#ff2fb3" flood-opacity=".62"/>
      <feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#38bdf8" flood-opacity=".42"/>
    </filter>
  </defs>
  ${bgRect}
  <g filter="url(#softShadow)">
    <path d="M172 108 344 72l42 264-172 36z" fill="#061427" opacity=".72" stroke="url(#neonEdge)" stroke-width="8" filter="url(#neonGlow)"/>
    <path d="M142 132 322 96l50 274-180 38z" fill="#080c20" opacity=".85" stroke="url(#neonEdge)" stroke-width="8" filter="url(#neonGlow)"/>
    <g transform="translate(112 92) rotate(-6 144 172)">
      <path d="M36 0h216l18 26-10 18 10 18-10 18 10 18-10 18 10 18-10 18 10 18-10 18 10 18-10 18 10 18-18 26H36L18 252l10-18-10-18 10-18-10-18 10-18-10-18 10-18-10-18 10-18-10-18 10-18-10-18z" fill="url(#packGrad)" stroke="url(#neonEdge)" stroke-width="10" filter="url(#neonGlow)"/>
      <path d="M50 34h188v206H50z" fill="url(#packGlow)" opacity=".92"/>
      <path d="M72 56h144v158H72z" rx="28" fill="#050b1c" stroke="url(#neonEdge)" stroke-width="6"/>
      <g transform="translate(44 34) scale(.52)">
        <path fill="url(#emberGrad)" d="M223 28c-40 43-36 82-31 107-26-22-42-49-40-82-59 54-86 112-78 171 10 76 76 124 158 126 78 2 143-42 158-113 10-47-4-89-44-129 3 32-8 56-31 72 3-49-21-96-92-152Z"/>
        <path fill="#ffb34f" opacity=".95" d="M210 146c-24 27-26 55-13 83-22-12-35-29-38-52-31 31-41 62-31 93 13 39 55 61 104 57 45-4 80-31 86-70 4-25-5-49-29-73-1 21-12 38-31 50 2-35-12-63-48-88Z"/>
        <path fill="url(#tideGrad)" d="M55 279c50 42 105 58 162 45 57-14 101-55 162-55-47 79-118 122-202 112-58-7-101-39-122-102Z"/>
        <path fill="${COLORS.navy}" opacity=".88" d="M82 285c62 25 113 24 154-2 29-19 62-32 103-30-47 23-80 52-127 61-43 9-87-.2-130-29Z"/>
        <path fill="${COLORS.navy}" opacity=".78" d="M118 329c47 15 89 12 127-9 22-12 48-20 77-19-35 24-72 42-116 45-32 2-61-4-88-17Z"/>
        <path fill="${COLORS.tide}" opacity=".72" d="M77 258c64 23 120 18 168-15 41-28 83-38 129-28-54 6-94 35-135 59-48 29-102 23-162-16Z"/>
      </g>
      <path d="M54 18h178M54 262h178" stroke="#ff2fb3" stroke-opacity=".6" stroke-width="4"/>
      <path d="M54 28h178M54 252h178" stroke="#38bdf8" stroke-opacity=".5" stroke-width="3"/>
    </g>
  </g>
</svg>`;
}

function promoHeroSvg({ width = 1536, height = 1024 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ember & Tide app preview showing Scout, Vault, Forge, and AI Assistant dashboard.">
  <defs>
    <radialGradient id="warm" cx="0" cy=".1" r=".55"><stop stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient>
    <radialGradient id="cool" cx=".85" cy=".1" r=".55"><stop stop-color="#0ea5e9" stop-opacity=".78"/><stop offset="1" stop-color="#0ea5e9" stop-opacity="0"/></radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061426"/><stop offset=".6" stop-color="#03101f"/><stop offset="1" stop-color="#020814"/></linearGradient>
    <linearGradient id="phone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071d33"/><stop offset="1" stop-color="#020817"/></linearGradient>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  <rect width="1536" height="1024" fill="url(#warm)" opacity=".8"/>
  <rect width="1536" height="1024" fill="url(#cool)" opacity=".8"/>
  <g transform="translate(190 86) rotate(-4)">
    <rect width="420" height="810" rx="64" fill="#020817" stroke="#5d7288" stroke-width="6"/>
    <rect x="24" y="28" width="372" height="754" rx="42" fill="url(#phone)"/>
    <rect x="136" y="38" width="150" height="26" rx="13" fill="#020817"/>
    <text x="70" y="116" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">Ember</text>
    <text x="172" y="116" fill="#38bdf8" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">&amp;Tide</text>
    <rect x="44" y="156" width="332" height="150" rx="16" fill="#0c233a" stroke="#173c5c"/>
    <text x="66" y="198" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="800">Scout Report Near You</text>
    <text x="66" y="238" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="20">Local restock signal</text>
    <text x="266" y="238" fill="#22c55e" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">In Stock</text>
    <rect x="44" y="330" width="332" height="126" rx="16" fill="#0c233a" stroke="#173c5c"/>
    <text x="66" y="372" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">Your Vault</text>
    <text x="66" y="418" fill="#ff6a13" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900">$2,543.21</text>
    <path d="M242 420c24-16 36-4 50-18 22-22 43 11 69-14" fill="none" stroke="#ff6a13" stroke-width="5"/>
    <rect x="44" y="480" width="332" height="118" rx="16" fill="#0c233a" stroke="#173c5c"/>
    <text x="66" y="522" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">Your Forge</text>
    <text x="74" y="570" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="18">Active listings</text>
    <text x="238" y="570" fill="#22c55e" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="900">+$412</text>
    <rect x="44" y="622" width="332" height="92" rx="16" fill="#0c233a" stroke="#173c5c"/>
    <text x="118" y="662" fill="#ff6a13" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="900">AI Assistant</text>
    <text x="118" y="694" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="18">Drafts. Summaries. Review.</text>
  </g>
  <g transform="translate(800 150)">
    ${brandMarkSvg({ transparent: true }).replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, '<svg x="-20" y="-80" width="220" height="220" viewBox="0 0 512 512">').replace("</svg>", "</svg>")}
    <text x="210" y="78" fill="#ff6a13" font-family="Inter, Arial, sans-serif" font-size="90" font-weight="950">Ember</text>
    <text x="210" y="174" fill="#38bdf8" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="850">&amp; Tide</text>
    <text x="0" y="290" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="600">Track. Trade. Thrive.</text>
    <text x="120" y="420" fill="#ff6a13" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">Built for collectors.</text>
    <text x="120" y="468" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="34">Powered by community.</text>
  </g>
</svg>`;
}

function slotSvg(kind, width, height, title, subtitle) {
  const qr = kind === "flyer" ? '<rect x="690" y="830" width="170" height="170" rx="12" fill="none" stroke="#38bdf8" stroke-width="6"/><text x="718" y="925" fill="#a8b8ca" font-size="24" font-family="Inter, Arial">QR CODE</text>' : "";
  const markSize = Math.max(176, Math.min(width, height) * 0.22);
  const markX = width * 0.5 - markSize / 2;
  const markY = height * 0.12;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061426"/><stop offset=".58" stop-color="#08223a"/><stop offset="1" stop-color="#020814"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${width * 0.12}" cy="${height * 0.12}" r="${Math.min(width, height) * 0.24}" fill="#ff6a13" opacity=".24"/>
  <circle cx="${width * 0.88}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.22}" fill="#38bdf8" opacity=".22"/>
  <svg x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" viewBox="0 0 512 512">${brandMarkSvg({ transparent: true }).replace(/^[\s\S]*?<g transform=/, '<g transform=').replace("</svg>", "")}</svg>
  <text x="${width / 2}" y="${height * 0.48}" fill="#ff6a13" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(42, width * 0.07)}" font-weight="950">Ember &amp; Tide</text>
  <text x="${width / 2}" y="${height * 0.56}" fill="#f8fafc" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(30, width * 0.052)}" font-weight="700">${title}</text>
  <text x="${width / 2}" y="${height * 0.63}" fill="#a8b8ca" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(22, width * 0.032)}">${subtitle}</text>
  ${qr}
  <text x="${width / 2}" y="${height - 72}" fill="#38bdf8" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(20, width * 0.026)}" font-weight="800">emberandtide.app</text>
</svg>`;
}

function writeTextAsset(filePath, contents) {
  fs.writeFileSync(filePath, contents.replace(/\r?\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n"), "utf8");
}

async function renderSvgToPng(browser, svg, outputPath, width, height = width) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const inlineSvg = svg
    .replace(/<\?xml[^>]*>\s*/i, "")
    .replace(/<svg\b([^>]*)>/i, `<svg$1 style="display:block;width:${width}px;height:${height}px">`);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${inlineSvg}</body></html>`);
  await page.locator("svg").first().waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: outputPath, omitBackground: false, clip: { x: 0, y: 0, width, height } });
  await page.close();
}

function writeIcoFromPng(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6);
  header.writeUInt8(32, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync(icoPath, Buffer.concat([header, png]));
}

async function main() {
  ensureDir(publicDir);
  ensureDir(brandDir);

  const faviconSvg = brandMarkSvg({ transparent: false });
  const iconSvg = brandMarkSvg({ transparent: false });
  const maskableSvg = brandMarkSvg({ maskable: true, transparent: false });
  const markSvg = brandMarkSvg({ transparent: true });
  const promoSvg = promoHeroSvg();

  writeTextAsset(path.join(publicDir, "favicon.svg"), faviconSvg);
  writeTextAsset(path.join(brandDir, "ember-tide-mark.svg"), markSvg);
  writeTextAsset(path.join(brandDir, "ember-tide-icon-source.svg"), iconSvg);
  writeTextAsset(path.join(brandDir, "ember-tide-icon-maskable-source.svg"), maskableSvg);
  writeTextAsset(path.join(brandDir, "ember-tide-promo-hero.svg"), promoSvg);
  writeTextAsset(path.join(brandDir, "social-square.svg"), slotSvg("social", 1080, 1080, "Track. Trade. Thrive.", "Built for collectors. Powered by community."));
  writeTextAsset(path.join(brandDir, "story-reel.svg"), slotSvg("story", 1080, 1920, "Track. Trade. Thrive.", "Scout restocks. Track inventory. Grow together."));
  writeTextAsset(path.join(brandDir, "flyer-template.svg"), slotSvg("flyer", 850, 1100, "Bring Pokemon Collecting Back to Kids", "Vault / Forge / Scout / Kids Program"));
  writeTextAsset(path.join(brandDir, "link-bio-header.svg"), slotSvg("links", 1200, 640, "Track. Trade. Thrive.", "Try the beta. Join Kids Program. Partner with us."));
  writeTextAsset(path.join(brandDir, "pwa-install-promo.svg"), slotSvg("pwa", 1200, 630, "Install Ember & Tide", "A collector operating system for mobile."));
  writeTextAsset(path.join(brandDir, "brand-assets.json"), JSON.stringify({
    appIcon: {
      source: "/assets/brand/ember-tide-icon-source.svg",
      mark: "/assets/brand/ember-tide-mark.svg",
      rule: "Use the neon booster-pack/card-stack icon with the Ember & Tide flame-wave mark. No text in app icons.",
    },
    promoHero: {
      source: "/assets/brand/ember-tide-promo-hero.svg",
      png: "/assets/brand/ember-tide-promo-hero.png",
      alt: "Ember & Tide app preview showing Scout, Vault, Forge, and AI Assistant dashboard.",
      note: "Replace with the final compressed promo mockup when the production artwork file is available.",
    },
    slots: {
      socialSquare: "/assets/brand/social-square.svg",
      storyReel: "/assets/brand/story-reel.svg",
      flyer: "/assets/brand/flyer-template.svg",
      linkBioHeader: "/assets/brand/link-bio-header.svg",
      linkBioHeaderPng: "/assets/brand/link-bio-header.png",
      pwaInstallPromo: "/assets/brand/pwa-install-promo.svg",
      pwaInstallPromoPng: "/assets/brand/pwa-install-promo.png",
    },
    colors: {
      emberOrange: COLORS.ember,
      tideBlue: COLORS.tide,
      deepNavy: COLORS.navy,
    },
    tagline: "Track. Trade. Thrive.",
    secondaryTagline: "Built for collectors. Powered by community.",
  }, null, 2));

  const browser = await chromium.launch({ headless: true });
  await renderSvgToPng(browser, iconSvg, path.join(publicDir, "favicon-16x16.png"), 16);
  await renderSvgToPng(browser, iconSvg, path.join(publicDir, "favicon-32x32.png"), 32);
  await renderSvgToPng(browser, iconSvg, path.join(publicDir, "apple-touch-icon.png"), 180);
  await renderSvgToPng(browser, iconSvg, path.join(publicDir, "icon-192.png"), 192);
  await renderSvgToPng(browser, iconSvg, path.join(publicDir, "icon-512.png"), 512);
  await renderSvgToPng(browser, maskableSvg, path.join(publicDir, "icon-maskable-192.png"), 192);
  await renderSvgToPng(browser, maskableSvg, path.join(publicDir, "icon-maskable-512.png"), 512);
  await renderSvgToPng(browser, promoSvg, path.join(brandDir, "ember-tide-promo-hero.png"), 1200, 800);
  await renderSvgToPng(browser, slotSvg("links", 1200, 640, "Track. Trade. Thrive.", "Try the beta. Join Kids Program. Partner with us."), path.join(brandDir, "link-bio-header.png"), 900, 480);
  await renderSvgToPng(browser, slotSvg("pwa", 1200, 630, "Install Ember & Tide", "A collector operating system for mobile."), path.join(brandDir, "pwa-install-promo.png"), 900, 473);
  await browser.close();

  writeIcoFromPng(path.join(publicDir, "favicon-32x32.png"), path.join(publicDir, "favicon.ico"));
  console.log("Generated Ember & Tide brand assets.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
