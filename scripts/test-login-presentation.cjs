const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const output = "artifacts/qa/login-refresh";
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [360, 875, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 960 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const url = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
        url.searchParams.set("themeInspect", theme);
        await page.goto(url.href);
        await page.getByRole("heading", { name: "Welcome back!" }).waitFor();
        const geometry = await page.evaluate(() => {
          const logo = document.querySelector(".auth-brand-mark").getBoundingClientRect();
          const card = document.querySelector(".signed-out-auth-card").getBoundingClientRect();
          const inputs = [...document.querySelectorAll(".auth-form input")].map(el => ({ width: el.clientWidth, height: el.getBoundingClientRect().height }));
          return { logo: logo.width, cardTop: card.top, cardRight: card.right, inputs, overflow: document.documentElement.scrollWidth - innerWidth };
        });
        assert.ok(geometry.logo <= 48, JSON.stringify(geometry));
        assert.ok(geometry.cardTop < 160 && geometry.cardRight <= width, JSON.stringify(geometry));
        assert.ok(geometry.inputs.every(input => input.width >= 180 && input.height >= 44));
        assert.ok(geometry.overflow <= 1);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: output + "/" + theme + "-" + width + ".png", fullPage: true });
        await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
        await page.getByRole("heading", { name: "Reset Password", exact: true }).waitFor();
        await page.getByRole("button", { name: "Back to Log In", exact: true }).click();
        await page.getByRole("button", { name: "Request Beta Access", exact: true }).click();
        await page.getByRole("heading", { name: "Create your account", exact: true }).waitFor();
        const signupGeometry = await page.evaluate(() => {
          const username = document.querySelector('.auth-form input[autocomplete="nickname"]').getBoundingClientRect();
          const email = document.querySelector('.auth-form input[autocomplete="email"]').getBoundingClientRect();
          const termsLink = document.querySelector('.signup-consent-box .inline-text-button');
          return {
            usernameWidth: username.width,
            usernameHeight: username.height,
            emailWidth: email.width,
            termsBackground: getComputedStyle(termsLink).backgroundImage,
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        assert.ok(signupGeometry.usernameWidth >= 180 && Math.abs(signupGeometry.usernameWidth - signupGeometry.emailWidth) <= 1, `Signup username must use the full field width: ${JSON.stringify(signupGeometry)}`);
        assert.ok(Math.abs(signupGeometry.usernameHeight - 48) <= 1, `Signup username must not stretch to match helper copy: ${JSON.stringify(signupGeometry)}`);
        assert.equal(signupGeometry.termsBackground, "none", "Terms / Privacy must use the semantic link style without a legacy gradient");
        assert.ok(signupGeometry.overflow <= 1, `Signup must not overflow: ${JSON.stringify(signupGeometry)}`);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: output + "/" + theme + "-" + width + "-signup.png", fullPage: true });
        console.log("PASS login layout and reset/signup navigation:", theme, width);
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
