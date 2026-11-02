# Regional community campaign — November 2, 2026

This additive change invites collectors in Virginia, North Carolina, Maryland, and Washington, DC to contribute useful observations and reviewed store suggestions. It does not claim complete regional directory coverage or live inventory guarantees.

## Production baseline

- App: `https://code3tcg.app/`
- Vercel project: `code3-tcg` (`prj_opLikOxbXPA3pTJ2EajgR5qzo4fq`)
- Verified READY production deployment: `dpl_9u3FZasSUjvLx3qDEC9J29bTErda`
- Repository: `zafthegreat-cyber/ember-ledger`
- Base commit: `12108ba55eff7145ae6d97139e722346b4eb5ba5`
- Isolated branch: `codex/regional-campaign-20261102`

The original app workspace has unrelated uncommitted changes. This checkout was cloned from the verified deployed commit; no original working-tree changes were copied. The usual `terms-page` and `work` paths are junctions outside the writable workspace, so this checkout sits directly under the Code 3 TCG workspace.

## Resulting behavior

- Home displays the public campaign card after its existing restock hero. **Browse restocks** calls the existing `onOpenRestockReports` navigation.
- The full Restocks view displays the same card. **Report a restock** calls the existing `onQuickReport` flow, which retains the app's existing account and save checks. The compact embedded view is unchanged.
- **Join Discord** uses the existing safe external-link component and the owner-provided invite, without mentions or paid promotion.
- Copy explicitly says the directory currently focuses on Virginia and stock can change.
- This is shared deployed UI content, not a local-only admin announcement draft. It adds no notification/push delivery, subscriber fan-out, API writes, new authentication, credentials, or infrastructure.

The public missing-store form already accepts non-Virginia states, but its normalization helper always assigned `stateCode: VA` and inferred a Virginia region. The fix retains canonical VA/NC/MD/DC labels and codes, honors explicit non-Virginia regions, falls back to the selected non-Virginia state when no region is given, and preserves other explicit areas/codes. Virginia inference and empty-state defaults remain unchanged. Suggestions still go to admin review and remain inactive pending approval.

## Validation

- `node --no-warnings --test scripts/test-regional-store-normalization.mjs`: 8 checks passed, including the actual public missing-store handler and inactive-review behavior for NC, MD, and DC.
- `npm run test:regional-browsing`: passed.
- `npm run test:store-suggestions`: passed.
- `npm run test:store-expansion`: passed.
- Targeted ESLint on both page integrations, the banner, the helper, and its focused test: passed.
- `npm run build`: passed. Existing large-chunk and mixed static/dynamic Supabase import warnings remain.
- `git diff --check`: passed.

No real store suggestion or report was submitted during validation. Production publishing requires root review of this isolated patch and its preview. The existing full deploy-readiness script expects local database credentials and a broad app suite; those credentials were not copied into this checkout.
