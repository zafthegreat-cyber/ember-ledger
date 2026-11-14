# MUST list — the parts that need the PC (Nov 13, 2026)

Claude finished items 1, 4, 6, 9, 10 in code. These five need you.

## 2. Build + lint (10 min)
```
cd "C:\Users\dillo\OneDrive\Desktop\Zena\Code 3 TCG\terms-page"
npm install                      # picks up @sentry/react
npm run build                    # note the biggest chunk size in the output
npm run lint:src                 # or: npx eslint src
npm run test:beta-corrections && npm run test:must-week1 && npm run test:large-backup
```
If build or lint shows anything red, paste it to Claude.

## 3. Commit and push (5 min)
```
git fetch origin
git status                       # expect ~60 changed files from Oct 30 – Nov 13
git add -A
git commit -m "Beta corrections batches 1-3, findings F01-F20, declutter, open beta, crash reports, quick feedback"
git pull --rebase origin main    # resolve if main moved
git push
```

## 5. Phone smoke test (15 min)
Open code3tcg.app on your phone after Vercel deploys, dark mode on:
Home, Restocks, Vault, Market, Community, You, Account, Settings. Try the
tour (Settings → Take the tour), Sign out, the Feedback button (send one —
it should appear in Supabase `beta_feedback` and, once the webhook is set,
in Discord). Screenshot anything that looks wrong and send it.

## 7. Content rating (5 min)
Play Console → App content → Content ratings → Start new questionnaire.
Answer "violent material: No" and "user-generated content is the primary
source: No" (keep "users interact: Yes", block/report: Yes). Expected
result: Everyone / PEGI 3.

## 8. Store screenshots (15 min)
Chrome → F12 → device toolbar → Pixel 7 → sign in as playreview@ → capture
Home, Collection, Sets, Restocks, Market search, Sales (Ctrl+Shift+P →
"Capture screenshot"). Send the six PNGs to Claude for framing; upload the
framed set to Phone, 7-inch and 10-inch tablet boxes. Tick the AI label on
the icon and feature graphic only.

## Also, two one-minute settings
- Supabase → Edge Functions → feedback-discord → Secrets: add
  `DISCORD_FEEDBACK_WEBHOOK` = a channel webhook URL (Discord: channel
  settings → Integrations → Webhooks → New → Copy URL). Until then feedback
  still saves to Supabase, it just doesn't post to Discord.
- Then the Android build itself (item 1's second half):
  `docs/PLAY_INTERNAL_TEST_RELEASE.md`.
