const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5225/");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const output = "artifacts/qa/next-ten/independent-boundaries";
const rounds = [];
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch();
  try {
    for (let round = 0; round < 20; round++) {
      const context = await browser.newContext();
      await context.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort(); if (url.pathname === "/__qa/account-ops-lock") return route.fulfill({ contentType: "text/html", body: "<html><body>Synthetic coordination test</body></html>" }); return route.continue(); });
      await context.addInitScript(() => {
        window.__trace = []; const read = Storage.prototype.getItem; const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, raw) { if (key === "code3.account-ops.v1") { const value = JSON.parse(raw); window.__trace.push({ at: Date.now(), event: "write", groups: value.profileGroups.map((row) => row.displayName), activities: value.activity.length }); } return write.call(this, key, raw); };
        const request = navigator.locks.request.bind(navigator.locks);
        navigator.locks.request = (name, options, action) => request(name, options, async (lock) => { window.__trace.push({ at: Date.now(), event: "acquired", name, browserStorage: localStorage === window.localStorage, before: read.call(localStorage, "code3.account-ops.v1") }); try { return await action(lock); } finally { window.__trace.push({ at: Date.now(), event: "released", name }); } });
      });
      const one = await context.newPage(); const two = await context.newPage();
      await Promise.all([one.goto(new URL("/__qa/account-ops-lock", base).href), two.goto(new URL("/__qa/account-ops-lock", base).href)]);
      const create = (page, label) => page.evaluate(async (label) => { const { createAccountOpsService } = await import("/src/features/accountOps/service.js"); const service = createAccountOpsService(); return Promise.all(Array.from({ length: 8 }, (_, index) => service.createProfileGroup({ displayName: `${label} ${index}` }).then((result) => result.record.id))); }, label);
      const completed = await Promise.all([create(one, `round${round}-A`), create(two, `round${round}-B`)]);
      const read = (page) => page.evaluate(() => { const raw = localStorage.getItem("code3.account-ops.v1"); const data = JSON.parse(raw); return { raw, names: data.profileGroups.map((row) => row.displayName), ids: data.profileGroups.map((row) => row.id), activities: data.activity.length, trace: window.__trace }; });
      const immediate = await Promise.all([read(one), read(two)]);
      const third = await context.newPage(); await third.goto(new URL("/__qa/account-ops-lock", base).href); const fresh = await read(third);
      const later = await Promise.all([read(one), read(two)]);
      const returnedIds = completed.flat();
      const passed = [fresh, ...later].every((snapshot) => snapshot.names.length === 20 && snapshot.activities === 16 && returnedIds.every((id) => snapshot.ids.includes(id))) && later.every((snapshot) => snapshot.raw === fresh.raw);
      rounds.push({ round, passed, immediate: immediate.map((snapshot) => ({ groups: snapshot.names.length, activities: snapshot.activities })), final: { groups: fresh.names.length, activities: fresh.activities }, returnedIds, ...(passed ? {} : { immediateTrace: immediate, fresh, later }) });
      fs.writeFileSync(`${output}/two-tab-stress.json`, JSON.stringify({ origin: base.origin, completed: rounds.length, passed: rounds.filter((entry) => entry.passed).length, rounds }, null, 2));
      console.log(`${passed ? "PASS" : "FAIL"} round ${round + 1}: fresh ${fresh.names.length} groups/${fresh.activities} activity`);
      await context.close();
    }
    assert.ok(rounds.every((round) => round.passed), "Concurrent writes were not preserved in every round; see trace.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
