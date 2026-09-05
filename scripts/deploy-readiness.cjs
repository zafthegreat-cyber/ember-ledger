const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${options.label || args.join(" ")} failed with exit code ${result.status}`);
}

function runNpm(script, env = {}) {
  console.log(`\n=== ${script} ===`);
  run(process.execPath, [npmCli, "run", script], { env, label: script });
}

function readDotEnv(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^("|')|("|')$/g, "");
        return [key, value];
      })
  );
}

function validateLocalEnvironment() {
  const values = readDotEnv(".env.local");
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]
    .filter((name) => !values[name]);
  if (!values.DATABASE_URL && !values.SUPABASE_DB_URL) missing.push("DATABASE_URL or SUPABASE_DB_URL");
  if (missing.length) throw new Error(`Missing local deployment prerequisites: ${missing.join(", ")}`);
  if (String(values.VITE_BETA_LOCAL_MODE).toLowerCase() === "true") {
    throw new Error("VITE_BETA_LOCAL_MODE must be false before building a deployment candidate.");
  }
  if (String(values.VITE_QA_UNLOCK_PAID_FEATURES).toLowerCase() === "true") {
    throw new Error("VITE_QA_UNLOCK_PAID_FEATURES must not be enabled for a deployment candidate.");
  }
  console.log("Local deployment environment: configured; QA bypasses disabled.");
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForPreview(url, processRef, output, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (processRef.exitCode !== null) throw new Error(`Preview exited before becoming ready.\n${output.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Preview did not become ready within ${timeoutMs}ms.\n${output.join("")}`);
}

async function main() {
  validateLocalEnvironment();

  runNpm("test:route-loading");
  runNpm("test:menu-full-page-routes");
  runNpm("backend:build");
  runNpm("build");

  const port = await reservePort();
  const appUrl = `http://127.0.0.1:${port}/`;
  const previewOutput = [];
  console.log(`\n=== production preview ${appUrl} ===`);
  const preview = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  preview.stdout.on("data", (chunk) => previewOutput.push(chunk.toString()));
  preview.stderr.on("data", (chunk) => previewOutput.push(chunk.toString()));

  try {
    await waitForPreview(appUrl, preview, previewOutput);
    const appEnv = { APP_URL: appUrl };
    runNpm("test:viewport-guard", appEnv);
    runNpm("test:hearth", appEnv);
    runNpm("test:vault", appEnv);
    runNpm("test:scout", appEnv);
    runNpm("test:scout-layout", appEnv);
    runNpm("test:scout-map", appEnv);
    runNpm("test:market", appEnv);
    runNpm("test:forge", appEnv);
    runNpm("test:exchange-layout", appEnv);
    runNpm("test:spark", appEnv);
  } finally {
    preview.kill();
  }

  run("git", ["diff", "--check"], { label: "git diff --check" });
  console.log("\nDEPLOYMENT CANDIDATE PASSED");
  console.log("Next: confirm Vercel environment variables, then run `npm run deploy:preview`.");
}

main().catch((error) => {
  console.error(`\nDEPLOYMENT CANDIDATE FAILED\n${error.message}`);
  process.exit(1);
});
