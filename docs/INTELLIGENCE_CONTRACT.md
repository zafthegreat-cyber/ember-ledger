# Code 3 Intelligence Contract

Status: Phase 1C local-first implementation contract. This contract does not authorize a database migration, remote persistence cutover, provider expansion, automated purchasing, offers, bidding, or Production deployment.

Starting baseline: `cdd57bbabb2243ff510eca7aec0487f23342834d`.

## Purpose and boundary

Code 3 intelligence turns normalized owner and provider evidence into reviewable, explainable proposals for cards, deals, auction lots, and restock patterns. It is decision support. It is not an autonomous agent and it is not a source of facts that were never observed.

Phase 1C keeps `LOCAL_ONLY` authoritative. Card-analysis revision history uses the existing Deal Analysis/appraisals repository through the Phase 1B persistence gateway. Auction analysis can save its current result with the local auction workflow, but Phase 1C does not create a generic cross-domain revision series. Restock intelligence recomputes from retained observations. Phase 1C does not enable `REMOTE_ACTIVE`, execute the canonical schema, write a migration plan, move owner data, upload file bytes, or start a sync engine.

The pipeline is presentation-independent:

```text
validated input
  -> normalization
  -> identity evidence
  -> provenance-preserved observations
  -> condition proposal
  -> valuation evidence
  -> deal / auction / restock recommendation
  -> explicit owner review
  -> optional append-only card-analysis revision
```

Equivalent normalized inputs produce the same SHA-256 input hash. The pipeline returns the exact `normalizedInput` used for that hash, `analysisVersion: 1`, and a named methodology version. Analysis timestamps, record IDs, and display ordering do not change the substantive input hash, so a future method can be compared rather than silently replacing an earlier conclusion.

## Evidence provenance

Every material observation records one of these origins:

- `MACHINE_OBSERVED` — directly captured by an actual instrument/adapter, such as an existing barcode read; it is not synonymous with AI or visual inspection;
- `PROVIDER_SUPPLIED` — supplied by an authorized marketplace, feed, or catalog provider;
- `OWNER_ENTERED` — entered or confirmed by the owner;
- `INFERRED` — derived by a deterministic rule from other evidence.

An owner-entered fact is not relabeled as machine-observed. A provider condition label is evidence, not a Code 3 visual inspection. A barcode/catalog match is an identity candidate, not proof of the exact printing, condition, authenticity, or grade. Phase 1C has no computer-vision provider and MUST NOT fabricate machine-observed defects.

Duplicate records that repeat one underlying source do not count as independent evidence. Evidence keeps its source reference, observed time, freshness, and warnings where supplied.

## Shared confidence vocabulary

All new intelligence results use:

- `HIGH`
- `MEDIUM`
- `LOW`
- `INSUFFICIENT`

Confidence considers source quality, independent-source count, sample size, freshness, identity certainty, condition certainty, completeness, and contradictions. A high count of copied or dependent observations cannot create high confidence. Sparse, stale, one-sided, obscured, or contradictory evidence reduces confidence. `INSUFFICIENT` means Code 3 does not have enough support for the conclusion; it is not a synonym for zero or low value.

## Card identity and condition

A card/product analysis can retain:

- product/card identity, set, number, language, variant, and printing/edition;
- raw or slabbed state, grading company, and recorded grade when supplied;
- image/reference metadata and front/back availability;
- identity source, evidence provenance, warnings, confidence, analysis time, method version, and input hash;
- the immutable system proposal and separate owner corrections/confirmation.

The condition vocabulary is `NM`, `LP`, `MP`, `HP`, and `DMG`. A proposal is an apparent-condition assessment from the available normalized evidence. It is not a professional grading-company grade, authenticity guarantee, or promise about an unseen surface.

The defect taxonomy includes whitening, edge wear, corner wear, surface scratches, dents, creases, folds, tears, cuts, peeling, staining, ink/writing, water or liquid damage, warping, print defects, binder dents, pressure marks, holo scratching, centering observations, and an unknown/unverifiable defect.

Assessment considers defect type, severity, quantity, location, structural impact, front/back distribution, cumulative wear, and observation confidence. It does not use a one-defect/one-condition lookup. Major structural damage such as a severe crease, tear, cut, missing material, or severe liquid damage can force `DMG`. Centering is reported separately and never determines raw condition by itself.

When the evidence is too incomplete or poor, the system returns no unsupported condition proposal and explains what cannot be assessed. Front/back availability, glare, sleeve/toploader obstruction, focus, resolution, and contradictory observations affect confidence. Explanations identify the observations that caused the proposal and the important areas that remain unassessable.

