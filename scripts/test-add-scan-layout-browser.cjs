const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/add-scan-layout");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5242");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic scan checks are loopback only");
const base = appUrl.origin;
const baseline = Boolean(process.env.QA_SCAN_BASELINE);
const requestedWidths = process.env.QA_SCAN_WIDTHS?.split(",").map(Number);
const cases = baseline ? [{ width: 320, height: 568, theme: "dark", textScale: 1 }] : [
  ...[{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]
    .flatMap(viewport => ["light", "dark"].map(theme => ({ ...viewport, theme, textScale: 1 }))),
  ...["light", "dark"].map(theme => ({ width: 320, height: 568, theme, textScale: 2 })),
].filter(item => !requestedWidths || requestedWidths.includes(item.width));

async function rowGeometry(chooser) {
  return chooser.locator(".add-anything-option").evaluateAll(elements => elements.filter(element => element.getClientRects().length && !element.closest("details:not([open])")).map(element => {
    const rect = node => { const value = node.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom }; };
    return { title: element.querySelector("strong").textContent, disabled: element.disabled, row: rect(element), icon: rect(element.querySelector(".command-icon")), label: rect(element.querySelector("strong")), helper: rect(element.querySelector("small")), badge: element.querySelector("em") ? rect(element.querySelector("em")) : null };
  }));
}

function verifyRows(rows, width) {
  assert.ok(rows.length >= 6, "All six available paths remain present");
  for (const row of rows) {
    assert.ok(Math.abs(row.label.x - row.helper.x) < 2, `${row.title}: helper aligns with label instead of the icon column`);
    assert.ok(row.helper.width >= 140 && row.helper.width >= row.row.width * 0.6, `${row.title}: helper uses remaining row width (${row.helper.width}px)`);
    assert.ok(row.helper.y >= row.label.bottom + 1, `${row.title}: helper is below the label`);
    assert.ok(row.label.x >= row.icon.right + 3, `${row.title}: label does not overlap the icon`);
    assert.ok(row.row.height >= 44 && row.row.width >= 44, `${row.title}: usable touch target`);
    assert.ok(row.row.x >= -1 && row.row.right <= width + 1, `${row.title}: no viewport overflow`);
    assert.ok(row.helper.right <= row.row.right + 1 && row.helper.bottom <= row.row.bottom + 1, `${row.title}: helper remains inside the row`);
    if (row.badge) {
      assert.ok(Math.abs(row.badge.x - row.label.x) < 2 && row.badge.y >= row.helper.bottom + 1, `${row.title}: Coming later badge has its own line`);
      assert.ok(row.badge.right <= row.row.right + 1 && row.badge.bottom <= row.row.bottom + 1, `${row.title}: badge remains inside the row`);
    }
  }
  for (let index = 1; index < rows.length; index += 1) assert.ok(rows[index].row.y >= rows[index - 1].row.bottom - 1, "Choice rows do not overlap");
}

