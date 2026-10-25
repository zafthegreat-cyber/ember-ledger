import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const modulePath = process.env.CODE3_TEST_PGLITE_MODULE || fileURLToPath(new URL("../artifacts/qa/ebay-test-runtime/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url));
if (!existsSync(modulePath)) throw new Error("Install isolated test dependencies first: npm install --prefix artifacts/qa/ebay-test-runtime --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.10");
const result = spawnSync(process.execPath, ["--test", "backend/test/ebayDeletion.test.mjs"], {
  cwd: root, stdio: "inherit", windowsHide: true,
  env: { ...process.env, CODE3_TEST_PGLITE_MODULE: modulePath },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
