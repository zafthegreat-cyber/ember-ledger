import { countSourceRecords, createVerifiedBackup, getBackupSource, previewBackupRestore, sealBackupEnvelope } from "../../src/features/backup/index.js";

export async function backupReviewFixtures() {
  const storage = { getItem: () => null, key: () => null, length: 0, setItem: () => { throw Error("Fixture must never write"); }, removeItem: () => { throw Error("Fixture must never remove"); } };
  const original = await createVerifiedBackup({ localStorage: storage, sessionStorage: storage, createdAt: "2026-09-24T00:00:00.000Z" });
  if (!original.verified) throw Error("Fixture baseline must verify");
  const backup = JSON.parse(original.json);
  const section = backup.sections.find(row => row.sourceId === "legacy-core-business");
  section.data = {
    items: [{ id: "synthetic-duplicate-item", name: "Synthetic One", purchasePrice: 12, currency: "USD" }, { id: "synthetic-duplicate-item", name: "Synthetic Two", purchasePrice: 8, currency: "USD" }],
    sales: [{ id: "synthetic-sale-missing-link", inventoryItemId: "synthetic-missing-item", grossSalePrice: "not-money", currency: "USD" }],
  };
  section.recordCount = countSourceRecords(section.data, getBackupSource(section.sourceId));
  const invalid = await sealBackupEnvelope(backup);
  const invalidJson = JSON.stringify(invalid);
  const preview = await previewBackupRestore(invalidJson);
  const malformedDisplay = JSON.parse(original.json);
  malformedDisplay.manifest.includedSources[0].displayName = { untrusted: "Not a renderable label" };
  malformedDisplay.manifest.excludedSources[0].reason = { untrusted: "Not a renderable reason" };
  return { validJson: original.json, invalidJson, malformedDisplayJson: JSON.stringify(await sealBackupEnvelope(malformedDisplay)), unsupportedJson: JSON.stringify({ format: "code-3-backup", formatVersion: { unexpected: true } }), preview };
}