The owner may confirm or correct a proposal. Code 3 stores both values. Reanalysis creates a new revision, retains the previous system result, carries owner confirmation only with explicit owner provenance, and never silently replaces that confirmation.

## Money and valuation

New intelligence calculations use safe integer minor units with an explicit supported currency. Runtime parsing rejects malformed amounts, unsupported excess precision, unsafe integers, non-finite values, and incompatible currencies. Cross-currency arithmetic is rejected unless a separately approved conversion source and rate contract exists.

Percentage fees use bounded integer basis points. When a percentage produces a fractional minor unit, the calculator applies and reports its deterministic rounding policy and remainder; rounding is not hidden.

Valuation evidence keeps these meanings separate:

- `SOLD_COMPARABLE`
- `ACTIVE_LISTING`
- `REFERENCE_PRICE`
- `OWNER_COST`
- `OWNER_SALE`
- `PREDICTED_RESALE`

An active asking price is never included in a completed-sale median. Reference/guide prices are not relabeled as sales. Owner cost and sale history remain actual owner records, not market samples. Predicted resale is an assumption.

Phase 1C valuation methodology `code3.valuation.v2` validates the subject and comparable condition vocabulary before choosing a completed-sale condition basis. It first uses verified sold comparables whose explicit condition matches the subject and does not adjust those prices again. When no matched-condition sale is available, it may adjust an explicitly `NM` completed-sale baseline once to the subject condition. A comparable with unknown condition, or a known condition incompatible with the selected basis, is excluded with a reason. Mixed or unresolved condition evidence therefore produces an honest warning or no condition-specific estimate rather than a double adjustment.

A valuation result may report a low/high range, robust center, sample size, source coverage, evidence age, shipping treatment, outlier treatment, condition-basis policy, confidence, and warnings. Outliers and condition-basis exclusions remain visible with their inclusion/exclusion reasons. Source quality uses the validated shared confidence vocabulary. Code 3 does not manufacture market data when no valid source exists. Completed-sale coverage remains unavailable until an approved, properly licensed source or owner-entered evidence is supplied.

## Deal intelligence

A Deal Intelligence result can explain identity, condition/value coverage, asking price, acquisition costs, selling costs, expected proceeds, gross and net profit, ROI, margin of safety, risks, and missing inputs.

The advisory states are:

- `STRONG_BUY`
- `BUY`
- `WATCH`
- `PASS`
- `INSUFFICIENT_DATA`

Each result includes supporting metrics, thresholds, risk findings, missing information, and a human-readable rationale. Risk findings have an explicit `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL` severity; risk presence is never inferred only from free-form wording. Owner-entered assumptions remain visible and attributable. A recommendation never buys, offers, bids, messages, or publishes a listing.

## Auction and lot intelligence

Auction analysis supports provider/source identity, current bid, premium, shipping, taxes when known, pickup/travel and processing costs, lot-value scenarios, selling costs, target price, explainable maximum recommended bid, owner-entered maximum, timing, contents, unknowns, confidence, and risk.

The maximum recommended bid is solved from explicit integer-minor-unit assumptions and is advisory only. Code 3 never submits a bid. Unknown tax, premium, pickup, or shipping rules remain visible rather than silently becoming zero facts.

Multi-item lot analysis separates identified, probable, and unknown contents. It reports conservative, expected, and optimistic scenarios and explains the spread. Expected values apply explicit sell-through/liquidity assumptions rather than blindly summing optimistic retail prices. Unidentified or unseen contents receive no individual value unless the owner supplies a separate bulk assumption, which is visibly haircut in the expected scenario. Bulk estimates, shipping burden, labor burden, duplicates, and condition uncertainty remain separate, visible inputs.

## Restock intelligence

Restock analysis uses confirmed events, product observations, visits, empty-shelf observations, report provenance, and outcomes. Store-directory presence is context and never restock evidence.

Outputs use coarse `HIGH`, `MEDIUM`, `LOW`, or `INSUFFICIENT` likelihood/confidence language, an expected window only when supported, sample size, freshness, supporting observations, contradictory evidence, last confirmed event, recommendation, and rationale. Freshness is based on the most recent positive restock observation; a newer empty-shelf or unsuccessful-visit report can contradict a pattern but cannot make an old positive pattern current. Repeated observations from one underlying source do not bypass the shared source-independence cap. Sparse or anecdotal data does not produce false decimal precision. Stale or contradictory records reduce confidence. No output promises a restock or calls a route optimal without real route data.

