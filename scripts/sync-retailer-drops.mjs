import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RETAILER_DROP_CALENDAR_EVENT_TYPES,
  RETAILER_DROP_CONFIDENCE_LABELS,
  RETAILER_DROP_SOURCE_LABELS,
  buildRetailerSourceProfiles,
  normalizeRetailerDrop,
  retailerDropToCalendarEvent,
  summarizeRetailerSources,
} from "../src/utils/retailerDropSources.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const generatedDir = path.join(rootDir, "src", "data", "generated");
const SYNC_TIMESTAMP = "2026-05-20T00:00:00.000Z";

async function writeJson(fileName, value) {
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(path.join(generatedDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function publicSummary(summary) {
  return {
    totalRetailers: summary.total,
    connected: summary.connected || 0,
    missingCredentials: summary["missing-key"] || 0,
    manualOnly: summary["manual-only"] || 0,
    unavailable: summary.unavailable || 0,
    errors: summary.error || 0,
    connectedRetailers: summary.connectedRetailers,
    manualOnlyRetailers: summary.manualOnlyRetailers,
    missingCredentialRetailers: summary.missingCredentialRetailers,
    optionalEnvKeys: Array.from(summary.optionalEnvKeys).sort(),
  };
}

function buildStatus({ profiles, generatedDrops = [], mode = "sources" }) {
  const summary = summarizeRetailerSources(profiles);
  const exposedSummary = publicSummary(summary);
  return {
    source: "All-retailer Drop Radar source framework",
    updatedAt: SYNC_TIMESTAMP,
    mode,
    ...exposedSummary,
    generatedDrops: generatedDrops.length,
    sourceTypes: ["official-api", "configured-api", "manual-watch", "admin-confirmed", "community-report", "unavailable"],
    sourceStatuses: ["connected", "missing-key", "manual-only", "unavailable", "error"],
    sourceLabels: RETAILER_DROP_SOURCE_LABELS,
    dropConfidenceLabels: RETAILER_DROP_CONFIDENCE_LABELS,
    calendarEventTypes: RETAILER_DROP_CALENDAR_EVENT_TYPES,
    syncCommands: {
      dropSources: "npm.cmd run sync:drop-sources",
      retailerDrops: "npm.cmd run sync:retailer-drops",
    },
    syncPolicy: "Only connected and allowed API sources may be synced. Manual-only retailers are skipped gracefully. No retailer page scraping, checkout automation, or bot-protection bypassing is performed.",
    credentialPolicy: "This status lists optional environment variable names only; it never writes or prints secret values.",
  };
}

export async function syncDropSources({ env = process.env, mode = "sources" } = {}) {
  const profiles = buildRetailerSourceProfiles({ env, checkedAt: SYNC_TIMESTAMP });
  const status = buildStatus({ profiles, mode });
  await writeJson("retailerDropSources.json", profiles);
  await writeJson("retailerDropStatus.json", status);
  return { profiles, status };
}

export async function syncRetailerDrops({ env = process.env } = {}) {
  const { profiles } = await syncDropSources({ env, mode: "drops" });
  const connectedProfiles = profiles.filter((profile) => profile.connected && (profile.sourceType === "official-api" || profile.sourceType === "configured-api"));
  const generatedDrops = [];

  for (const profile of connectedProfiles) {
    // No retailer adapter is enabled in this repo yet. This keeps the sync safe:
    // connected profiles are recognized, but no retailer web pages are scraped.
    void profile;
  }

  const normalizedDrops = generatedDrops.map((drop) => normalizeRetailerDrop(drop, { profiles, checkedAt: SYNC_TIMESTAMP }));
  const calendarEvents = normalizedDrops.map((drop, index) => retailerDropToCalendarEvent(drop, { index })).filter((event) => event.dateKey);
  const status = buildStatus({ profiles, generatedDrops: normalizedDrops, mode: "drops" });
  await writeJson("retailerDropEvents.json", normalizedDrops);
  await writeJson("retailerDropCalendarEvents.json", calendarEvents);
  await writeJson("retailerDropStatus.json", {
    ...status,
    skippedManualOnly: profiles.filter((profile) => profile.status === "manual-only").length,
    skippedMissingCredentials: profiles.filter((profile) => profile.status === "missing-key").length,
    skippedUnavailable: profiles.filter((profile) => profile.status === "unavailable").length,
  });
  return { profiles, drops: normalizedDrops, calendarEvents, status };
}

async function main() {
  const mode = process.argv[2] || "all";
  const result = mode === "sources" ? await syncDropSources({ mode }) : await syncRetailerDrops();
  console.log(JSON.stringify({
    ok: true,
    mode,
    totalRetailers: result.status.totalRetailers,
    connected: result.status.connected,
    missingCredentials: result.status.missingCredentials,
    manualOnly: result.status.manualOnly,
    generatedDrops: result.drops?.length || 0,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