async function contrastReport(chooser) {
  return chooser.locator(".add-anything-option:not(:disabled)").evaluateAll(elements => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
    const over = (front, back) => { const alpha = front[3] ?? 1; return front.slice(0, 3).map((channel, index) => channel * alpha + back[index] * (1 - alpha)); };
    const luminance = color => color.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const background = element => { const chain = []; for (let node = element; node; node = node.parentElement) chain.unshift(node); return chain.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]); };
    return elements.flatMap(element => ["strong", "small"].map(selector => {
      const node = element.querySelector(selector); const backdrop = background(node); const color = over(rgba(getComputedStyle(node).color), backdrop); const a = luminance(color); const b = luminance(backdrop);
      return { title: element.querySelector("strong").textContent, part: selector, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), foreground: getComputedStyle(node).color, background: backdrop };
    }));
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = []; let lastPage; let lastStep = "Start";
  try {
    for (const { width, height, theme, textScale } of cases) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const blockedWrites = []; const blockedExternal = [];
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") { blockedWrites.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
        if (url.origin !== base) { blockedExternal.push(`${url.origin}${url.pathname}`); return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (!localStorage.getItem("__qa_scan_seeded")) {
          localStorage.setItem("__qa_scan_seeded", "true");
          localStorage.setItem("et-tcg-app-theme", theme);
          localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "qa-original-card", name: "Synthetic preserved card", quantity: 2 }], sales: [], expenses: [] }));
        }
      }, { theme });
      const page = await context.newPage(); lastPage = page;
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      const prefix = `${width}-${theme}${textScale === 2 ? "-text200" : ""}`;
      lastStep = `${prefix}: load home and open Add`;
      await page.goto(`${base}/?betaLocalMode=true`);
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
      const dataSnapshot = () => page.evaluate(() => { const data = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([data.items, data.sales, data.expenses]); });
      const before = await dataSnapshot();
      const opener = page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first();
      await opener.click();
      const modal = page.locator('.flow-modal[data-flow="addActionSheet"]');
      await expect(modal).toBeVisible();
      await expect(modal.locator(".add-anything-entry")).toBeVisible();
      await modal.getByRole("button", { name: /^Scan (Listing|or review)\./ }).click();
      const chooser = modal.locator(".add-anything-scan-foundation");
      await expect(chooser).toBeVisible();
      const body = modal.locator(".flow-modal-body");
      const close = modal.locator(".modal-close-button");
      if (textScale === 2) {
        // Emulate a browser text-only accessibility increase. Snapshot first so
        // descendants are not scaled twice through inheritance.
        await modal.evaluate(element => {
          const nodes = [...element.querySelectorAll("h2, p, strong, small, em, summary, button")];
          const sizes = nodes.map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
          for (const [node, size] of sizes) node.style.setProperty("font-size", `${size * 2}px`, "important");
        });
      }
      const initialRows = await rowGeometry(chooser);
      await page.screenshot({ path: path.join(output, `${prefix}-${baseline ? "baseline" : "scan-top"}.png`) });
      if (baseline) {
        fs.writeFileSync(path.join(output, "baseline.json"), JSON.stringify({ width, height, theme, rows: initialRows }, null, 2));
        console.log(`Captured baseline ${width} ${theme}: helper widths ${initialRows.map(row => row.helper.width).join(", ")}`);
        await context.close(); continue;
      }
      lastStep = `${prefix}: scan chooser geometry and contrast`;
      verifyRows(initialRows, width);
      assert.equal(initialRows.length, 6, "Coming later modes start collapsed");
      const colors = await contrastReport(chooser);
      assert.ok(colors.every(color => color.ratio >= 4.5), `Available choice text meets 4.5:1 contrast: ${JSON.stringify(colors.filter(color => color.ratio < 4.5))}`);
      const future = chooser.locator("details.scan-anything-unavailable");
      await expect(future).not.toHaveAttribute("open", "");
      await future.locator("summary").click();
      await expect(future).toHaveAttribute("open", "");
      await expect(future.locator("button:disabled")).toHaveCount(4);
      assert.deepEqual(await future.locator("strong").allTextContents(), ["Scan Card", "Scan Binder", "Scan Slab", "Scan Receipt"]);
      const expandedRows = await rowGeometry(chooser); verifyRows(expandedRows, width);
      await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(close).toBeInViewport({ ratio: 1 });
      const closeBox = await close.boundingBox(); assert.ok(closeBox.width >= 44 && closeBox.height >= 44, "Close has a 44px touch target");
      assert.equal(await modal.evaluate(element => element.scrollWidth > element.clientWidth || document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow");
      await page.screenshot({ path: path.join(output, `${prefix}-scan-coming-later.png`) });

      lastStep = `${prefix}: modal keyboard and Back`;
      await close.focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('.flow-modal[data-flow="addActionSheet"]'))), true, "Shift+Tab remains in modal");
      await page.keyboard.press("Tab"); await expect(close).toBeFocused();
      await chooser.locator(".add-anything-path-header").getByRole("button", { name: "Back", exact: true }).click();
      await expect(modal.locator(".add-anything-entry")).toBeVisible();
      await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(opener).toBeFocused();

      if (textScale === 1) {
        lastStep = `${prefix}: working choices preserve callbacks without saving`;
        const paths = [
          { name: /^Search by name\./, selector: ".add-anything-search", title: "Search item" },
          { name: /^Enter UPC or SKU\./, selector: ".add-anything-upc", title: "Enter UPC/SKU" },
          { name: /^Manual entry\./, selector: ".add-anything-manual", title: "Manual entry" },
          { name: /^Scan page of cards\./, selector: ".add-anything-card-page-review", title: "Scan page of cards" },
          { name: /^Scout screenshot or photo review\./, selector: ".add-anything-scout-scan-review", title: "Review Scout Scan" },
        ];
        for (const target of paths) {
          await opener.click(); await expect(modal.locator(".add-anything-entry")).toBeVisible();
          await modal.getByRole("button", { name: /^Scan (Listing|or review)\./ }).click();
          await chooser.getByRole("button", { name: target.name }).click();
          const screen = modal.locator(target.selector); await expect(screen).toBeVisible();
          await expect(screen.locator(".add-anything-path-header strong")).toHaveText(target.title);
          if (target.selector === ".add-anything-card-page-review") await expect(screen.getByRole("textbox", { name: "Card name", exact: true })).toBeVisible();
          if (target.selector === ".add-anything-scout-scan-review") await expect(screen.getByRole("button", { name: "Save Report", exact: true })).toBeDisabled();
          await screen.locator(".add-anything-path-header").getByRole("button", { name: "Back", exact: true }).click();
          await expect(modal.locator(".add-anything-entry")).toBeVisible();
          await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
        }
      }
      assert.equal(await dataSnapshot(), before, "All seeded inventory, sales, and expenses remain unchanged");
      assert.deepEqual(blockedWrites, [], "No mutation request was attempted");
      assert.deepEqual(errors, [], "No browser runtime error");
      results.push({ width, height, theme, textScale, availablePaths: 6, unavailableModes: 4, correctlyAlignedRows: expandedRows, textContrast: colors, pinnedClose: true, closeTouchTarget: closeBox, keyboardTrapAndReturn: true, backToEntry: true, callbacksVerified: textScale === 1, recordsUnchanged: true, blockedWrites, blockedExternal, errors });
      console.log(`PASS scan chooser ${width}x${height} ${theme} text ${textScale * 100}%: full-width copy, distinct disabled badges, fixed close, keyboard, callbacks and unchanged records.`);
      await context.close();
    }
    if (!baseline) fs.writeFileSync(path.join(output, requestedWidths ? `results-${requestedWidths.join("-")}.json` : "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), realApp: true, syntheticOnly: true, results }, null, 2));
  } catch (error) {
    console.error(`FAILED ${lastStep}`);
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure-state.txt"), `${lastStep}\n${lastPage.url()}\n${await lastPage.locator("body").innerText().catch(() => "Body unavailable")}`);
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