## Card-analysis history and owner review

Phase 1C card-analysis history is append-only at the revision level. Each retained card revision includes a stable analysis series, unique revision ID, prior-revision link, input/source hash, methodology version, timestamps, normalized input, immutable system result, warnings, and owner-review state. This revision contract does not claim a generic auction or restock history: an auction can retain its saved result without a linked revision series, while restock intelligence is derived again from the current retained observations.

Owner review can confirm/correct condition, provide manual values, dismiss named warning codes, record a bounded note, and request reanalysis. Correction events retain previous/new values, time, correction ID, and `OWNER_ENTERED` provenance. They do not rewrite the immutable system proposal. Adjacent revisions compare the system proposal/value while also exposing carried owner-resolved values, so new evidence remains visible without silently discarding an owner confirmation.

Uncertain identity, variant, condition, structural damage, money conflicts, insufficient comparable sales, duplicate identity, contradictory provider data, and incomplete lot contents can require owner review. Dismissing a warning records the decision; it does not make the underlying evidence disappear.

## Persistence, security, and recovery

The Phase 1C service explicitly creates a `LOCAL_ONLY` gateway over the existing appraisals collection. It does not accept an environment-selected mode or remote adapter. It exposes no destructive delete operation. Legacy appraisal rows remain readable and are not silently reinterpreted as Phase 1C records.

Analysis inputs recursively reject owner, role, session, token, authorization, credential, and secret authority fields. Local records contain no authoritative owner subject. The backend remains the authority for protected APIs, and the Phase 1B owner scope cannot be selected from a browser analysis payload.

Tagged card-analysis revisions are included through the existing Deal Finder backup section. Image/file references are metadata only; file bytes remain outside Phase 1C backup coverage and keep coverage honestly `PARTIAL` when referenced. An auction result saved by the current local workflow is not a generic linked revision series. Restock results are recomputed from the retained local observations rather than stored as Phase 1C analysis revisions. Mapping any of these records to future canonical domains requires a separate migration decision.

## Provider boundary

The official eBay adapter may normalize provider-supplied listing identity, active asking/current-bid values, shipping, listing condition label, format, seller fields already allowed by the connector, images, and timestamps. External identity, provider observations, image references, and active-listing valuation evidence remain separately attributable to the official eBay source. Exact minor-unit money is emitted only when both provider precision and currency are usable; a missing or invalid provider currency produces a warning and no money object rather than a fabricated default. The adapter does not convert active evidence to sold comparables, infer visual condition from an image URL, make a new network request, or bypass provider restrictions.

The current scanner adapter accepts normalized barcode, catalog/provider, owner-entered, inferred, and image-reference metadata. These retain distinct provenance. It explicitly reports OCR, computer vision, condition assessment, and grade prediction as false and marks each retained image reference as not analyzed. The boundary can accept a future approved adapter's output, but Phase 1C does not claim a vision model, scrape unsupported sources, or upload evidence files.

## Explicit non-automation

Phase 1C does not:

- apply the Phase 1B SQL schema or any Supabase/PostgreSQL migration;
- enable canonical hosted persistence, `REMOTE_ACTIVE`, sync, migration apply, rollback execution, or owner-data transfer;
- buy, offer, bid, message sellers, check out, publish listings, or perform marketplace account actions;
- bypass CAPTCHAs, authentication, access controls, quotas, private APIs, or provider restrictions;
- guarantee value, condition, grade, authenticity, restock timing, lot contents, profit, or ROI;
- silently replace owner-entered values or destroy prior card-analysis history;
- represent a placeholder, deterministic text rule, or catalog match as machine vision.

## Verification gate

The final focused local evidence is: 168 domain assertions; 27 card-history/provider cases; 61 integration assertions; and all 15 deterministic QA fixtures with 175 assertions. These cover condition rules, money, valuation evidence separation and condition basis, every recommendation state, auction costs and downside, human-readable auction assumptions, lot uncertainty, restock sparsity/freshness/source-independence/contradiction, deterministic hashes, append-only card history, owner corrections, security-field rejection, local-only persistence, honest eBay active-evidence labeling, and the required QA states.

Phase 1C also retains the Phase 1A/1B security, persistence, migration-preview, backup/restore, eBay, sourcing, Owner Center, accessibility, viewport, smoke, and regression gates. The final local bounded regression passed 28/28 scenarios in 323.446 seconds of suite time, with zero retries and no open handles after cleanup. Focused evidence and the broad regression serve different purposes; neither substitutes for the other.
