const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const output = "artifacts/qa/global-search-presentation";
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) for (const route of ["/settings", "/scout", "/exchange/market"]) {
      const page = await browser.newPage({ viewport: { width, height: width === 360 ? 800 : 1000 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        const url = new URL(route, process.env.APP_URL || "http://127.0.0.1:5217/");
        url.searchParams.set("betaLocalMode", "true");
        url.searchParams.set("themeInspect", theme);
        await page.goto(url.href);
        const trigger = route === "/settings" ? page.locator(".settings-layout").getByRole("button", { name: "Search the app", exact: true }) : page.getByRole("button", { name: "Compass", exact: true });
        const search = page.locator(".app-search.expanded");
        const input = page.getByRole("textbox", { name: "Search across Code 3 TCG", exact: true });

        async function assertExposedFocus(label) {
          const focus = await page.evaluate(() => {
            const active = document.activeElement;
            const rect = active.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return { visible: active.checkVisibility(), exposed: hit === active || active.contains(hit), top: rect.top, bottom: rect.bottom, viewport: innerHeight };
          });
          assert.ok(focus.visible && focus.exposed && focus.top >= 0 && focus.bottom <= focus.viewport, `${label}: ${JSON.stringify(focus)}`);
        }
        async function openSearch() {
          await trigger.click();
          await expect(input).toBeVisible();
          await expect(input).toBeFocused();
          await assertExposedFocus("Search input must be visible and above navigation");
        }
        await openSearch();
        const layout = await search.evaluate(root => {
          const input = root.querySelector("input").getBoundingClientRect();
          const cards = [...root.querySelectorAll(".global-search-destination-card")].map(card => {
            const title = card.querySelector("strong");
            const description = card.querySelector("small");
            const titleRect = title.getBoundingClientRect();
            const descriptionRect = description.getBoundingClientRect();
            const rect = card.getBoundingClientRect();
            return { label: title.textContent, height: rect.height, separated: titleRect.bottom <= descriptionRect.top + 1, contained: descriptionRect.right <= rect.right && descriptionRect.bottom <= rect.bottom, readable: parseFloat(getComputedStyle(description).fontSize) >= 12 };
          });
          const header = root.querySelector(".app-search-results > .compact-card-header p");
          return { inputWidth: input.width, inputHeight: input.height, overflow: document.documentElement.scrollWidth - innerWidth, cards, headerClipped: header.scrollWidth > header.clientWidth + 1 || header.scrollHeight > header.clientHeight + 1 };
        });
        assert.ok(layout.inputWidth >= 280 && layout.inputHeight >= 44, JSON.stringify(layout));
        assert.ok(layout.overflow <= 1 && !layout.headerClipped, JSON.stringify(layout));
        assert.equal(layout.cards.length, 6, "Every existing search destination remains available");
        assert.ok(layout.cards.every(card => card.height >= 44 && card.separated && card.contained && card.readable), JSON.stringify(layout.cards));
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1).replaceAll("/", "-")}-open.png` });

        // Queries inspect existing local data; no search destination that invokes a remote service is run.
        await input.fill("collection");
        await expect(search.getByRole("heading", { name: "Local matches", exact: true })).toBeVisible();
        const lastResult = search.locator(".app-search-local-results button").last();
        await lastResult.focus();
        await assertExposedFocus("Last local result must scroll into view without being covered");
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1).replaceAll("/", "-")}-results.png` });
        if (width === 360) {
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => !!document.activeElement.closest(".app-search.expanded")), true, "Mobile Search keyboard focus must remain in its full-screen panel");
          await assertExposedFocus("Wrapped mobile Search focus");
          await page.keyboard.press("Shift+Tab");
          await expect(lastResult).toBeFocused();
          await assertExposedFocus("Reverse-wrapped mobile Search focus");
        }

        const close = search.getByRole("button", { name: width === 360 ? "Close search" : "Close", exact: true });
        await close.click();
        await expect(search).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await openSearch();
        await expect(input).toHaveValue("");
        await input.fill("collection");
        await page.keyboard.press("Escape");
        await expect(search).toHaveCount(0);
        await expect(trigger).toBeFocused();
        assert.equal(new URL(page.url()).pathname, route, "Closing Search preserves its originating route");

        if (width === 1440 && route === "/settings") {
          await input.focus();
          await input.fill("collection");
          await expect(search).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(search).toHaveCount(0);
          await expect(input).toBeFocused();
          await input.pressSequentially("collection");
          await expect(search.getByRole("heading", { name: "Local matches", exact: true })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(search).toHaveCount(0);
        }

        await openSearch();
        await search.getByRole("button", { name: /^Search Collection/ }).click();
        await expect(search).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Portfolio & Collection Health", exact: true })).toBeVisible();
        assert.equal(new URL(page.url()).pathname, "/vault/cards", "Search Collection retains its existing Vault destination");
        assert.equal(await page.evaluate(() => !!document.activeElement.closest(".app-search, .settings-layout")), false, "Destination navigation must not restore focus to the old Search entry point");
        assert.equal(await page.locator(".app").getAttribute("data-theme"), theme, "Navigation preserves the selected theme");
        assert.deepEqual(errors, []);
        results.push({ theme, width, route, status: "passed" });
        console.log(`PASS global Search presentation, keyboard close and local navigation: ${theme} ${width} ${route}`);
      } catch (error) {
        results.push({ theme, width, route, status: "failed", error: error.message, pageErrors: errors });
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1).replaceAll("/", "-")}-failure.png` });
        console.error(`FAIL global Search: ${theme} ${width} ${route}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    assert.ok(results.every(result => result.status === "passed"), "See global-search-presentation/results.json for failures");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
