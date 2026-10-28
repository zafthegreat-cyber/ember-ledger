# Code 3 TCG retailer alerts

The `code3-retailer-alerts` Supabase Edge Function sends online availability
transitions from Best Buy's official Products API to `#restock-alerts` in Code 3
TCG. Its five-minute Supabase Cron job runs independently of a maintainer's PC.
It does not scrape retailer sites, buy products, or use private Scout reports.
Best Buy is the only retailer adapter in this release. Local store inventory,
other retailers, preorder alerts, and a self-service role picker are not enabled.

## Deployment and activation

- Supabase project: `gxsfququorfczvhrkudl` (Code 3 TCG).
- Function: `supabase/functions/code3-retailer-alerts/index.ts`.
- Migration: `20261025000043_code3_discord_retailer_alerts.sql`.
- Encrypted Edge Function secrets: `CODE3_DISCORD_BOT_TOKEN`, `BESTBUY_API_KEY`.
- Obtain the retailer key at <https://developer.bestbuy.com/>. Never commit an
  env file, paste a token into chat, or put a key in a frontend variable.
- The cron caller's separate secret is generated inside the database and stored
  in Vault. Cron commands contain no credential. Requests must pass this secret
  check even though the endpoint does not use Supabase JWT authentication.
- The server owner must allow the bot to mention roles specifically in
  `#restock-alerts`. Interest roles remain non-mentionable and have no privileges.

The migration installs the job **paused**. Deployment alone does not mean alerts
are operational. After both encrypted secrets and the channel permission exist,
invoke a real poll with:

```sql
select code3_alerts.invoke_monitor('poll');
```

Inspect only that request's HTTP status and sanitized response in
`net._http_response`. Check `code3_alerts.monitor` for counts and timestamps.
The first observation of each product is a silent baseline. A test uses the same
hosted sender but a clearly synthetic embed and cannot claim real availability:

```sql
select code3_alerts.invoke_monitor('test');
```

The test ID is fixed to prevent accidental repeat pings. A pending/uncertain test
requires receipt inspection, not deletion of its delivery record and retrying.
Verify the message's exact four `mention_roles`, bot author, channel, and
`mention_everyone=false` with Discord's API. Device push delivery depends on
members' Discord settings and needs confirmation from the recipient.

Only after a complete live retailer poll and verified role notification:

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname='code3-bestbuy-discord'),
  active:=true
);
```

Verify a subsequent scheduled execution in `cron.job_run_details` and its
associated `net._http_response`, rather than assuming activation proves polling.
To pause, use the same command with `active:=false`. Removing the Discord bot
also stops its server access.

## Notification and storage rules

Only an explicit boolean online-availability value for an identified card
product is accepted. Incomplete responses, unknown status, unrelated games and
accessories cannot trigger an alert. Each SKU first establishes a quiet baseline;
only a later false-to-true transition creates an event. Missing search results
never imply that a product went out of stock.

The database leases each run, atomically claims delivery events, and records
receipts. A repeated available snapshot cannot repeat the same event. Uncertain
network or readback outcomes are held, and the rest of that run's notifications
stop. Discord's nonce adds short-term protection. Each run sends at most ten
messages, and queued events expire after ten minutes. Review uncertain events
privately; do not automatically reset them for retry.

Retailer text never supplies mention IDs. The sender allowlists the corresponding
Pokemon, One Piece, Magic, or Lorcana optional role. Everyone, user, and reply
mentions are suppressed. Staff assign/remove optional roles at members' request;
the live setup test assigned only the server owner's explicitly selected roles.

Private monitor state contains SKU, game, availability, transition number,
timestamps and delivery IDs/status. It stores no retailer response bodies or
Discord conversations. Product and completed delivery state is cleaned after
30 days; receipts needed to remove old messages remain until cleanup succeeds.
On successful runs, the bot removes its monitored alert messages after 24 hours.
Outages or removed permissions can delay cleanup. Screenshots, forwarded copies,
and provider records follow their own retention. Existing manually reviewed
alerts and setup messages are separate from this monitor's cleanup.

## Validation

```powershell
node --test scripts/test-discord-retailer-alerts.mjs
```

The production migration was validated in a rolled-back transaction: baseline
suppression, false-to-true transition, exclusive run lease, atomic claim,
duplicate suppression and denial of RPC/schema access to `anon` and
`authenticated`. Unauthorized and incorrect-secret HTTP requests both return 401.
Live retailer polling and role notification must be verified separately before
enabling the job.

Official references:
- <https://bestbuyapis.github.io/api-documentation/>
- <https://supabase.com/docs/guides/functions/schedule-functions>
- <https://docs.discord.com/developers/resources/message#allowed-mentions-object>
