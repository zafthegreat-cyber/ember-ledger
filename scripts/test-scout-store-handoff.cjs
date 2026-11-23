const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

// The palette moved to warm cream/maroon/gold tokens (no blue or teal, Nov 2026), so expected colours are
// resolved from the live design tokens instead of hard-coded legacy hex values.
const tokenNames = ["--surface-primary", "--action-primary", "--on-primary", "--text-primary", "--app-brand-selected", "--app-brand-selected-border"];
function resolveTokens(root, names) {
  return Object.fromEntries(names.map((name) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;background-color:var(${name});color:var(${name})`;
    root.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [name, value];
  }));
}
const transparent = (color) => color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);
function assertSecondaryAction(action, tokens, label) {
  // Secondary actions sit on the opaque surface: either painted with it or transparent over it.
  assert.ok(action.background === tokens["--surface-primary"] || transparent(action.background), `${label}: secondary action must use the neutral surface (${action.background})`);
  assert.notEqual(action.background, tokens["--action-primary"], `${label}: secondary and primary actions must be visually distinct`);
}

async function openDisclosure(disclosure) {
  if (!(await disclosure.evaluate(element => element.open))) await disclosure.locator(":scope > summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
}

async function checkWizardPresentation(page, modal, state, output, theme, width) {
  const section = modal.locator(".scout-where-step");
  await expect(section).toBeVisible();
  await expect(modal.getByRole("button", { name: "Continue", exact: true })).toHaveCount(1);
  await openDisclosure(modal.locator(".stock-report-time-disclosure"));
  const metrics = await modal.evaluate((dialog, { selectionState, tokenNames, resolveTokensSource }) => {
    const resolveTokens = new Function(`return (${resolveTokensSource})`)();
    const visible = element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden" || getComputedStyle(element).display === "none") return false;
      for (let ancestor = element.parentElement; ancestor && ancestor !== dialog; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === "DETAILS" && !ancestor.open && !ancestor.querySelector(":scope > summary")?.contains(element)) return false;
      }
      return true;
    };
    const where = dialog.querySelector(".scout-where-step");
    const cards = [...where.querySelectorAll(".scout-report-store-card")];
    const rect = (element) => {
      const { x, y, width: w, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width: w, height, right, bottom };
    };
    const foot = dialog.querySelector(".flow-modal-footer--scout-inline");
    const helpers = [...where.querySelectorAll("p, small, .scout-report-store-meta, .scout-location-trust-note, .scout-report-step-header > span")].filter(visible);
    const controls = [...where.querySelectorAll("button, input, summary"), ...foot.querySelectorAll("button")].filter(visible);
    const note = where.querySelector(".scout-location-trust-note");
    return {
      tokens: resolveTokens(dialog, tokenNames),
      state: selectionState,
      minHelperSize: Math.min(...helpers.map((element) => parseFloat(getComputedStyle(element).fontSize))),
      controls: controls.map((element) => ({ name: element.textContent.trim() || element.placeholder || element.type, ...rect(element) })),
      cards: cards.map((element) => ({
        ...rect(element), background: getComputedStyle(element).backgroundColor,
        backgroundImage: getComputedStyle(element).backgroundImage,
        border: getComputedStyle(element).borderTopColor,
        metadata: [...element.querySelectorAll(".scout-report-store-meta > span")].map(rect),
      })),
      trustNote: note ? { title: rect(note.querySelector("strong")), detail: rect(note.querySelector("span")) } : null,
      search: where.querySelector(".scout-report-store-tools input") ? rect(where.querySelector(".scout-report-store-tools input")) : null,
      section: rect(where), footer: {
        ...rect(foot), background: getComputedStyle(foot).backgroundColor, backgroundImage: getComputedStyle(foot).backgroundImage,
        actions: [...foot.querySelectorAll("button")].map((element) => ({
          secondary: element.classList.contains("secondary-button"),
          background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color,
          border: getComputedStyle(element).borderTopColor,
        })),
      },
      overflow: Math.max(dialog.scrollWidth - dialog.clientWidth, where.scrollWidth - where.clientWidth),
    };
  }, { selectionState: state, tokenNames, resolveTokensSource: resolveTokens.toString() });
  assert.ok(metrics.minHelperSize >= 13, `Wizard helpers must be readable: ${metrics.minHelperSize}px`);
  assert.ok(metrics.overflow <= 1, `Wizard must not overflow horizontally: ${metrics.overflow}px`);
  for (const control of metrics.controls) {
    assert.ok(control.height >= 44 && control.width >= 44, `${control.name} needs a 44px target (${control.width}x${control.height})`);
  }
  const { tokens } = metrics;
  const surface = tokens["--surface-primary"];
  for (const [index, card] of metrics.cards.entries()) {
    assert.equal(card.backgroundImage, "none", "Store cards must use neutral surfaces, not gradients");
    if (state === "selected") {
      // brand-refresh.css marks the chosen store with the shared selected wash and gold edge.
      assert.equal(card.background, tokens["--app-brand-selected"], "Selected store uses the selected wash");
      assert.equal(card.border, tokens["--app-brand-selected-border"], "Selected store needs a distinct accent edge");
      assert.notEqual(card.border, metrics.footer.border, "Selected edge must differ from neutral borders");
    } else {
      assert.equal(card.background, surface, "Unselected store cards use the neutral surface");
    }
    if (index) assert.ok(card.y - metrics.cards[index - 1].bottom >= 8, "Store results need visible separation");
    card.metadata.forEach((item, itemIndex) => {
      if (!itemIndex) return;
      const previous = card.metadata[itemIndex - 1];
      assert.ok(item.y >= previous.bottom + 3 || item.x >= previous.right + 6, "Store metadata must not run together");
    });
  }
  assert.equal(metrics.footer.background, surface, "Sticky action bar must be opaque");
  assert.equal(metrics.footer.backgroundImage, "none");
  for (const action of metrics.footer.actions) {
    if (action.secondary) {
      assertSecondaryAction(action, tokens, "Wizard footer");
      assert.equal(action.color, tokens["--text-primary"]);
      assert.ok(!transparent(action.border) && action.border !== metrics.footer.background, "Secondary action needs a visible outline");
    } else {
      assert.equal(action.background, tokens["--action-primary"], "Primary action uses the primary accent");
      assert.equal(action.color, tokens["--on-primary"]);
    }
  }
  if (metrics.trustNote) {
    assert.ok(metrics.trustNote.detail.y - metrics.trustNote.title.bottom >= 4, "Location guidance needs separate title and detail lines");
    assert.ok(metrics.search.width >= metrics.section.width - 2, "Store search should use the available width");
  }

  // A keyboard user must be able to reach a final time preset above the sticky actions.
  const preset = section.getByRole("button", { name: "Pick date", exact: true });
  await preset.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(preset).toBeFocused();
  const focused = await preset.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const footer = element.closest(".flow-modal").querySelector(".flow-modal-footer--scout-inline").getBoundingClientRect();
    const style = getComputedStyle(element);
    return { top: bounds.top, bottom: bounds.bottom, footerTop: footer.top, outline: parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle };
  });
  assert.ok(focused.outline >= 2 && focused.outlineStyle !== "none", "Keyboard focus must remain visible");
  assert.ok(focused.top >= 0 && focused.bottom + focused.outline <= focused.footerTop, "Time preset and its focus ring must clear the sticky actions");
  metrics.focusedPreset = focused;
  await page.screenshot({ path: path.join(output, `wizard-${state}-time-${theme}-${width}.png`) });
  await section.evaluate((element) => {
    const dialog = element.closest(".flow-modal");
    dialog.scrollTop += element.getBoundingClientRect().top - dialog.getBoundingClientRect().top - 18;
  });
  await page.screenshot({ path: path.join(output, `wizard-${state}-${theme}-${width}.png`) });
  return metrics;
}

(async () => {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic handoff test is local-only");
  const output = path.resolve(process.env.QA_OUTPUT_DIR || path.join(__dirname, "../artifacts/qa/release-readiness/scout-store-handoff"));
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 } });
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (!["GET", "HEAD"].includes(route.request().method())) return route.abort();
        return url.origin === base.origin || !["http:", "https:"].includes(url.protocol) ? route.continue() : route.abort();
      });
      await context.addInitScript(() => {
        if (localStorage.getItem("synthetic-store-handoff")) return;
        localStorage.setItem("synthetic-store-handoff", "1");
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({
          stores: [
            { id: "synthetic-store-alpha", name: "Audit North Store", nickname: "Audit North Store", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "1 Synthetic North Way", zip: "23510" },
            { id: "synthetic-store-beta", name: "Audit South Store", nickname: "Audit South Store", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "2 Synthetic South Way", zip: "23510" },
          ], reports: [], items: [{ id: "synthetic-sighting", storeId: "synthetic-store-beta", name: "Synthetic tracked pack", sku: "QA-ONLY" }], dropRadarSeedDisabled: true,
        }));
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      const result = { theme, width };
      try {
        await page.goto(new URL(`/scout/stores/synthetic-store-alpha?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(page.getByRole("heading", { name: "Audit North Store", exact: true }).first()).toBeVisible({ timeout: 30000 });
        await page.getByRole("button", { name: "Submit Report", exact: true }).first().click();
        const modal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        await expect(modal).toBeVisible();
        await openDisclosure(modal.locator(".stock-report-time-disclosure"));
        await modal.locator("input[type=datetime-local]").fill("2026-09-14T09:45");
        result.selectedPresentation = await checkWizardPresentation(page, modal, "selected", output, theme, width);
        await modal.getByRole("button", { name: "Change store", exact: true }).click();
        const search = modal.getByPlaceholder("Search store, city, ZIP, or nickname");
        const southResult = modal.locator(".scout-report-store-card--result").filter({ hasText: "Audit South Store" });
        const northResult = modal.locator(".scout-report-store-card--result").filter({ hasText: "Audit North Store" });
        await search.fill("Audit South Store");
        result.unselectedPresentation = await checkWizardPresentation(page, modal, "unselected", output, theme, width);
        const recordSnapshot = await page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
          return { stores: saved.stores, reports: saved.reports, items: saved.items };
        });
        const originalUrl = page.url();
        const historyLength = await page.evaluate(() => history.length);
        await southResult.getByRole("button", { name: "Open store details", exact: true }).click();
        await expect(modal).toHaveCount(0);
        await page.waitForURL(/\/scout\/stores\/synthetic-store-beta\?/);
        await expect(page.getByRole("heading", { name: "Audit South Store", exact: true }).first()).toBeVisible();
        await expect(page.getByRole("heading", { name: "Recent Reports", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Tracked Products / Sightings", exact: true })).toBeVisible();
        await expect(page.getByText("Synthetic tracked pack", { exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => history.length), historyLength + 1);
        await page.screenshot({ path: path.join(output, `store-${theme}-${width}.png`), fullPage: true });
        await page.getByRole("button", { name: "Return to report", exact: true }).click();
        await expect(modal).toBeVisible();
        assert.equal(page.url(), originalUrl);
        await expect(search).toHaveValue("Audit South Store");
        assert.equal(await page.evaluate(() => history.length), historyLength + 1, "Restoring the report must not add a history entry");
        await page.goForward();
        await expect(modal).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Audit South Store", exact: true }).first()).toBeVisible();
        await page.goBack();
        await expect(modal).toBeVisible();
        await expect(search).toHaveValue("Audit South Store");
        await southResult.getByRole("button", { name: "Select store", exact: true }).click();
        await expect(modal.locator("input[type=datetime-local]")).toHaveValue("2026-09-14T09:45");
        await modal.getByRole("button", { name: "Change store", exact: true }).click();
        await search.fill("Audit North Store");
        await northResult.getByRole("button", { name: "Open store details", exact: true }).click();
        await expect(modal).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Audit North Store", exact: true }).first()).toBeVisible();
        await page.goBack();
        await expect(modal).toBeVisible();
        await expect(search).toHaveValue("Audit North Store");
        await page.goForward();
        await expect(modal).toHaveCount(0);
        await page.goBack();
        await expect(modal).toBeVisible();
        await expect(search).toHaveValue("Audit North Store");
        await page.screenshot({ path: path.join(output, `draft-restored-${theme}-${width}.png`) });
        const after = await page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
          return { stores: saved.stores, reports: saved.reports, items: saved.items };
        });
        assert.deepEqual(after, recordSnapshot, "Viewing records and returning cannot mutate stores, reports, or sightings");

        // Only this disposable local fixture is saved; every network write is blocked.
        await northResult.getByRole("button", { name: "Select store", exact: true }).click();
        await modal.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(modal.getByRole("heading", { name: "What did you see?", exact: true })).toBeVisible();
        await expect(modal.getByRole("group", { name: "Shelf status", exact: true })).toBeVisible();
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await modal.getByLabel("Product name (optional)", { exact: true }).fill("Synthetic presentation pack");
        await openDisclosure(modal.locator(".scout-proof-disclosure"));
        await modal.getByRole("button", { name: /^No proof/ }).click();
        await modal.getByRole("button", { name: "Review report", exact: true }).click();
        await expect(modal.getByRole("heading", { name: "Ready to share this report?", exact: true })).toBeVisible();
        await modal.getByRole("button", { name: "Back", exact: true }).click();
        await expect(modal.getByLabel("Product name (optional)", { exact: true })).toHaveValue("Synthetic presentation pack");
        await modal.getByRole("button", { name: "Review report", exact: true }).click();
        const save = modal.getByRole("button", { name: "Save Report", exact: true });
        await expect(save).toHaveCount(1);
        await expect(save).toBeEnabled();
        result.reviewPresentation = await modal.locator(".scout-report-review-grid").first().evaluate((grid) => ({
          overflow: grid.scrollWidth - grid.clientWidth,
          // The "Shared with" visibility select (added Nov 2026) is a form control, not a label/value pair;
          // it is checked for readable text separately.
          pairs: [...grid.children].filter((row) => row.querySelector("strong")).map((row) => {
            const label = row.querySelector(".scout-review-group-heading") || row.querySelector("span");
            const value = row.querySelector("strong");
            return { labelSize: parseFloat(getComputedStyle(label).fontSize), gap: value.getBoundingClientRect().top - label.getBoundingClientRect().bottom };
          }),
          sharingTextSizes: [...grid.querySelectorAll(".stock-report-review-sharing :is(label, select, small)")].map((node) => parseFloat(getComputedStyle(node).fontSize)),
        }));
        assert.ok(result.reviewPresentation.overflow <= 1);
        assert.ok(result.reviewPresentation.pairs.every((pair) => pair.labelSize >= 13 && pair.gap >= 4), "Review labels and values must remain separated and readable");
        assert.ok(result.reviewPresentation.pairs.length >= 2, "Review shows store/time and shelf/product summaries");
        assert.ok(result.reviewPresentation.sharingTextSizes.every((size) => size >= 13), `Sharing control text must be readable: ${result.reviewPresentation.sharingTextSizes}`);
        await modal.locator(".scout-report-step-card.active").evaluate((element) => {
          const dialog = element.closest(".flow-modal");
          dialog.scrollTop += element.getBoundingClientRect().top - dialog.getBoundingClientRect().top - 18;
        });
        await page.screenshot({ path: path.join(output, `wizard-review-content-${theme}-${width}.png`) });
        await save.focus();
        assert.ok((await save.boundingBox()).height >= 44, "Save must retain its full touch target");
        await page.screenshot({ path: path.join(output, `wizard-review-${theme}-${width}.png`) });
        await save.click();
        await expect(modal.locator(".scout-quick-report-success").getByRole("heading", { name: /report saved\./ })).toBeVisible();
        const close = modal.locator(".flow-modal-footer--scout-inline").getByRole("button", { name: "Done", exact: true });
        await expect(close).toBeVisible();
        assert.ok((await close.boundingBox()).height >= 44, "Submitted Close must retain its full touch target");
        const confirmation = modal.locator(".scout-quick-report-sent");
        result.submittedPresentation = await confirmation.evaluate((section, { tokenNames, resolveTokensSource }) => {
          const resolveTokens = new Function(`return (${resolveTokensSource})`)();
          const helpers = [...section.querySelectorAll("p, small, .scout-submit-confirmation-grid > div > span")];
          const buttons = [...section.querySelectorAll("button")];
          return {
            tokens: resolveTokens(section, tokenNames),
            overflow: section.scrollWidth - section.clientWidth,
            minHelperSize: Math.min(...helpers.map((element) => parseFloat(getComputedStyle(element).fontSize))),
            summaryGaps: [...section.querySelectorAll(".scout-submit-confirmation-grid > div")].map((row) => (
              row.querySelector("strong").getBoundingClientRect().top - row.querySelector("span").getBoundingClientRect().bottom
            )),
            actions: buttons.map((button) => {
              const rect = button.getBoundingClientRect();
              const style = getComputedStyle(button);
              return { name: button.textContent.trim(), width: rect.width, height: rect.height, secondary: button.classList.contains("secondary-button"), background: style.backgroundColor, image: style.backgroundImage };
            }),
            optionalGap: parseFloat(getComputedStyle(section.querySelector(".quick-actions")).gap),
          };
        }, { tokenNames, resolveTokensSource: resolveTokens.toString() });
        assert.ok(result.submittedPresentation.overflow <= 1, "Submitted confirmation must not overflow horizontally");
        assert.ok(result.submittedPresentation.minHelperSize >= 13);
        assert.ok(result.submittedPresentation.summaryGaps.every((gap) => gap >= 4), "Saved labels and values must remain separated");
        assert.ok(result.submittedPresentation.optionalGap >= 8, "Optional detail controls need usable spacing");
        for (const action of result.submittedPresentation.actions) {
          assert.ok(action.width >= 44 && action.height >= 44, `${action.name} needs a 44px target`);
          assert.equal(action.image, "none");
          if (action.secondary) assertSecondaryAction(action, result.submittedPresentation.tokens, `Submitted ${action.name}`);
          else assert.equal(action.background, result.submittedPresentation.tokens["--action-primary"], `Submitted ${action.name} uses the primary accent`);
        }
        await modal.evaluate((dialog) => { dialog.scrollTop = 0; });
        await page.screenshot({ path: path.join(output, `wizard-submitted-${theme}-${width}.png`) });
        const done = close;
        await done.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(done).toBeFocused();
        const doneFocus = await done.evaluate((button) => ({
          top: button.getBoundingClientRect().top,
          bottom: button.getBoundingClientRect().bottom,
          footerTop: button.closest(".flow-modal").querySelector(".flow-modal-footer--scout-inline").getBoundingClientRect().top,
          footerBottom: button.closest(".flow-modal").querySelector(".flow-modal-footer--scout-inline").getBoundingClientRect().bottom,
          outline: parseFloat(getComputedStyle(button).outlineWidth),
        }));
        result.submittedPresentation.doneFocus = doneFocus;
        assert.ok(doneFocus.outline >= 2 && doneFocus.top - doneFocus.outline >= doneFocus.footerTop && doneFocus.bottom + doneFocus.outline <= doneFocus.footerBottom, "Done keyboard focus must remain fully visible inside its sticky footer");
        await page.screenshot({ path: path.join(output, `wizard-submitted-actions-${theme}-${width}.png`) });
        const submitted = await page.evaluate(() => JSON.parse(localStorage.getItem("et-tcg-beta-scout")));
        assert.equal(submitted.reports.length, recordSnapshot.reports.length + 1);
        assert.equal(submitted.reports[0].productName, "Synthetic presentation pack");
        assert.deepEqual(submitted.stores, recordSnapshot.stores);
        await close.click();
        await expect(modal).toHaveCount(0);
        result.localSubmissionVerified = true;
        await page.goto(new URL(`/scout/stores/synthetic-missing-store?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(page.getByRole("heading", { name: "Store unavailable", exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole("button", { name: "Browse stores", exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(output, `unknown-${theme}-${width}.png`) });
        assert.deepEqual(errors, []);
        result.passed = true;
        console.log(`PASS Scout handoff ${theme} ${width}: record/Return/Back draft preserved without record writes; wizard selected/unselected layout, keyboard clearance, isolated local save/Close, unknown ID`);
      } catch (error) {
        result.passed = false; result.error = error.message; result.pageErrors = errors;
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`) }).catch(() => {});
        console.error(`FAIL Scout handoff ${theme} ${width}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.length === 4 && results.every((result) => result.passed), "See scout-store-handoff/results.json");
})().catch((error) => { console.error(error); process.exitCode = 1; });
