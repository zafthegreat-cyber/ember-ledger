# Vercel logging/retention metadata audit

Read-only check on October 18, 2026 using the existing authenticated Vercel CLI **64.5.0**. No hosting settings, plan, environment variables, deployment, drain, account data or log contents were changed or downloaded. Credential values, drain destinations/headers and billing contacts/payment details were excluded from output.

## Verified account/project facts

| Item | Observed result |
| --- | --- |
| Local linked project | `ember-tide-tcg`, ID `prj_opLikOxbXPA3pTJ2EajgR5qzo4fq`. `vercel project inspect --non-interactive` confirmed the existing link. |
| Live domain | `vercel inspect https://code3tcg.app` confirmed a Ready production deployment of that same project, `dpl_6xHp82bwL3ko8bGDozMpzkHdiEsf`. The repository name `ember-ledger` is not the Vercel project name. |
| Owning team | Code 3 TCG, slug `zafthegreat-cybers-projects`, ID `team_SrWvifkcXd622u47TnXCZUT0`. |
| Actual team plan | **Hobby**, reported by both `vercel teams ls --format json` and `GET /v2/teams/{teamId}`. No upgrade or trial was requested. |
| Current drain inventory | `GET /v1/drains` returned **0 drains** in this team. |
| Legacy configurable log drains | `GET /v1/log-drains` returned an empty array. |
| Legacy integration log drains | `GET /v2/integrations/log-drains` returned an empty array. |
| Project retention override | `GET /v9/projects/{projectId}` exposed no logging, runtime-retention, monitoring or observability configuration property. `webAnalytics` was the only related property name. No unexposed setting was inferred from this absence. |
| Team retention/observability override | `GET /v2/teams/{teamId}` exposed no logging, retention, monitoring, analytics or observability setting. No claim was made that this proves a specific override value or complete provider deletion schedule. |

All drain queries were scoped to the verified owning team. Empty inventories establish that no Vercel drain is currently configured there; they do not audit independent application log exporters, earlier exports, support cases or provider-internal records.

## Retention conclusion and limits

The **actual plan is verified**, and Vercel's current [Runtime Logs documentation](https://vercel.com/docs/logs/runtime) assigns **one hour of runtime-log availability to Hobby**. This is the documented limit for the observed plan, not a directly returned account-specific retention duration. The metadata APIs used here did not expose an effective-duration field; an additional dashboard/provider confirmation remains necessary before presenting a precise period as the app's complete privacy retention commitment.

Do not equate the runtime-log window with deletion of all hosting records. Vercel's [limits documentation](https://vercel.com/docs/limits) separately states that build logs are stored indefinitely per deployment. Its [Observability Plus documentation](https://vercel.com/docs/observability/observability-plus) distinguishes runtime logs from other observability data. None of those categories was fetched to inspect user or request content during this audit.

The privacy rollout should therefore record:

- Confirmed current configuration: Hobby team; no current or legacy Vercel drains.
- Documented plan behavior: one-hour runtime-log window, kept distinct from build/deployment records and other provider metadata.
- Still unverified: account-specific override/effective expiry, provider-internal security/support retention, and the complete deletion/backup schedule across hosting and database providers.

No frontend policy wording or native package was edited by this audit. If an operator later enables a drain or upgrades observability, review the destination's own retention and update the policy evidence before claiming the previous period still applies.

## Repeatable read-only commands

Run from the linked repository, first verifying the intended project. API payloads should be filtered in memory; do not dump the full project/team object, environment values, destination URLs, headers or log messages into a report.

```sh
npx --no-install vercel project inspect --non-interactive
npx --no-install vercel inspect https://code3tcg.app --scope zafthegreat-cybers-projects --non-interactive
npx --no-install vercel teams ls --format json --non-interactive
npx --no-install vercel api /v1/drains --scope zafthegreat-cybers-projects --raw
npx --no-install vercel api /v1/log-drains --scope zafthegreat-cybers-projects --raw
npx --no-install vercel api /v2/integrations/log-drains --scope zafthegreat-cybers-projects --raw
```

For repeat audits, retain only drain counts/types and project bindings. These endpoints return destination configuration when drains exist, so do not paste unfiltered results into a shared document. PowerShell callers should use `ConvertFrom-Json -NoEnumerate` when distinguishing an empty JSON array from null.
