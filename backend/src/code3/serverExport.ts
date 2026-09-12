import { createHash } from "node:crypto";
import { CANONICAL_DOMAINS, type CanonicalDomain, type CanonicalRecord, type OwnerContext } from "./types";
import type { CanonicalRepository } from "./repository";

export const SERVER_EXPORT_FORMAT = "code-3-server-export";
export const SERVER_EXPORT_FORMAT_VERSION = 1;
export const MAX_EXPORT_RECORDS_PER_DOMAIN = 1_000;

export type CanonicalServerExport = Readonly<{
  format: typeof SERVER_EXPORT_FORMAT;
  formatVersion: typeof SERVER_EXPORT_FORMAT_VERSION;
  createdAt: string;
  coverageStatus: "COMPLETE" | "PARTIAL";
  coverageExplanation: string;
  recordCount: number;
  sourceHash: string;
  truncatedDomains: CanonicalDomain[];
  domains: Readonly<Record<CanonicalDomain, CanonicalRecord[]>>;
}>;

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`).join(",")}}`;
}

export async function exportCanonicalOwnerRecords(
  repository: CanonicalRepository,
  owner: OwnerContext,
  options: { maxRecordsPerDomain?: number; now?: () => Date } = {},
): Promise<CanonicalServerExport> {
  return repository.withConsistentRead(async (snapshotRepository) => {
    const requestedMaximum = options.maxRecordsPerDomain ?? MAX_EXPORT_RECORDS_PER_DOMAIN;
    const maximum = Math.max(1, Math.min(MAX_EXPORT_RECORDS_PER_DOMAIN, Math.floor(requestedMaximum)));
    const domains = Object.create(null) as Record<CanonicalDomain, CanonicalRecord[]>;
    const truncatedDomains: CanonicalDomain[] = [];
    let total = 0;
    let anyTruncated = false;

    for (const domain of CANONICAL_DOMAINS) {
      const records: CanonicalRecord[] = [];
      let cursor: string | undefined;
      let truncated = false;
      do {
        const remaining = maximum - records.length;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const page = await snapshotRepository.list(owner, domain, {
          limit: Math.min(100, remaining),
          ...(cursor ? { cursor } : {}),
          includeArchived: true,
        });
        records.push(...page.records);
        cursor = page.nextCursor || undefined;
        if (records.length >= maximum && cursor) truncated = true;
      } while (cursor && records.length < maximum);
      total += records.length;
      anyTruncated ||= truncated;
      if (truncated) truncatedDomains.push(domain);
      domains[domain] = records;
    }

    const sourceHash = createHash("sha256").update(canonicalStringify(domains), "utf8").digest("hex");

    return Object.freeze({
      format: SERVER_EXPORT_FORMAT,
      formatVersion: SERVER_EXPORT_FORMAT_VERSION,
      createdAt: (options.now || (() => new Date()))().toISOString(),
      coverageStatus: anyTruncated ? "PARTIAL" : "COMPLETE",
      coverageExplanation: anyTruncated
        ? "One or more canonical domains exceeded the bounded server-export limit. This export is not a complete server recovery point."
        : "All canonical records visible to the authenticated owner were included from one consistent read snapshot within the configured server-export bounds. This status covers canonical server records only, not browser data or file bytes.",
      recordCount: total,
      sourceHash,
      truncatedDomains,
      domains,
    });
  });
}
