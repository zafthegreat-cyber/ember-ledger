#!/usr/bin/env node
// Chunk-size report for the Vite build (SHOULD 22, 2026-11-14).
// Usage: node scripts/report-chunk-sizes.mjs [dist] [--budget-kb 2048] [--json out.json] [--ignore a,b]
// --ignore takes comma-separated path fragments left out of the budget check
// (still listed in the report): vendored OCR copies and on-demand data chunks.
// Prints every JS/CSS asset with raw and gzip size, the largest chunk, and
// fails (exit 1) when the largest JS chunk exceeds the budget. The budget is
// generous on purpose: today's biggest chunk is about 1.9 MB raw; the point is
// to notice when it grows, not to block the beta.
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const args = process.argv.slice(2);
const dist = args.find((arg) => !arg.startsWith("--")) || "dist";
const budgetKb = Number(args[args.indexOf("--budget-kb") + 1] || 2048);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const ignored = args.includes("--ignore") ? String(args[args.indexOf("--ignore") + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(dist).map((file) => {
  const buffer = readFileSync(file);
  return { file: path.relative(dist, file).replaceAll("\\", "/"), bytes: buffer.length, gzip: gzipSync(buffer).length };
}).sort((a, b) => b.bytes - a.bytes);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const total = files.reduce((sum, f) => sum + f.bytes, 0);
const totalGzip = files.reduce((sum, f) => sum + f.gzip, 0);
const largestJs = files.find((f) => /\.m?js$/.test(f.file) && !ignored.some((frag) => f.file.includes(frag)));

console.log(`Build assets in ${dist}: ${files.length} files, ${kb(total)} raw / ${kb(totalGzip)} gzip`);
for (const f of files.slice(0, 25)) console.log(`${kb(f.bytes).padStart(11)}  ${kb(f.gzip).padStart(10)} gz  ${f.file}`);
if (files.length > 25) console.log(`… ${files.length - 25} smaller files`);
if (largestJs) console.log(`Largest JS chunk: ${largestJs.file} ${kb(largestJs.bytes)} (budget ${budgetKb} KB)`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), dist, totalBytes: total, totalGzip, budgetKb, files }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = files.slice(0, 15).map((f) => `| \`${f.file}\` | ${kb(f.bytes)} | ${kb(f.gzip)} |`).join("\n");
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Build size\n\n${files.length} assets, ${kb(total)} raw / ${kb(totalGzip)} gzip. Largest JS chunk: ${largestJs ? `\`${largestJs.file}\` ${kb(largestJs.bytes)}` : "n/a"} (budget ${budgetKb} KB).\n\n| Asset | Raw | Gzip |\n|---|---|---|\n${rows}\n`, { flag: "a" });
}
if (largestJs && largestJs.bytes > budgetKb * 1024) {
  console.error(`Largest JS chunk exceeds the ${budgetKb} KB budget.`);
  process.exit(1);
}
