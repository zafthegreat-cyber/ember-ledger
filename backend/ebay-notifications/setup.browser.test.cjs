/* Isolated headless browser regression. All HTTP and clipboard behavior is mocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = "http://127.0.0.1:5371";
const provider = "https://syntheticpublishersetup.supabase.co";
const fixture = Object.freeze({ email: "publisher@example.test", password: "synthetic-password-not-real",
  token: "synthetic-verification-token-only-for-browser-tests", appId: "synthetic-application-id", certId: "synthetic-cert-id-not-real",
  accessToken: "synthetic-access-token", publishableKey: "synthetic-publishable-key", endpoint: `${provider}/functions/v1/ebay-account-deletion` });
const source = __dirname;
const output = path.resolve("artifacts/qa/ebay-publisher-setup");
const existing = '{"inventory":[{"id":"keep-owned-item","quantity":2}],"latestPrice":99.99}';
const results = [];

async function createFixture(browser, mode, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const calls = []; const unexpected = []; const errors = [];
  let configured = false;
  await context.addInitScript(({ existing, clipboardDenied }) => {
    localStorage.setItem("qa-existing-records", existing);
    sessionStorage.setItem("qa-existing-draft", "keep-existing-draft");
    window.qaStorageWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { window.qaStorageWrites.push(key); return setItem.call(this,key,value); };
    window.qaClipboard = [];
    Object.defineProperty(navigator,"clipboard",{ configurable:true,value:{ writeText: async (value) => {
      if (clipboardDenied) throw new DOMException("Synthetic denial","NotAllowedError");
      window.qaClipboard.push(value);
    } } });
  }, { existing, clipboardDenied: mode === "clipboard-denied" });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === base) {
      if (url.pathname === "/") return route.fulfill({ contentType:"text/html", body:fs.readFileSync(path.join(source,"setup.html"),"utf8") });
      if (url.pathname === "/setup.js") return route.fulfill({ contentType:"text/javascript", body:fs.readFileSync(path.join(source,"setup.js"),"utf8") });
      if (url.pathname === "/public-config.json") return route.fulfill({ status:mode === "config-error" ? 503 : 200, contentType:"application/json", body:JSON.stringify({ supabaseUrl:provider,publishableKey:fixture.publishableKey }) });
      if (url.pathname === "/favicon.ico") return route.fulfill({ status:204, body:"" });
    }
    if (url.origin !== provider || request.method() !== "POST") { unexpected.push({ origin:url.origin,path:url.pathname,method:request.method() }); return route.abort(); }
    const headers = request.headers(); const body = request.postDataJSON();
    calls.push({ path:url.pathname,method:request.method() });
    assert.equal(headers.apikey,fixture.publishableKey);
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"),"password");
      assert.deepEqual(body,{ email:fixture.email,password:fixture.password });
      if (mode === "network-error") return route.abort("failed");
      if (mode === "bad-password") return route.fulfill({ status:400,contentType:"application/json",body:JSON.stringify({ error_description:"PRIVATE_PROVIDER_DIAGNOSTIC" }) });
      return route.fulfill({ contentType:"application/json",body:JSON.stringify({ access_token:fixture.accessToken,refresh_token:"synthetic-unused-refresh-token" }) });
    }
    assert.equal(headers.authorization,`Bearer ${fixture.accessToken}`);
    if (url.pathname === "/rest/v1/rpc/code3_ebay_setup_info") {
      assert.deepEqual(body,{});
      if (mode === "wrong-owner") return route.fulfill({ status:403,contentType:"application/json",body:JSON.stringify({ message:"PRIVATE_OWNER_DIAGNOSTIC" }) });
      if (mode === "info-error") return route.fulfill({ status:503,contentType:"application/json",body:JSON.stringify({ message:"PRIVATE_INFO_DIAGNOSTIC" }) });
      return route.fulfill({ contentType:"application/json",body:JSON.stringify({ endpoint:fixture.endpoint,verificationToken:fixture.token,credentialsConfigured:configured }) });
    }
    if (url.pathname === "/rest/v1/rpc/code3_ebay_configure_credentials") {
      assert.deepEqual(body,{ p_client_id:fixture.appId,p_client_secret:fixture.certId });
      if (mode === "save-error") return route.fulfill({ status:503,contentType:"application/json",body:JSON.stringify({ message:"PRIVATE_SAVE_DIAGNOSTIC" }) });
      configured = true;
      return route.fulfill({ contentType:"application/json",body:JSON.stringify({ saved:true,credentialsConfigured:true }) });
    }
    if (url.pathname === "/rest/v1/rpc/code3_ebay_setup_status") {
      if (mode === "status-error") return route.fulfill({ status:503,contentType:"application/json",body:JSON.stringify({ message:"PRIVATE_STATUS_DIAGNOSTIC" }) });
      return route.fulfill({ contentType:"application/json",body:JSON.stringify({ received:2,processed:1,pending:0,needsReview:1,failed:0 }) });
    }
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"),"local");
      return route.fulfill({ status:204,body:"" });
    }
    unexpected.push({ path:url.pathname,method:request.method() }); return route.abort();
  });
  const page = await context.newPage(); page.on("pageerror",error => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator("#status")).toContainText(mode === "config-error" ? "configuration is unavailable" : "Ready.");
  return { page,context,calls,unexpected,errors,mode,viewport };
}

async function signIn(f) {
  await f.page.locator("#email").fill(fixture.email);
  await f.page.locator("#password").fill(fixture.password);
  await f.page.getByRole("button",{ name:"Sign in",exact:true }).click();
}
async function assertPreserved(f) {
  assert.deepEqual(await f.page.evaluate(() => ({ existing:localStorage.getItem("qa-existing-records"),draft:sessionStorage.getItem("qa-existing-draft"),writes:window.qaStorageWrites })),{ existing,draft:"keep-existing-draft",writes:[] });
  assert.deepEqual(await f.context.cookies(),[]);
  assert.deepEqual(f.unexpected,[]);
  assert.deepEqual(f.errors,[]);
  assert.doesNotMatch(await f.page.locator("#status").textContent(),/PRIVATE_.*DIAGNOSTIC/);
}
async function assertLayout(page) {
  const metrics = await page.evaluate(() => {
    const visible = element => element.getClientRects().length > 0;
    return { width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      controls:[...document.querySelectorAll("input,button")].filter(visible).map(element => ({ id:element.id,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,right:element.getBoundingClientRect().right,left:element.getBoundingClientRect().left })),
      bodySize:parseFloat(getComputedStyle(document.body).fontSize),labels:[...document.querySelectorAll("input")].filter(visible).every(element => Boolean(document.querySelector(`label[for="${element.id}"]`))) };
  });
  assert.ok(metrics.scrollWidth <= metrics.width + 1,"No horizontal page overflow");
  assert.ok(metrics.bodySize >= 16);
  assert.equal(metrics.labels,true);
  for (const control of metrics.controls) { assert.ok(control.height >= 44,`${control.id}: touch height`); assert.ok(control.width >= 44,`${control.id}: touch width`); assert.ok(control.left >= -1 && control.right <= metrics.width + 1,`${control.id}: viewport containment`); }
  return { horizontalOverflow:false,minimumTouchHeight:44,bodyFontPixels:metrics.bodySize,visibleControls:metrics.controls.length };
}

(async () => {
  fs.mkdirSync(output,{ recursive:true });
  const browser = await chromium.launch({ headless:true,args:["--disable-background-networking"] });
  try {
    for (const viewport of [{ width:1280,height:900 },{ width:390,height:844 },{ width:320,height:700 }]) {
      const f = await createFixture(browser,"happy",viewport);
      try {
        const loginLayout = await assertLayout(f.page);
        await f.page.screenshot({ path:path.join(output,`login-${viewport.width}.png`),fullPage:true });
        await signIn(f);
        await expect(f.page.locator("#setup")).toBeVisible();
        await expect(f.page.locator("#password")).toHaveValue("");
        await expect(f.page.locator("#token")).toHaveAttribute("type","password");
        await expect(f.page.locator("#token")).toHaveValue(fixture.token);
        await f.page.locator("#copyEndpoint").click(); await expect(f.page.locator("#status")).toContainText("Endpoint copied");
        await f.page.locator("#copyToken").click(); await expect(f.page.locator("#status")).toContainText("Verification token copied");
        assert.deepEqual(await f.page.evaluate(() => window.qaClipboard),[fixture.endpoint,fixture.token]);
        const setupLayout = await assertLayout(f.page);
        await f.page.screenshot({ path:path.join(output,`setup-${viewport.width}.png`),fullPage:true });
        await f.page.locator("#appId").fill(fixture.appId); await f.page.locator("#certId").fill(fixture.certId);
        await f.page.locator("#saveKeys").click(); await expect(f.page.locator("#status")).toContainText("Saved to encrypted server storage");
        await expect(f.page.locator("#appId")).toHaveValue(""); await expect(f.page.locator("#certId")).toHaveValue("");
        await f.page.locator("#refreshStatus").click(); await expect(f.page.locator("#delivery")).toContainText("Received: 2. Processed: 1. Pending: 0. Needs review: 1. Failed: 0.");
        await expect(f.page.locator("#delivery")).toContainText("receipt is not proof of completed erasure");
        await f.page.locator("#signOut").click(); await expect(f.page.locator("#status")).toContainText("Signed out.");
        await expect(f.page.locator("#setup")).toBeHidden();
        for (const id of ["password","token","appId","certId"]) await expect(f.page.locator(`#${id}`)).toHaveValue("");
        await expect(f.page.locator("#delivery")).toHaveText("");
        assert.equal(f.calls.at(-1).path,"/auth/v1/logout");
        await assertPreserved(f);
        results.push({ mode:"happy",viewport,loginLayout,setupLayout,login:true,clipboardMockOnly:true,credentialFieldsCleared:true,deliveryReviewStateHonest:true,signOut:true,noBrowserPersistence:true,existingRecordsAndPricesPreserved:true,providerCalls:f.calls.map(x => x.path) });
      } finally { await f.context.close(); }
    }
    for (const mode of ["bad-password","wrong-owner","info-error","network-error"]) {
      const f = await createFixture(browser,mode);
      try {
        await signIn(f);
        await expect(f.page.locator("#status")).toContainText(mode === "bad-password" ? "Sign-in failed" : mode === "wrong-owner" ? "restricted to the publisher" : mode === "info-error" ? "service is unavailable" : "Failed to fetch");
        await expect(f.page.locator("#setup")).toBeHidden(); await expect(f.page.locator("#password")).toHaveValue(""); await expect(f.page.locator("#token")).toHaveValue("");
        await expect(f.page.locator("#signIn")).toBeEnabled(); await assertPreserved(f);
        results.push({ mode,deniedOrFailedSafely:true,passwordAndTokenCleared:true,noBrowserPersistence:true });
      } finally { await f.context.close(); }
    }
    for (const mode of ["save-error","status-error","clipboard-denied"]) {
      const f = await createFixture(browser,mode,{ width:390,height:844 });
      try {
        await signIn(f); await expect(f.page.locator("#setup")).toBeVisible();
        if (mode === "save-error") { await f.page.locator("#appId").fill(fixture.appId); await f.page.locator("#certId").fill(fixture.certId); await f.page.locator("#saveKeys").click(); await expect(f.page.locator("#status")).toContainText("service is unavailable"); await expect(f.page.locator("#saveKeys")).toBeEnabled(); await expect(f.page.locator("#configured")).toContainText("not been configured yet"); }
        if (mode === "status-error") { await f.page.locator("#refreshStatus").click(); await expect(f.page.locator("#status")).toContainText("service is unavailable"); await expect(f.page.locator("#delivery")).toHaveText(""); }
        if (mode === "clipboard-denied") { await f.page.locator("#copyToken").click(); await expect(f.page.locator("#status")).toContainText("Clipboard unavailable"); assert.deepEqual(await f.page.evaluate(() => window.qaClipboard),[]); }
        await assertLayout(f.page); await assertPreserved(f);
        await f.page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide")));
        await expect(f.page.locator("#setup")).toBeHidden(); for (const id of ["password","token","appId","certId"]) await expect(f.page.locator(`#${id}`)).toHaveValue("");
        results.push({ mode,safeError:true,noFalseSuccess:true,pageHideClearsSecrets:true,noBrowserPersistence:true });
      } finally { await f.context.close(); }
    }
    const unavailable = await createFixture(browser,"config-error");
    try { await expect(unavailable.page.locator("#setup")).toBeHidden(); await assertPreserved(unavailable); results.push({ mode:"config-error",safeError:true }); } finally { await unavailable.context.close(); }
    fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({ syntheticOnly:true,liveProviderCalls:0,systemClipboardWrites:0,cases:results.length,results },null,2));
    console.log(`PASS eBay publisher setup browser: ${results.length} isolated cases; 3 viewport widths; no live provider calls, system clipboard writes or browser storage writes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
