# Bot tracking local completion — 2026-10-17

Branch: `codex/all-bot-integration-setup`. Baseline: published main `eb560fc97d36939f19ae68aafbb1e1c7806e8632`. This continues the uncommitted [bot setup candidate](./BOT_SETUP_LOCAL_REPORT.md). Changes remain local; no commit, push, merge, deployment, provider connection, or production-data operation occurred.

## User flow

Verified owner → Bot Overview → select an installation or add a manual plan → validated Bot Operations service → coordinated local transaction → refreshed task list and recorded history.

- Overview shows saved installations, open manual plans, tasks needing attention, evidence requiring review, and recent plans. Per-installation cards open a filtered task list or a new plan for that bot.
- Tasks is now a primary tab. Search covers product names and identifiers, installation/device names, groups and reference labels. Compact filters cover provider, installation, retailer, stage, attention, and archived records.
- Manual plans record installation, retailer, product/identifier, quantity, optional per-item price limit and product notes. Planning stages are Planning, Plan ready, On hold, Closed and Needs an update. These describe owner-entered plans, not live bot status.
- Plan edits expose quantity, price limit and stage. They retain shared product/group records, rather than silently editing records used elsewhere. History records actual changed values; unchanged edits make no write.
- Task details show readable group/account/profile/proxy labels, product notes, recorded history and checkout evidence. Synthetic test statuses remain visibly synthetic; duplicated event/history entries are hidden in the presentation only.
- Activity supports product/bot/order-reference search and installation filtering. Historical evidence uses its recorded product reference, including when a task is missing. Evidence requiring review is counted from `requiresOwnerReview`, including reconciled-but-unreviewed records.
- Overview and task lists identify missing, disabled, archived or inconsistent primary references. A disconnected provider or disabled live execution is not itself an attention item.

## Data and access

Uses the existing `code3.bot-ops.v1` schema and record collections. A new plan commits product target, disabled manual group, draft task and history in one transaction. Storage failures leave original bytes unchanged. Same-record edits use `recordVersion`; concurrent creates are serialized. Queued operations are cancelled when the owner session changes or the page unmounts. Other tabs refresh from storage events.

All eight named providers remain unconnected. There is no provider/retailer network access, remote task execution, checkout automation, credential input, purchase creation or inventory creation. Existing collection, Account Ops and price records are outside these mutations. Tests use disposable synthetic browser contexts, not the owner's signed-in app.

## Verification

- New domain tests: **565 assertions** covering atomic creation, later-stage rollback, write failure, optimistic concurrency, allowed fields/stages, reference checks, secret rejection, no-op updates and unrelated-record preservation.
- Tracking selectors: **37 assertions**, including exact filters/counts, duplicate product titles, archived records, reconciled review requirements, orphan evidence, missing/disabled/mismatched references and read-only projections.
- Existing Bot Operations and Stellar preview domain/security/UI suite: **4,141 assertions**, including 27 Bot fixtures and 62 Stellar fixtures.
- Backup: **22 sections / 34 records**. Workspace recovery: **23 checks**.
- Tracking browser: **320, 390 and 1440 pixels in light and dark themes**, plus actual-app mobile routing/Back. Covers create/edit/reload, exact filtering, per-bot drilldown, focus, touch targets, wrapping, errors and owner denial. Real two-tab tests cover atomic creates, stale edits and queued signout/identity cancellation. No external requests or attempted network writes were observed.
- Existing Bot browser regression: **27 fixtures, 39 captures, 998 assertions**. Stellar offline-preview browser regression: **9 scenarios, 186 assertions**, including opening the collapsed preview and discarding preview state after leaving/refreshing.
- Existing setup browser regression: **six viewport/theme combinations × all eight providers**, plus two actual-app mobile paths, all nine sections, damaged storage, concurrent saves/conflicts and queued session cancellation. All passed with the tracker integrated.
- Follow-up browser checks verify evidence with missing or changed task references uses its recorded product, and that an intercepted final storage commit leaves the original bytes intact.
- Production build and complete-source ESLint passed. Backend TypeScript build passed. Existing large App chunk warning remains; ESLint reports Babel's existing >500KB App.jsx formatting note.

The initial regressions caught old expectations for navigation order, empty overview metrics and the former expanded Stellar preview. Tests were updated for those deliberate changes while retaining authorization, no-provider-network and data-preservation assertions. Review also caught hidden synthetic statuses, duplicate timeline entries and incorrect historical product joins; these are corrected and verified.

## Evidence

- [Tracking browser matrix](../artifacts/qa/bot-tracking/results.json)
- [Historical evidence joins](../artifacts/qa/bot-tracking/results-evidence.json)
- [Existing installation setup regression](../artifacts/qa/bot-provider-setup/results.json)
- [Final-commit failure check](../artifacts/qa/bot-tracking/results-single.json)
- [Mobile dark tracker](../artifacts/qa/bot-tracking/320-dark-tracking.png)
- [Desktop dark overview](../artifacts/qa/bot-tracking/1440-dark-overview.png)
- [Mobile plan form](../artifacts/qa/bot-tracking/320-light-plan-form.png)
- [Existing Bot browser regression](../artifacts/qa/code3-phase2da-bot-operations/current/manifest.json)
- [Stellar preview browser regression](../artifacts/qa/code3-phase2db2-stellar-preview/current/manifest.json)
- [Build](../artifacts/qa/bot-tracking/build.log) and [lint](../artifacts/qa/bot-tracking/lint.log)

## Limits

Manual bot records are saved in this browser on this device. Native bot status sync, order imports and task control are still unavailable. No actual bot runtime, phone hardware or screen reader was verified. This is a tested local tracking improvement, not a claim that the integrations or whole app are complete.
