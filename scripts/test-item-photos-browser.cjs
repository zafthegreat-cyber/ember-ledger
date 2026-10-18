const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");

// Entirely synthetic: fulfilled local routes, a fresh browser context for each
// viewport/theme, no account session, and no network writes.
const origin = "http://127.0.0.1:5243";
const output = path.resolve("artifacts/qa/item-photos");
const examples = [
  ["Original item photo", { itemImage: "/__qa/card.svg" }, "card"],
  ["Imported item photo", { item_image: "/__qa/box.svg" }, "box"],
  ["Display photo", { displayImage: "/__qa/card.svg" }, "card"],
  ["Saved catalog image", { catalogImageUrl: "/__qa/box.svg" }, "box"],
  ["Product image", { productImageUrl: "/__qa/box.svg" }, "box"],
  ["Photo URL", { photoUrl: "/__qa/card.svg" }, "card"],
  ["Catalog images", { images: { large: "/__qa/card.svg", small: "/__qa/broken.svg" } }, "card"],
  ["Image metadata", { image: { url: "/__qa/box.svg" } }, "box"],
  ["Photo array", { photos: [{ url: "/__qa/card.svg" }] }, "card"],
  ["Image array", { images: [{ url: "/__qa/box.svg" }] }, "box"],
  ["Legacy image URL", { imageUrl: "/__qa/card.svg" }, "card"],
  ["Catalog linked item", { productId: "qa-catalog-product" }, "box"],
  ["Missing photo", {}, null],
  ["Unavailable photo", { itemImage: "/__qa/broken.svg" }, null],
];
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import './src/index.css'; import './src/App.css';
import {CollectionWorkspace,BusinessWorkspace} from './src/pages/EverydayWorkspaces.jsx';
import {resolveExperiencePresentation} from './src/utils/experiencePresentation.js';
import {getItemImageUrl} from './src/utils/productDisplayUtils.js';
import ItemPhoto from './src/components/ItemPhoto.jsx';
import {createEmptyFlipScoutState,FLIP_SCOUT_STORAGE_KEY,RECORD_COLLECTIONS} from './src/features/flipScout/constants.js';
const seed=createEmptyFlipScoutState();
const common={quantity:1,ownedItemPurpose:'PERSONAL_COLLECTION',projectedResaleMid:25,allocatedItemCost:10,productClassification:'Raw card',condition:'Near mint',createdAt:'2026-10-17T12:00:00.000Z'};
const examples=${JSON.stringify(examples)};
seed.inventory=examples.map(([name,fields,kind],index)=>({...common,id:'qa-photo-'+index,name,productClassification:kind==='box'?'Sealed product':'Raw card',...fields}));
seed.inventory.push({...common,id:'qa-business-card',name:'Resale card photo',ownedItemPurpose:'FOR_RESALE',itemImage:'/__qa/card.svg'});
seed.inventory.push({...common,id:'qa-business-box',name:'Resale sealed box photo',ownedItemPurpose:'FOR_RESALE',productClassification:'Sealed product',images:{large:'/__qa/box.svg'}});
seed.inventory.push({...common,id:'qa-business-catalog',name:'Resale catalog photo',ownedItemPurpose:'FOR_RESALE',productId:'qa-catalog-product'});
seed.purchases=[{id:'qa-purchase',title:'Preserved purchase',totalPurchaseCost:10,purchaseDate:'2026-10-17'}];
seed.sales=[{id:'qa-sale',title:'Preserved sale',status:'Draft',grossSalePrice:35,quantitySold:1,saleDate:'2026-10-17'}];
seed.expenses=[{id:'qa-expense',description:'Preserved expense',amount:4,date:'2026-10-17',category:'Shipping'}];
localStorage.setItem(FLIP_SCOUT_STORAGE_KEY,JSON.stringify(seed));
window.qaSnapshot=()=>{const state=JSON.parse(localStorage.getItem(FLIP_SCOUT_STORAGE_KEY));return JSON.stringify(RECORD_COLLECTIONS.map(key=>[key,state[key]]));};
window.qaOriginal=window.qaSnapshot();
const root=createRoot(document.getElementById('root'));let revision=0;
const legacyItems=[{...common,id:'qa-legacy-record',name:'Legacy compatible record',item_image:'/__qa/box.svg',productClassification:'Sealed product'}];
window.qaLegacySnapshot=()=>JSON.stringify(legacyItems);window.qaLegacyOriginal=window.qaLegacySnapshot();
window.qaRender=({screen='collection'}={})=>{
 const props={items:legacyItems,resolveItemImage:record=>getItemImageUrl(record)||(record.productId==='qa-catalog-product'?'/__qa/box.svg':''),experiencePresentation:resolveExperiencePresentation({personaPreference:screen==='collection'?'collector':'seller'})};
 root.render(<div key={++revision} className='app app-command-shell' data-theme={document.documentElement.dataset.theme}>{screen==='collection'?<CollectionWorkspace {...props}/>:<BusinessWorkspace {...props} initialView='inventory'/>}</div>);
};window.qaRender();
window.qaSwapPhoto=src=>root.render(<div className='ops-detail-hero' data-testid='photo-recovery'><ItemPhoto src={src} alt='Recovered item photo' fallbackClassName='ops-detail-identity'/></div>);
`;

const artwork = {
  card: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><rect x="5" y="5" width="290" height="410" rx="22" fill="#f4f5f0" stroke="#0f766e" stroke-width="10"/><rect x="30" y="35" width="240" height="230" rx="8" fill="#bce4da"/><circle cx="150" cy="145" r="65" fill="#0f766e"/><path d="M150 94v102m-51-51h102" stroke="#fff" stroke-width="15"/><text x="150" y="315" text-anchor="middle" fill="#24312e" font-size="25" font-family="sans-serif">SAMPLE CARD</text><path d="M45 350h210m-210 28h160" stroke="#5f6d66" stroke-width="9"/></svg>',
  box: '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300"><path d="M40 70 120 25h220l45 45v185H40Z" fill="#67c8bb" stroke="#24312e" stroke-width="8"/><path d="M40 70h345M120 25v45" fill="none" stroke="#24312e" stroke-width="8"/><rect x="85" y="105" width="250" height="108" rx="12" fill="#f2f5f3"/><text x="210" y="153" text-anchor="middle" fill="#24312e" font-size="24" font-family="sans-serif">SAMPLE SEALED</text><text x="210" y="188" text-anchor="middle" fill="#24312e" font-size="24" font-family="sans-serif">PRODUCT</text></svg>',
};

async function assertPhoto(container, kind, label) {
  const photo = container.locator("img");
  await container.scrollIntoViewIfNeeded();
  await expect(photo, `${label} has a photo`).toHaveCount(1);
  await expect(photo).toHaveAttribute("src", `/__qa/${kind}.svg`);
  await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth > 0), { message: `${label} image loads` }).toBe(true);
  const geometry = await photo.evaluate(image => {
    const rect = image.getBoundingClientRect();
    return { fit: getComputedStyle(image).objectFit, width: rect.width, height: rect.height, right: rect.right, left: rect.left, viewport: innerWidth };
  });
  assert.equal(geometry.fit, "contain", `${label} shows the full photograph without cropping`);
  assert(geometry.width >= 40 && geometry.height >= 40, `${label} retains a useful image size`);
  assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `${label} photo stays within the viewport`);
}

async function assertLayout(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} has no horizontal overflow`);
  const smallTargets = await page.locator("button:visible").evaluateAll(buttons => buttons.filter(button => {
    const { width, height } = button.getBoundingClientRect();
    return width < 43.5 || height < 43.5;
  }).map(button => ({ name: button.getAttribute("aria-label") || button.textContent.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  assert.deepEqual(smallTargets, [], `${label} keeps 44px button targets`);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, jsx: "automatic", format: "esm", outfile: path.join(output, "fixture.js"), define: { "import.meta.env": "{}" }, external: ["/assets/*"] });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let lastPage;
  try {
    for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const attemptedWrites = [], unexpectedRequests = [], errors = [];
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") attemptedWrites.push(`${request.method()} ${url.pathname}`);
        if (request.method() !== "GET" || url.origin !== origin) { unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
        if (url.pathname === "/__qa/photos") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Item photo regression fixture</title><link rel="stylesheet" href="/__qa/fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/fixture.js"></script></body></html>` });
        if (["/__qa/fixture.js", "/__qa/fixture.css"].includes(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith(".js") ? "text/javascript" : "text/css", body: fs.readFileSync(path.join(output, path.basename(url.pathname))) });
        if (url.pathname === "/assets/fonts/SpaceGrotesk-Variable.ttf") return route.fulfill({ contentType: "font/ttf", body: fs.readFileSync(path.resolve("public/assets/fonts/SpaceGrotesk-Variable.ttf")) });
        if (url.pathname === "/__qa/card.svg" || url.pathname === "/__qa/box.svg") return route.fulfill({ contentType: "image/svg+xml", body: artwork[url.pathname.includes("card") ? "card" : "box"] });
        if (url.pathname === "/__qa/broken.svg") return route.fulfill({ status: 404, contentType: "text/plain", body: "Synthetic missing photo" });
        unexpectedRequests.push(`${request.method()} ${url.pathname}`); return route.abort();
      });
      const page = await context.newPage(); lastPage = page;
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/__qa/photos`);
      await expect(page.getByTestId("collection-workspace")).toBeVisible();
      for (const [name, , kind] of [...examples, ["Legacy compatible record", {}, "box"]]) {
        const card = page.getByRole("button", { name: `Open ${name}`, exact: true });
        await expect(card).toBeVisible();
        if (kind) await assertPhoto(card, kind, name);
        else {
          await card.scrollIntoViewIfNeeded();
          await expect(card.locator("img"), `${name} has a stable fallback without a broken image`).toHaveCount(0);
          await expect(card.getByRole("heading", { name, exact: true })).toBeVisible();
        }
      }
      await assertLayout(page, `${width}/${theme} collection`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-collection.png`) });
      for (const [name, kind] of [["Original item photo", "card"], ["Imported item photo", "box"], ["Catalog linked item", "box"], ["Unavailable photo", null], ["Missing photo", null]]) {
        await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
        const hero = page.locator(".ops-detail-hero");
        if (kind) {
          await assertPhoto(hero, kind, `${name} detail`);
          await expect(hero.locator("img")).toHaveAttribute("alt", name);
        } else await expect(hero.locator("img")).toHaveCount(0);
        await assertLayout(page, `${width}/${theme} ${name} detail`);
        if (name === "Original item photo") {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, `${width}-${theme}-card-detail.png`) });
        }
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(page.getByTestId("collection-workspace")).toBeVisible();
        await expect(page.getByRole("button", { name: `Open ${name}`, exact: true })).toBeVisible();
      }
      await page.getByRole("button", { name: "Open Original item photo", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Original item photo", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Back", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("collection-workspace")).toBeVisible();

      await page.evaluate(() => window.qaRender({ screen: "business" }));
      await expect(page.getByTestId("business-workspace")).toBeVisible();
      for (const [name, kind] of [["Resale card photo", "card"], ["Resale sealed box photo", "box"], ["Resale catalog photo", "box"]]) {
        const card = page.getByRole("button", { name: `Open ${name}`, exact: true });
        await assertPhoto(card, kind, name);
        await card.click();
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
        await assertPhoto(page.locator(".ops-detail-hero"), kind, `${name} detail`);
        await assertLayout(page, `${width}/${theme} inventory detail`);
        if (name === "Resale sealed box photo") {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, `${width}-${theme}-sealed-detail.png`) });
        }
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(page.getByTestId("business-workspace")).toBeVisible();
      }
      await assertLayout(page, `${width}/${theme} inventory`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-inventory.png`), fullPage: true });
      await page.evaluate(() => window.qaSwapPhoto('/__qa/broken.svg'));
      await expect(page.getByTestId('photo-recovery').locator('[data-photo-fallback="true"]')).toBeVisible();
      await expect(page.getByTestId('photo-recovery').locator('img')).toHaveCount(0);
      await page.evaluate(() => window.qaSwapPhoto('/__qa/card.svg'));
      await assertPhoto(page.getByTestId('photo-recovery'), 'card', 'Updated photo after an earlier load failure');
      await expect(page.getByTestId('photo-recovery').locator('[data-photo-fallback="true"]')).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.qaSnapshot()), await page.evaluate(() => window.qaOriginal), "Browsing photos preserves every saved record");
      assert.equal(await page.evaluate(() => window.qaLegacySnapshot()), await page.evaluate(() => window.qaLegacyOriginal), "Photo resolution does not mutate compatibility records");
      assert.deepEqual(errors, []); assert.deepEqual(attemptedWrites, []); assert.deepEqual(unexpectedRequests, []);
      results.push({ width, theme, photoFieldVariants: examples.filter(([, , kind]) => kind).length, compatibilityRecord: true, catalogCallback: true, missingAndBrokenFallbacks: true, changedPhotoRecovers: true, completeArtwork: true, collectionDetailsAndBack: true, businessDetailsAndBack: true, keyboardAccess: true, noOverflow: true, touchTargets44px: true, recordsUnchanged: true, noNetworkWrites: true });
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualComponents: true, syntheticOnly: true, results }, null, 2));
    console.log(`PASS item photos browser: ${results.length} viewport/theme cases, saved photo variants, catalog fallback, list/detail/Back, keyboard access, full artwork and unchanged records.`);
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure.txt"), await lastPage.locator("body").innerText().catch(() => "No body"));
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ actualComponents: true, syntheticOnly: true, results, error: String(error) }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
