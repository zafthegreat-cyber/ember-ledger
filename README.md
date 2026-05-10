# E&T TCG

Local beta for Ember & Tide TCG.

## Beta Checklist

Run these from the project root:

```bash
npm run dev
npm run build
npm run backend:build
npm run smoke:beta
```

`npm run smoke:beta` runs the browser click-through test for the current beta flows.

## Local Run Commands

Frontend:

```bash
npm run dev
```

Backend API:

```bash
npm run backend:dev
```

Backend health check:

```text
http://localhost:4000/api/health
```

The backend is optional for the current beta. The app can run fully localStorage-first for tester flows when Supabase, Best Buy, live market APIs, OCR, Discord, and push notifications are not configured.

## Environment Variables

Frontend/Vercel:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ADMIN_EMAILS
VITE_DEV_ADMIN_EMAIL
VITE_LOCAL_DEV_ADMIN
```

`VITE_ADMIN_EMAILS` is a comma-separated beta allowlist. Matching users are treated as `admin` with `founder` tier in the frontend profile layer and should also be updated in Supabase with the SQL below. `VITE_DEV_ADMIN_EMAIL` and `VITE_LOCAL_DEV_ADMIN=true` only apply on localhost.

Backend/API placeholders:

```text
DATABASE_URL
BESTBUY_API_KEY
BESTBUY_API_BASE_URL
BESTBUY_MONITOR_ENABLED
BESTBUY_MONITOR_QUERY
BESTBUY_MONITOR_ZIP
BESTBUY_MONITOR_SKUS
BESTBUY_ALERT_ONLY_ON_CHANGE
BESTBUY_DISCORD_WEBHOOK_URL
BESTBUY_MONITOR_SECRET
```

The Vercel beta now includes a serverless `/api/*` bridge to the existing Express backend via `api/[...path].ts`.
That means the static Vite frontend can call same-origin `/api/bestbuy/*` endpoints after deploy, as long as the
server-only environment variables are configured in Vercel. Keep `BESTBUY_API_KEY`, `DATABASE_URL`, and Discord
webhook values server-only; never prefix them with `VITE_`.

Best Buy monitor storage is the Postgres/Supabase version of the starter kit SQLite model:

```text
retailer_products
retailer_observations
retailer_alert_log
retailer_monitor_targets
```

Apply `supabase/migrations/20260510035208_bestbuy_restock_monitoring.sql` before turning on scheduled monitoring.
The monitor route is `/api/bestbuy/monitor/run`; it no-ops until `BESTBUY_MONITOR_ENABLED=true` is set.
Use Vercel Cron, GitHub Actions, or another scheduler to call that route after the live API path and account limits are confirmed.

Server-only Pokemon ingestion imports:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DEFAULT_USER_ID
POKEMON_TCG_API_KEY
```

Do not put service-role keys or private API keys in frontend code.

## Pokemon Market Ingestion

The Pokemon market-data ingestion kit is integrated under `pokemon_market_ingestion_kit/`.

Docs:

```text
docs/pokemon-market-ingestion.md
```

Commands:

```bash
GROUP_LIMIT=2 npm run import:tcgcsv
npm run import:pokemon-tcg-api
GROUP_LIMIT=0 npm run import:tcgcsv
npm run import:va-stores
```

Run `supabase/migrations/20260508203900_pokemon_market_ingestion_schema.sql` before running the imports.

## Admin / Founder Setup

Run the profiles migration in Supabase:

```sql
supabase/migrations/010_profiles_roles_tiers.sql
```

Then assign your own account after sign-in:

```sql
update public.profiles
set user_role = 'admin',
    tier = 'founder',
    updated_at = now()
where email = 'YOUR_EMAIL_HERE';
```

Everyone else defaults to `user` and `free`. The current beta still works without Supabase; local mode shows a fallback profile unless a localhost dev override is enabled.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
