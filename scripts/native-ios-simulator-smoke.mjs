import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Export the small parsers so they can be checked on Windows without starting
// a simulator or invoking any build, signing, account or deployment operation.
export function selectIPhoneSimulator(snapshot) {
  const choices = Object.entries(snapshot?.devices || {})
    .filter(([runtime]) => runtime.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-"))
    .flatMap(([runtime, devices]) => Array.isArray(devices) ? devices.map(device => ({ ...device, runtime })) : [])
    .filter(device => device.isAvailable === true && /^iPhone(?:\s|$)/.test(device.name || "")
      && /^com\.apple\.CoreSimulator\.SimDeviceType\.iPhone/.test(device.deviceTypeIdentifier || ""))
    .sort((a, b) => b.runtime.localeCompare(a.runtime, "en", { numeric: true }) || a.name.localeCompare(b.name, "en", { numeric: true }));
  if (!choices.length) throw new Error("No available iPhone simulator/runtime was found on this runner.");
  return { name: choices[0].name, runtime: choices[0].runtime, deviceTypeIdentifier: choices[0].deviceTypeIdentifier };
}

export function parseLaunchedPid(output, appId) {
  const escaped = appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^${escaped}: ([1-9][0-9]*)\\s*$`, "m"));
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error("Simulator launch did not return a valid app process ID.");
  return Number(match[1]);
}

export async function main() {
  if (process.platform !== "darwin") throw new Error("The iPhone simulator smoke check requires macOS with Xcode. No device action was attempted.");
  const build = JSON.parse(readFileSync(resolve("artifacts/native/web-build.json"), "utf8"));
  if (build.mode !== "configuration-smoke-only" || build.accountServicesConfigured !== false) {
    throw new Error("Run npm run native:build:smoke and npx cap sync ios first. This check must not use a configured account build.");
  }
  const config = JSON.parse(readFileSync(resolve("ios/App/App/capacitor.config.json"), "utf8"));
  const appId = "app.code3tcg.mobile";
  if (config.appId !== appId || config.server?.url) throw new Error("Unexpected native app ID or remote web content. No simulator was started.");
  const output = resolve("artifacts/native/ios-smoke");
  mkdirSync(output, { recursive: true });
  const log = resolve(output, "commands.log");
  writeFileSync(log, "Code 3 TCG iPhone simulator smoke check; no sign-in or store upload.\n");
  const report = {
    startedAt: new Date().toISOString(), appId, mode: "configuration-smoke-only", status: "running",
    compiled: false, launched: false, launchSurvivalSeconds: 0,
    accountServicesConfigured: false, signInTested: false, accountDataTested: false,
    physicalDeviceTested: false, storeSigned: false, uploaded: false,
  };
  const saveReport = () => writeFileSync(resolve(output, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  saveReport();

  function run(command, args, { timeoutMs = 60_000, quiet = false } = {}) {
    const label = `${command} ${args.join(" ")}`;
    appendFileSync(log, `\n> ${label}\n`);
    console.log(`Running: ${label}`);
    return new Promise((accept, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
      let stdout = ""; let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
      const onData = (chunk, stream, capture = false) => {
        const text = chunk.toString(); appendFileSync(log, text);
        if (capture) stdout += text;
        if (!quiet) stream.write(text);
      };
      child.stdout.on("data", chunk => onData(chunk, process.stdout, true));
      child.stderr.on("data", chunk => onData(chunk, process.stderr));
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", code => {
        clearTimeout(timer);
        if (timedOut || code !== 0) reject(new Error(`${command} ${args[0] || ""} ${timedOut ? "timed out" : `exited ${code}`}. Review commands.log.`));
        else accept(stdout);
      });
    });
  }

  let simulatorId;
  try {
    report.xcode = (await run("xcodebuild", ["-version"], { quiet: true })).trim();
    const selected = selectIPhoneSimulator(JSON.parse(await run("xcrun", ["simctl", "list", "devices", "available", "--json"], { quiet: true })));
    report.selected = selected;
    // Create a separate empty simulator. Never reuse, erase or sign in to an
    // existing developer's simulator, even if this script is run on a local Mac.
    simulatorId = (await run("xcrun", ["simctl", "create", `Code3Smoke-${Date.now()}`, selected.deviceTypeIdentifier, selected.runtime], { quiet: true })).trim();
    if (!/^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/.test(simulatorId)) {
      simulatorId = null;
      throw new Error("Simulator creation did not return a valid device ID.");
    }
    report.simulatorId = simulatorId;
    await run("xcrun", ["simctl", "bootstatus", simulatorId, "-b"], { timeoutMs: 240_000 });
    const derived = resolve("artifacts/native/ios-simulator");
    await run("xcodebuild", ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Debug",
      "-destination", `platform=iOS Simulator,id=${simulatorId}`, "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO", "build"], { timeoutMs: 1_200_000 });
    report.compiled = true;
    const appPath = resolve(derived, "Build/Products/Debug-iphonesimulator/App.app");
    if (!existsSync(resolve(appPath, "App"))) throw new Error("The compiled simulator app executable was not found.");
    await run("xcrun", ["simctl", "install", simulatorId, appPath], { timeoutMs: 90_000 });
    report.processId = parseLaunchedPid(await run("xcrun", ["simctl", "launch", "--terminate-running-process", simulatorId, appId]), appId);
    report.launched = true;
    await delay(5_000);
    // simctl returns the simulator app's host PID. A successful launch request
    // alone can miss an immediate native crash; require the same process alive.
    process.kill(report.processId, 0);
    const command = (await run("ps", ["-p", String(report.processId), "-o", "comm="], { quiet: true })).trim();
    if (basename(command) !== "App") throw new Error("The expected simulator app process is no longer running.");
    report.launchSurvivalSeconds = 5;
    await run("xcrun", ["simctl", "io", simulatorId, "screenshot", resolve(output, "launch.png")]);
    await run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, resolve(output, "App-simulator.zip")], { timeoutMs: 120_000 });
    report.status = "passed";
    console.log("Simulator compiled and survived launch. Inspect launch.png; this does not verify sign-in, app workflows, hardware or a TestFlight build.");
  } catch (error) {
    report.status = "failed"; report.error = error.message;
    if (simulatorId) await run("xcrun", ["simctl", "io", simulatorId, "screenshot", resolve(output, "failure.png")], { timeoutMs: 15_000, quiet: true }).catch(() => {});
    throw error;
  } finally {
    if (simulatorId) {
      await run("xcrun", ["simctl", "shutdown", simulatorId], { timeoutMs: 20_000, quiet: true }).catch(() => {});
      await run("xcrun", ["simctl", "delete", simulatorId], { timeoutMs: 20_000, quiet: true }).catch(() => {});
    }
    report.finishedAt = new Date().toISOString(); saveReport();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
