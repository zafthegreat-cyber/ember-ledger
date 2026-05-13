# Ember & Tide Beta Post-Deploy QA Checklist / Results

Date created: 2026-05-13

This document is for validating the deployed beta after a production push. It is documentation only and does not imply any database push, migration repair, backfill, provider change, commit, push, or deploy.

## Deployment Record

| Item | Value |
| --- | --- |
| Deployment URL | TBD |
| Vercel deployment status | TBD |
| Commit tested | TBD |
| Tester | TBD |
| Test device/browser | TBD |
| Supabase project ref | `gxsfququorfczvhrkudl` |
| RLS migration status | Applied manually via `psql` |
| Verifier baseline | `npm.cmd run verify:phase2:supabase` passed `250/250` before commit |

## Test Legend

| Status | Meaning |
| --- | --- |
| Pass | Works as expected |
| Fail | Broken or blocking |
| Partial | Usable with limitation |
| Blocked | Could not test |
| N/A | Not applicable for this beta |

## Critical Go / No-Go Checks

| Area | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| App loads | Deployed app opens without a blank screen or fatal console error | TBD |  |
| Sign-in | Existing user can sign in | TBD |  |
| RLS/workspace access | Owner/admin/editor can edit; viewer cannot edit | TBD |  |
| No private data leak | Private Vault/Forge data does not appear in public/community views | TBD |  |
| Vault add/edit | User can add and edit a Vault item | TBD |  |
| The Hearth/Forge add/edit | User can add and edit inventory/expense data | TBD |  |
| Tide Watch Quick Report | User can submit a report | TBD |  |
| Regular user report delete | Regular user does not see report delete action | TBD |  |
| Ember Exchange search | Catalog/search returns products and does not show cards in Sealed mode | TBD |  |
| Receipts/import | Existing receipt/import paths still open and preserve review-before-save behavior | TBD |  |

## Environment / Safety Checks

| Check | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Production Supabase URL | App points to production ref `gxsfququorfczvhrkudl` | TBD |  |
| No service-role key in frontend | Browser bundle does not expose service-role secrets | TBD |  |
| No db push from deploy | Vercel deploy does not run Supabase migrations | TBD |  |
| RLS verifier | `verify:phase2:supabase` remains green after deploy if run locally | TBD |  |
| Local fallback labels | Local-only states are clearly labeled when cloud save fails | TBD |  |

## Mobile / PWA Visual QA

Test at minimum:
- iPhone-sized viewport
- Android-sized viewport
- Desktop browser

| Screen | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Home / Today's Tide | Dashboard loads, cards fit, no duplicate actions | TBD |  |
| Bottom navigation | Watch, Vault, Market, Hearth, Pool are readable and tappable | TBD |  |
| Add sheet | Opens as compact sheet, closes with X/Cancel/back/outside tap | TBD |  |
| Quick Report | Fits under mobile viewport with internal scroll | TBD |  |
| Catalog grid | Images fit, names/market values are not clipped | TBD |  |
| Card/product detail | Detail panel scrolls and buttons are clickable | TBD |  |
| Modals | No modal traps user; Escape/back/outside tap behave correctly | TBD |  |

## Tide Watch QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Open Tide Watch | Store/report content loads | TBD |  |
| Quick Report from header | Opens Quick Report V2 | TBD |  |
| Quick Report from store card | Store preselects when launched from store context | TBD |  |
| Manual/unknown store | Can submit as needs store review or equivalent note | TBD |  |
| Report proof type | Manual, receipt, screenshot, stock photo options render | TBD |  |
| Submit report | Shows success message and report appears in list | TBD |  |
| Report edit/details | Existing edit/details path works if available | TBD |  |
| Regular user delete | Delete is hidden for regular users | TBD |  |
| Admin controls | Admin-only controls remain admin-only | TBD |  |

## Tide Vault QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Open Tide Vault | Collection view loads | TBD |  |
| Add item | Add/review flow saves item to Vault | TBD |  |
| Edit item | Edit persists and reloads | TBD |  |
| Wishlist item | Wishlist item stays out of Forge inventory | TBD |  |
| Private/team/shared label | Visibility label is understandable | TBD |  |
| Empty state | New/empty user gets clear next action | TBD |  |

## The Hearth / Forge QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Open The Hearth | Business dashboard loads | TBD |  |
| Add inventory | Saves to Forge inventory | TBD |  |
| Add expense | Saves expense and respects workspace permissions | TBD |  |
| Add sale | Sale flow opens/saves if available | TBD |  |
| Receipt review | Receipt remains review-first, no silent auto-save | TBD |  |
| Mileage | Mileage flow opens/saves if available | TBD |  |
| Permission message | Viewer/no-access user sees clear permission error | TBD |  |

## Ember Exchange / Catalog QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Search `asc` | Returns relevant Ascended Heroes results | TBD |  |
| Search `etb` in Sealed | Returns sealed ETB/products, not individual cards | TBD |  |
| Search `code card` in Cards | Code cards appear in Cards mode, not Sealed | TBD |  |
| Cards/Sealed toggle | Cards do not leak into Sealed; sealed products remain | TBD |  |
| Product tile | Normal grid shows image, name, market only | TBD |  |
| Missing image | Placeholder is clean and same size as image area | TBD |  |
| Detail panel | Scrolls, buttons clickable, no sealed/card field mixup | TBD |  |
| Suggest missing product | Opens clear suggestion path if coverage is low | TBD |  |

## Receipt / Import QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Receipt draft | Draft opens and line items can be reviewed | TBD |  |
| Destination selection | Vault, Forge, Wishlist, Expense only, Ignore are clear where supported | TBD |  |
| Failed save | Does not claim submitted if cloud save fails | TBD |  |
| Import/bulk review | No auto-save before review | TBD |  |
| Reload proof | Saved items remain in correct destination after reload | TBD |  |

## Admin / Moderation QA

| Flow | Expected Result | Status | Notes |
| --- | --- | --- | --- |
| Admin pages hidden | Normal users do not see admin-only pages/actions | TBD |  |
| Direct admin URL | Non-admin access is blocked or clearly denied | TBD |  |
| Catalog suggestions | Users can submit; admins can review/moderate | TBD |  |
| Store suggestions | Users can submit; admins can review/moderate | TBD |  |
| Scout moderation | Admin moderation actions work through intended RPCs | TBD |  |
| Audit/reputation | Missing durable pieces are documented, not faked | TBD |  |

## Known Beta Limitations

| Limitation | Impact | Follow-up |
| --- | --- | --- |
| Full signed-in multi-role QA still needs real test users | Automated smoke cannot prove every RLS role path | Run role-test script against a prepared test DB |
| Durable Scout moderation/audit depth is still evolving | Some admin workflows may be UI-only or partial | Continue backend/admin hardening plan |
| Large frontend bundle warning remains | Build passes, but bundle is above warning threshold | Plan code-splitting later |
| Catalog coverage may be incomplete | Some sealed products or images may be missing | Use Suggest Missing Product/admin repair workflow |

## Final Result

| Decision | Value |
| --- | --- |
| Safe to keep deployed | TBD |
| Rollback needed | TBD |
| Blockers | TBD |
| Follow-up tasks | TBD |
