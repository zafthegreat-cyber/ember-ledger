const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5252").origin;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
async function assertReadableContrast(page) {
  const failures = await page.locator('.code3-privacy h2,.code3-privacy h3,.code3-privacy p,.code3-privacy label,.code3-privacy li').evaluateAll(nodes => {
    const rgb = value => (value.match(/[0-9.]+/g) || []).map(Number);
    const luminance = values => values.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i],0);
    return nodes.filter(node => node.getClientRects().length).flatMap(node => {
      let ancestor=node, background;
      while(ancestor) { const candidate=rgb(getComputedStyle(ancestor).backgroundColor); if(candidate.length===3 || candidate[3]===1) { background=candidate; break; } ancestor=ancestor.parentElement; }
      if(!background) return [{text:node.textContent.slice(0,60),reason:'No opaque background'}];
      const foreground=luminance(rgb(getComputedStyle(node).color)), back=luminance(background);
      const contrast=(Math.max(foreground,back)+.05)/(Math.min(foreground,back)+.05);
      return contrast < 4.5 ? [{text:node.textContent.slice(0,60),contrast}] : [];
    });
  });
  assert.deepEqual(failures, [], 'Body and heading text must contrast with its actual rendered background');
}
const output = path.resolve("artifacts/qa/mobile-beta/privacy-deletion");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "fixture.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account deletion synthetic QA</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import '/src/index.css';import '/src/styles/theme.css';
import AccountDeletionPage from '/src/features/privacy/AccountDeletionPage.jsx';import PublicPrivacyRoute from '/src/features/privacy/PublicPrivacyRoute.jsx';
const params=new URLSearchParams(location.search);window.__calls=0;window.__success=0;
let mockUser=params.get('completion')?{id:'11111111-1111-4111-8111-111111111111'}:null;
window.__switchPublicUser=id=>{mockUser=id?{id}:null;window.__publicAccountId=id;window.__authCallback(id?'SIGNED_IN':'SIGNED_OUT',mockUser?{user:mockUser}:null)};
const mockClient={auth:{onAuthStateChange:callback=>{window.__authCallback=callback;return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session:mockUser?{user:mockUser}:null}}),signInWithPassword:async input=>{window.__signedInEmail=input.email;window.__switchPublicUser('11111111-1111-4111-8111-111111111111');return {data:{session:{user:mockUser}}}},signOut:async()=>{window.__switchPublicUser(null);if(params.get('holdSignOut'))await new Promise(resolve=>window.__finishPublicSignOut=resolve);return {error:null}},resetPasswordForEmail:async(email)=>{window.__resetEmail=email;return {data:{}}}}};
const status={available:true,state:params.get('pending')?'pending':'ready',accountEmail:'synthetic@example.invalid',blockers:params.get('blocked')?[{code:'account_protected_owner',message:'Transfer protected service ownership first.'}]:[],deletionScope:['Synthetic personal collection and files'],retainedScope:['Other accounts and current prices']};
function SwitchingAccount(){const [user,setUser]=React.useState({id:'11111111-1111-4111-8111-111111111111'});window.__switchDeletionAccount=()=>setUser({id:'22222222-2222-4222-8222-222222222222'});return React.createElement(AccountDeletionPage,{user,statusLoader:async({expectedUserId})=>{if(params.get('switch')==='review'&&expectedUserId.startsWith('1111'))await new Promise(resolve=>window.__finishOldReview=resolve);return{...status,accountEmail:expectedUserId.startsWith('2222')?'new-account@example.invalid':'synthetic@example.invalid'}},deleteAccount:async()=>{await new Promise(resolve=>window.__finishOldDelete=resolve);return{state:'deleted',localCleanupRequired:true}},onDeleted:()=>window.__success++})}
if(params.get('switch'))createRoot(document.getElementById('root')).render(React.createElement(SwitchingAccount));else if(params.get('auth'))createRoot(document.getElementById('root')).render(React.createElement(PublicPrivacyRoute,{route:'delete',client:mockClient}));else createRoot(document.getElementById('root')).render(React.createElement('main',{className:'app code3-public-privacy','data-theme':params.get('theme')||'light'},React.createElement(AccountDeletionPage,{user:{id:'11111111-1111-4111-8111-111111111111'},statusLoader:async()=>status,deleteAccount:async(input)=>{window.__calls++;if(input.password==='wrong')throw Object.assign(new Error('Password confirmation failed. Check your account password and try again.'),{code:'account_reauthentication_failed'});await new Promise(resolve=>window.__finish=resolve);return {state:'deleted',localCleanupRequired:true}},onDeleted:async()=>{window.__success++},onNavigate:tab=>{window.__navigation=tab}})));
</script></body></html>`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
      const errors = []; const external = [];
      await context.route("**/*", route => { if (new URL(route.request().url()).origin !== base) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?theme=${theme}`);
        await page.getByRole("button", { name: "Review account deletion" }).click();
        await expect(page.getByText("synthetic@example.invalid", { exact: true })).toBeVisible();
        const submit = page.getByRole("button", { name: "Permanently delete my account" });
        await expect(submit).toBeDisabled();
        await page.getByLabel("Confirm your account password", { exact: true }).fill("synthetic-password");
        await page.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
        await expect(submit).toBeDisabled();
        await page.getByRole("checkbox").check(); await expect(submit).toBeEnabled();
        await assertReadableContrast(page);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-review.png`), fullPage: true });
        const badTargets = await page.locator("button:visible,input:not([type=checkbox]):visible,.code3-privacy-actions a:visible").evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width })).filter(item => item.height < 44 || item.width < 44));
        assert.deepEqual(badTargets, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await page.evaluate(() => window.__calls), 0);
        await page.getByRole("button", { name: "Review account deletion" }).click();
        await expect(page.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
        await expect(page.getByRole("checkbox")).not.toBeChecked();
        await page.getByRole("checkbox").check();
        await page.getByLabel("Confirm your account password", { exact: true }).fill("wrong");
        await page.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
        await submit.click(); await expect(page.getByRole("alert")).toContainText("Password confirmation failed");
        await expect(page.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
        await page.getByLabel("Confirm your account password", { exact: true }).fill("synthetic-password");
        await submit.focus(); await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "Deleting account…" })).toBeDisabled();
        await page.keyboard.press("Enter");
        assert.equal(await page.evaluate(() => window.__calls), 2, "Wrong-password request and one confirmed request only");
        await page.evaluate(() => window.__finish());
        await expect(page.getByRole("heading", { name: "Account deleted", exact: true })).toBeVisible();
        await expect(page.getByRole("status")).toContainText("have not been erased");
        assert.equal(await page.evaluate(() => window.__success), 1);
        assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-completed.png`), fullPage: true });
        results.push({ width, theme, review: true, explicitConfirmation: true, cancel: true, reauthenticationFailure: true, duplicateSubmitGuard: true, deviceCopiesExplained: true, overflow: false, storageWrites: 0 });
      } catch (error) { await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`), fullPage: true }); throw error; }
      finally { await context.close(); }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?blocked=1`);
    await page.getByRole("button", { name: "Review account deletion" }).click();
    await expect(page.getByRole("heading", { name: "Resolve before deleting" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Permanently delete my account" })).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.__calls), 0);
    await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?pending=1`);
    await page.getByRole("button", { name: "Review account deletion" }).click();
    await expect(page.getByRole("alert")).toContainText("Some cloud files may already be removed");
    await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?auth=1`);
    await page.getByLabel("Account email", {exact:true}).fill("synthetic@example.invalid");
    await page.getByRole("button", {name:"Send password reset email"}).click();
    await expect(page.getByRole("status")).toContainText("check your inbox");
    assert.equal(await page.evaluate(()=>window.__resetEmail), "synthetic@example.invalid");
    await page.getByLabel("Account password", {exact:true}).fill("synthetic-password");
    await page.getByRole("button", {name:"Sign in",exact:true}).click();
    await expect(page.getByRole("button", {name:"Review account deletion"})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__signedInEmail), "synthetic@example.invalid");
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    await context.close();

    // Exercise the real public-route completion state, rather than only the
    // deletion form: a previous account's success must never label a new one.
    for (const holdSignOut of [false, true]) {
      const completionContext = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
      const external = []; const errors = [];
      await completionContext.addInitScript(() => {
        localStorage.setItem("unrelated-user-records", "preserve-existing-records");
        localStorage.setItem("latest-price-sentinel", "42.75");
        window.__publicDeleteCalls = 0;
      });
      await completionContext.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) { external.push(url.origin); return route.abort(); }
        if (url.pathname === "/src/services/accountDeletionApi.js") return route.fulfill({ contentType: "application/javascript", body: `
          export const ACCOUNT_DELETION_CONFIRMATION='DELETE MY ACCOUNT';
          export async function fetchAccountDeletionStatus(){return {available:true,state:'ready',accountEmail:window.__publicAccountId?.startsWith('2222')?'second@example.invalid':'first@example.invalid',blockers:[],deletionScope:['Synthetic account only'],retainedScope:['Other accounts and current prices']}}
          export async function deleteOwnAccount(){window.__publicDeleteCalls++;return {state:'deleted',localCleanupRequired:true}}
        ` });
        return route.continue();
      });
      const completionPage = await completionContext.newPage(); completionPage.on("pageerror", error => errors.push(error.message));
      try {
        await completionPage.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?auth=1&completion=1${holdSignOut ? "&holdSignOut=1" : ""}`);
        await completionPage.getByRole("button", { name: "Review account deletion" }).click();
        await completionPage.getByRole("checkbox").check();
        await completionPage.getByLabel("Confirm your account password", { exact: true }).fill("synthetic-password");
        await completionPage.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
        await completionPage.getByRole("button", { name: "Permanently delete my account" }).click();
        await expect(completionPage.getByRole("heading", { name: "Account deleted", exact: true })).toBeVisible();
        await completionPage.evaluate(() => window.__switchPublicUser("22222222-2222-4222-8222-222222222222"));
        if (holdSignOut) await completionPage.evaluate(() => window.__finishPublicSignOut());
        await expect(completionPage.getByRole("heading", { name: "Account deleted", exact: true })).toHaveCount(0);
        await completionPage.getByRole("button", { name: "Review account deletion" }).click();
        await expect(completionPage.getByText("second@example.invalid", { exact: true })).toBeVisible();
        await expect(completionPage.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
        await expect(completionPage.getByRole("checkbox")).not.toBeChecked();
        await completionPage.evaluate(() => window.__switchPublicUser(null));
        await expect(completionPage.getByRole("heading", { name: "Delete your account", exact: true })).toBeVisible();
        await expect(completionPage.getByRole("heading", { name: "Account deleted", exact: true })).toHaveCount(0);
        assert.equal(await completionPage.evaluate(() => window.__publicDeleteCalls), 1);
        assert.equal(await completionPage.evaluate(() => localStorage.getItem("unrelated-user-records")), "preserve-existing-records");
        assert.equal(await completionPage.evaluate(() => localStorage.getItem("latest-price-sentinel")), "42.75");
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        results.push({ publicCompletionAccountIsolation: true, delayedOldSignOut: holdSignOut, newAccountNotMarkedDeleted: true, credentialsCleared: true, originalsAndPricesPreserved: true, liveDeletes: 0 });
      } finally { await completionContext.close(); }
    }

    for (const stage of ["review", "delete"]) {
      const switchContext = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
      await switchContext.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const switchPage = await switchContext.newPage();
      await switchPage.goto(`${base}/artifacts/qa/mobile-beta/privacy-deletion/fixture.html?switch=${stage}`);
      await switchPage.getByRole("button", { name: "Review account deletion" }).click();
      if (stage === "delete") {
        await switchPage.getByRole("checkbox").check();
        await switchPage.getByLabel("Confirm your account password", { exact: true }).fill("old-account-password");
        await switchPage.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
        await switchPage.getByRole("button", { name: "Permanently delete my account" }).click();
      }
      await switchPage.evaluate(() => window.__switchDeletionAccount());
      await expect(switchPage.getByRole("button", { name: "Review account deletion" })).toBeEnabled();
      await switchPage.getByRole("button", { name: "Review account deletion" }).click();
      await expect(switchPage.getByText("new-account@example.invalid", { exact: true })).toBeVisible();
      await expect(switchPage.getByLabel("Confirm your account password", { exact: true })).toHaveValue("");
      await expect(switchPage.getByRole("checkbox")).not.toBeChecked();
      await switchPage.evaluate(stage => stage === "review" ? window.__finishOldReview() : window.__finishOldDelete(), stage);
      await expect(switchPage.getByText("new-account@example.invalid", { exact: true })).toBeVisible();
      assert.equal(await switchPage.evaluate(() => window.__success), 0);
      results.push({ accountSwitchDuring: stage, staleResultIgnored: true, newAccountNotBusy: true, credentialsCleared: true });
      await switchContext.close();
    }
    // Real public routes must bypass recovery gates without mounting App or any
    // cloud workspace record readers/writers. Keep synthetic recovery markers.
    for (const [route, heading] of [["/privacy", "Privacy policy"], ["/support", "How can we help?"], ["/delete-account", "Delete your account"]]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
      const requests = []; const errors = [];
      await context.addInitScript(() => { localStorage.setItem("code3.workspace-owner-switch.v1", "synthetic-pending-save"); localStorage.setItem("unrelated-user-records", "keep-me"); });
      await context.route("**/*", route => { const url = new URL(route.request().url()); requests.push(url.pathname); return url.origin === base ? route.continue() : route.abort(); });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}${route}?themeInspect=${theme}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => localStorage.getItem("code3.workspace-owner-switch.v1")), "synthetic-pending-save");
      assert.equal(await page.evaluate(() => localStorage.getItem("unrelated-user-records")), "keep-me");
      assert.equal(requests.some(item => item === "/src/App.jsx"), false, "Normal App never mounts for direct public privacy routes");
      assert.equal(requests.some(item => /\/rest\/v1\//.test(item)), false, "No cloud data requests");
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await assertReadableContrast(page);
      await page.screenshot({ path: path.join(output, `${route.slice(1)}-public-${theme}.png`), fullPage: true });
      results.push({ route, theme, readableContrast: true, pendingRecoveryBypassedWithoutWriters: true, existingRecordsUnchanged: true });
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
    console.log("PASS account deletion browser: six width/theme combinations, confirmation/cancel/error/duplicate guards, blockers/pending, three public routes outside recovery writers; no live deletion.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
