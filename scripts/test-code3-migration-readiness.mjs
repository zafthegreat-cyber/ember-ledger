import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("src/features/backup/MigrationReadinessPanel.jsx");
const backupPanel = read("src/features/backup/BackupRecoveryPanel.jsx");
const ownerCenter = read("src/features/ownerCenter/OwnerCenterPage.jsx");
const ownerApi = read("src/services/code3OwnerApi.js");

assert.match(panel, /Run migration preview/);
assert.match(panel, /No records will be written during this preview\./);
assert.match(panel, /runLocalMigrationPreview/);
assert.match(panel, /Local records/);
assert.match(panel, /Remote records/);
assert.match(panel, /Money conversion issues/);
assert.match(panel, /Proposed money conversions/);
assert.match(panel, /Reference problems/);
assert.match(panel, /Preview hash/);
assert.match(panel, /Delete is never proposed/);
assert.doesNotMatch(panel, /Migrate now/i);
assert.doesNotMatch(panel, /REMOTE_ACTIVE/);
assert.match(backupPanel, /<MigrationReadinessPanel remoteAdapter=\{remoteAdapter\} \/>/);
assert.match(backupPanel, /createRemoteBackupExportAdapter/);
assert.match(backupPanel, /remoteExportResult/);
assert.match(ownerCenter, /section === "data-backup" \? <BackupRecoveryPanel/);
assert.match(ownerApi, /getOwnerRequestHeaders/);
assert.match(ownerApi, /\/api\/code3\//);
assert.doesNotMatch(ownerApi, /console\.|localStorage|ownerSubject/);

console.log("Code 3 Migration Readiness UI contract tests passed.");
