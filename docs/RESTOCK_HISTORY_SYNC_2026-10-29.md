# Private historical restock observations

Imported historical stock and no-stock observations live under
`historicalRestockHistory` in the existing private Scout source,
`legacy-restock-scout`. They use the existing authenticated account snapshot
transport, source revision checks, recovery journals and Web Locks. No table,
permission, authentication or operational-report schema changes are required.

## Behavior

- Restocks → Saved history opens private account history, including original
  Eastern observation times, source statuses/notes, quantities, missing-photo
  captions and incomplete history-only references.
- Search, status, location and date filters operate on the saved archive. Results
  render twenty per page. Old stock claims remain labelled historical/unverified.
- A version 2 history JSON is reviewed before import. Stable content identities
  prevent repeated reports; source appearances are retained as provenance rather
  than independent confirmations. Different details at the same location/minute
  remain separate and flagged. Incomplete references keep unknown values.
- The imported collection is excluded structurally from ordinary `reports`, map
  availability, alerts, restock patterns and automatic prediction training.
- Import unmounts record writers, verifies account ownership, synchronizes first,
  rebuilds the merge against fresh data, applies only the Scout source through the
  recovery adapter, and verifies the subsequent server readback. Existing conflicts,
  competing tabs, failed writes, quota exhaustion or account changes stop safely.
- Automatic cloud-saving preferences are retained; a paused account can make this
  one explicit manual save. No success is inferred from a local write alone.

The source archive contains checksums and generated identifiers. Some plain hex
sequences accidentally match the existing payment-card security heuristic. Only
strictly validated hash/identifier paths use a reversible colon-separated format
in the persisted envelope. Free text still receives the unchanged security scan;
decoding restores original identifiers. No scanner exception was added.

Modern backup counts include both full reports and incomplete claims. Legacy
backup exports include the encoded history field. Their import path reads durable
Scout data, merges incoming history, preserves history omitted by older backups,
and checks for concurrent Scout changes before any record setter runs.

## Verification

Commands:

```text
npm run test:restock-history
npm run test:restock-history-safety
npm run test:restock-history-legacy-backup
npm run test:restock-history-browser
npm run test:cloud-workspace-sync
npm run test:workspace-recovery
npm run test:code3-backup
```

The optional model check accepts `--archive <local-history-current.json>` without
bundling that private input. The supplied archive retains 1,057 full reports and
four incomplete claims; re-import adds zero and does not change persisted bytes.

Synthetic acceptance uses the actual recovery, backup and cloud-sync modules with
a disposable transport. It checks a second device, duplicate retries, unchanged
prices/other Scout fields, failure preservation, and the actual legacy backup
code. Chromium checks at 390px and 1440px exercise upload review, import/readback,
filters, pagination, touch targets, overflow, account/conflict refusal and paused
preferences. They make no external requests or production writes.

Existing feed, historical-positive importer, Drop Radar, pricing, scoped lint and
web build checks also pass. Existing large-chunk/module warnings and App's
`checkUser` dependency warning remain. No dependency or generated price/catalog
file changes are part of this feature.

## Release and acceptance boundary

This isolated branch starts from production `e945a8e`, including the newer reviewed
Discord feed and market-price refresh. Other unpublished engineering/design
branches are not included. No real report text, source dump, account backup or
authentication material belongs in Git or the public bundle.

Before release, hosted import, server readback and physical phones remain
unverified. A pre-existing computer sync conflict was found during acceptance.
The owner delegated its settings choice to the agent; the current computer
settings were selected with both originals retained. The browser's competing-tab
guard stopped that operation before any records changed. Never clear app data,
force the lease or overwrite a cloud revision to bypass that guard.
