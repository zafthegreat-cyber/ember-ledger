// Card reader evaluation (Nov 17 2026).
//   APP_URL=http://127.0.0.1:5280 node scripts/card-reader-eval.cjs --dir="C:\path\to\card-photos"
//   APP_URL=http://127.0.0.1:5280 node scripts/card-reader-eval.cjs --synthetic
//
// Runs the real card reader (src/utils/cardPhotoReader.mjs, in Chromium through
// the dev server) on each photo and checks what it read against the answer.
// Answers come from answers.csv in the folder (file,name,number) or from the
// file name: "charizard-ex-125-197.jpg" -> name "charizard ex", number "125/197";
// "monkey-d-luffy-OP01-024.jpg" -> number "OP01-024".
// --synthetic draws simple test cards (name strip, art box, number strip) on
// tables and at small angles, to check the pipeline before real photos exist.
// Photos stay on this computer; nothing is uploaded.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : "true"]; }));
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5280");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Card reader evaluation is loopback only");
const out = path.resolve(args.out || "artifacts/qa/card-reader");
fs.mkdirSync(out, { recursive: true });

function answerFromName(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  const code = base.match(/((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})$/i);
  if (code) return { name: base.slice(0, code.index).replace(/[-_]+/g, " ").trim(), number: code[1].toUpperCase() };
  const fraction = base.match(/[-_]((?:TG|GG|SV)?\d{1,3}[a-z]?)[-_]((?:TG|GG|SV)?\d{2,3})$/i);
  if (fraction) return { name: base.slice(0, fraction.index).replace(/[-_]+/g, " ").trim(), number: `${fraction[1]}/${fraction[2]}`.toUpperCase() };
  const promo = base.match(/[-_]((?:SWSH|SVP|SM|XY|BW)\d{2,3})$/i);
  if (promo) return { name: base.slice(0, promo.index).replace(/[-_]+/g, " ").trim(), number: promo[1].toUpperCase() };
  return { name: base.replace(/[-_]+/g, " ").trim(), number: "" };
}
function loadAnswers(dir) {
  const csv = path.join(dir, "answers.csv");
  const map = new Map();
  if (fs.existsSync(csv)) {
    for (const line of fs.readFileSync(csv, "utf8").split(/\r?\n/).slice(1)) {
      const [file, name = "", number = ""] = line.split(",").map((v) => v.trim());
      if (file) map.set(file.toLowerCase(), { name, number });
    }
  }
  return map;
}
const norm = (value = "") => String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9/ -]/g, " ").replace(/\s+/g, " ").trim();
const numberKey = (value = "") => String(value).toUpperCase().replace(/^0+(?=\d)/, "").replace(/\/0+(?=\d)/, "/");
function score(answer, read) {
  const numberOk = answer.number ? numberKey(read.number) === numberKey(answer.number) : null;
  const words = norm(answer.name).split(" ").filter((w) => w.length > 1);
  const got = norm(read.name);
  const nameOk = words.length ? words.every((w) => got.split(" ").some((g) => g === w || (w.length > 4 && g.startsWith(w.slice(0, -1))))) : null;
  return { numberOk, nameOk, searchable: Boolean(numberOk || nameOk) };
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  await page.goto(new URL("/?betaLocalMode=true", appUrl).href);
  await page.waitForTimeout(1500);
  const cases = [];
  if (args.dir) {
    const dir = path.resolve(args.dir);
    const answers = loadAnswers(dir);
    for (const file of fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()) {
      cases.push({ label: file, answer: answers.get(file.toLowerCase()) || answerFromName(file), bytes: fs.readFileSync(path.join(dir, file)).toString("base64"), type: /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg" });
    }
  } else {
    const synthetic = [
      { name: "Pikachu", number: "058/102", hp: "60", angle: 0, table: "#3a2a20", light: 1 },
      { name: "Charizard ex", number: "125/197", hp: "330", angle: 2, table: "#1e1e24", light: 0.85 },
      { name: "Mewtwo VSTAR", number: "079/078", hp: "280", angle: -3, table: "#6b5a44", light: 1 },
      { name: "Rare Candy", number: "191/198", hp: "", angle: 0, table: "#2c3a2c", light: 0.7 },
      { name: "Monkey.D.Luffy", number: "OP01-024", hp: "", angle: 1, table: "#222", light: 1 },
      { name: "Gengar", number: "TG06/TG30", hp: "130", angle: 0, table: "#40303a", light: 0.9 },
    ];
    for (const card of synthetic) {
      const dataUrl = await page.evaluate(async (c) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200; canvas.height = 1600;
        const g = canvas.getContext("2d");
        g.fillStyle = c.table; g.fillRect(0, 0, 1200, 1600);
        g.save(); g.translate(600, 800); g.rotate((c.angle * Math.PI) / 180);
        const w = 860, h = 1200; g.translate(-w / 2, -h / 2);
        g.fillStyle = "#f2d44a"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#f7f1e1"; g.fillRect(28, 28, w - 56, h - 56);
        g.fillStyle = "#111"; g.font = "bold 64px Arial"; g.fillText(c.name, 60, 112);
        if (c.hp) { g.font = "bold 46px Arial"; g.fillText(`HP ${c.hp}`, w - 230, 110); }
        g.fillStyle = "#7ba7c9"; g.fillRect(60, 150, w - 120, 520);
        g.fillStyle = "#222"; g.font = "34px Arial"; g.fillText("Thunderbolt", 80, 760); g.fillText("Discard all Energy from this card.", 80, 810);
        g.font = "30px Arial"; g.fillText(c.number, 70, h - 60); g.fillText("Illus. Test Artist", 420, h - 60);
        g.restore();
        if (c.light < 1) { g.fillStyle = `rgba(0,0,0,${1 - c.light})`; g.fillRect(0, 0, 1200, 1600); }
        return canvas.toDataURL("image/jpeg", 0.85);
      }, card);
      cases.push({ label: `synthetic ${card.name}`, answer: { name: card.name, number: card.number }, bytes: dataUrl.split(",")[1], type: "image/jpeg" });
    }
  }
  if (!cases.length) throw new Error("No photos found. Use --dir=<folder> with JPG, PNG or WebP files, or --synthetic.");
  const rows = [];
  for (const item of cases) {
    const started = Date.now();
    const read = await page.evaluate(async ({ bytes, type, label }) => {
      const binary = Uint8Array.from(atob(bytes), (ch) => ch.charCodeAt(0));
      const file = new File([binary], label, { type });
      const { readCardPhoto } = await import("/src/utils/cardPhotoReader.mjs");
      const value = await readCardPhoto(file);
      return { status: value.status, query: value.query, name: value.name || "", number: value.number || "", certainty: value.certainty || "", foundCard: value.foundCard, message: value.message };
    }, item);
    const ms = Date.now() - started;
    const verdict = score(item.answer, read);
    rows.push({ label: item.label, expected: item.answer, read, ms, ...verdict });
    process.stdout.write(`${verdict.numberOk && verdict.nameOk ? "OK  " : verdict.searchable ? "PART" : "MISS"} ${item.label.padEnd(40)} -> "${read.query}" (${(ms / 1000).toFixed(1)}s)\n`);
  }
  await browser.close();
  const n = rows.length;
  const pct = (count) => `${Math.round((count / n) * 100)}%`;
  const withNumber = rows.filter((r) => r.numberOk !== null);
  const summary = {
    cards: n,
    nameAndNumber: pct(rows.filter((r) => r.numberOk && r.nameOk).length),
    numberRight: withNumber.length ? `${Math.round((withNumber.filter((r) => r.numberOk).length / withNumber.length) * 100)}%` : "n/a",
    nameRight: pct(rows.filter((r) => r.nameOk).length),
    usableSearch: pct(rows.filter((r) => r.searchable).length),
    averageSeconds: Math.round((rows.reduce((s, r) => s + r.ms, 0) / n / 1000) * 10) / 10,
  };
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ summary, rows }, null, 1));
  const lines = ["# Card reader evaluation", "", `${n} ${args.dir ? "photos" : "synthetic cards"}.`, "", "| | |", "|---|---|",
    `| Name and number both right | ${summary.nameAndNumber} |`, `| Card number right | ${summary.numberRight} |`, `| Name right | ${summary.nameRight} |`,
    `| Gave a usable search (name or number right) | ${summary.usableSearch} |`, `| Average time per card | ${summary.averageSeconds} s |`, "",
    "| Photo | Expected | Read | Result |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.label} | ${r.expected.name} ${r.expected.number} | ${r.read.query || "(nothing)"} | ${r.numberOk && r.nameOk ? "both" : r.numberOk ? "number" : r.nameOk ? "name" : "miss"} |`)];
  fs.writeFileSync(path.join(out, "report.md"), lines.join("\n"));
  console.log(`\n${JSON.stringify(summary)}\nReport: ${path.join(out, "report.md")}`);
})().catch((error) => { console.error(error); process.exit(1); });
