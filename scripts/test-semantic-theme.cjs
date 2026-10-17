const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const colors = {
  light: ["#F5F7FA", "#FFFFFF", "#202A35", "#5C6878", "#0F766E", "#FFFFFF", "#DCE3EA"],
  dark: ["#10151C", "#1A222D", "#F2F5F9", "#ACB8C8", "#67C8BB", "#102C27", "#344253"],
};
const tokens = ["--app-background", "--surface-primary", "--text-primary", "--text-secondary", "--action-primary", "--on-primary", "--border-subtle"];
const renderedRoutes = {
  "/": ".ops-home-page",
  "/collection": '[data-testid="collection-workspace"]',
  "/find": ".flip-deal-workspace",
  "/business": '[data-testid="business-workspace"]',
  "/settings": ".settings-layout",
};
const rgb = color => color.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16));
const luminance = color => rgb(color).map(channel => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
(async () => {
  const browser = await chromium.launch();
  const output = process.env.QA_OUTPUT_DIR || "artifacts/qa/semantic-theme";
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [360, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => localStorage.setItem("et-tcg-app-theme", theme), theme);
      const page = await context.newPage();
      for (const route of ["/", "/collection", "/find", "/business", "/settings"]) {
        const url = new URL(route, process.env.APP_URL || "http://127.0.0.1:5217/");
        url.searchParams.set("betaLocalMode", "true");
        await page.goto(url.href);
        await page.locator(".app[data-theme]").waitFor();
        await page.locator(renderedRoutes[route]).waitFor({ state: "visible" });
        await page.locator(".main > .route-loading-card").waitFor({ state: "hidden" });
        await page.waitForTimeout(300);
        const actual = await page.locator(".app[data-theme]").evaluate((app, tokens) => {
          const style = getComputedStyle(app);
          return { theme: app.dataset.theme, tokens: tokens.map(token => style.getPropertyValue(token).trim().toUpperCase()) };
        }, tokens);
        assert.equal(actual.theme, theme, "Saved theme must be respected: " + route);
        assert.deepEqual(actual.tokens, colors[theme], route);
        const palette = await page.locator(".app[data-theme]").evaluate(app => {
          const style = getComputedStyle(app);
          const names = ["--app-background", "--surface-primary", "--surface-secondary", "--surface-inset", "--surface-elevated", "--text-primary", "--text-secondary", "--action-primary", "--border-strong", "--status-success", "--status-warning", "--status-danger", "--status-info"];
          return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
        });
        for (const surface of ["--app-background", "--surface-primary", "--surface-secondary", "--surface-inset", "--surface-elevated"]) {
          for (const foreground of ["--text-primary", "--text-secondary", "--action-primary", "--status-success", "--status-warning", "--status-danger", "--status-info", "--border-strong"]) {
            assert.ok(contrast(palette[foreground], palette[surface]) >= (foreground === "--border-strong" ? 3 : 4.5), `${theme}: ${foreground} contrast on ${surface}`);
          }
        }
        const canvas = await page.evaluate(() => [document.documentElement, document.body].map(el => getComputedStyle(el).backgroundColor));
        assert.ok(canvas.every(color => color === `rgb(${rgb(colors[theme][0]).join(", ")})`), "Outer page canvas must follow saved theme");
        const buttons = await page.locator(".ops-button--primary:visible, .command-board-v4-primary-action:visible, .topbar-quick-add-button:visible, .mobile-quick-add-fab:visible").evaluateAll(nodes => nodes.filter(el => !el.disabled).map(el => {
          const s = getComputedStyle(el);
          return { text: el.textContent, background: s.backgroundColor, color: s.color, height: el.getBoundingClientRect().height, labels: [...el.querySelectorAll("b,strong,span")].map(label => getComputedStyle(label).color) };
        }));
        for (const button of buttons) {
          assert.equal(button.background, theme === "light" ? "rgb(15, 118, 110)" : "rgb(103, 200, 187)", button.text);
          assert.equal(button.color, theme === "light" ? "rgb(255, 255, 255)" : "rgb(16, 44, 39)", button.text);
          assert.ok(button.height >= 44, button.text);
          assert.ok(button.labels.every(color => color === button.color), "Nested primary label contrast: " + button.text);
        }
        assert.equal(await page.evaluate(() => localStorage.getItem("et-tcg-app-theme")), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: output + "/" + theme + "-" + width + "-" + (route.slice(1) || "home") + ".png", fullPage: true });
        if (route === "/collection") {
          await page.getByRole("button", { name: "Filter", exact: true }).click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          await page.keyboard.press("Tab");
          assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), "Dialog retains keyboard focus");
          await page.screenshot({ path: output + "/" + theme + "-" + width + "-filters.png", fullPage: true });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
        }
        console.log("PASS semantic palette, saved preference, primary actions, and dialog:", theme, width, route);
      }
      await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
