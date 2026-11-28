-- Every minute, if a push is queued, ask the push-dispatch edge function to send it
-- (Nov 15, 2026). No secret is needed: push-dispatch can only send queued rows.
begin;
select cron.unschedule(jobid) from cron.job where jobname = 'code3-push-dispatch';
select cron.schedule(
  'code3-push-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gxsfququorfczvhrkudl.supabase.co/functions/v1/push-dispatch',
    headers := '{"content-type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (select 1 from public.push_outbox where sent_at is null and attempts < 3);
  $$
);
-- Fresh replays require a separate, explicit delivery activation.
select cron.alter_job((select jobid from cron.job where jobname='code3-push-dispatch'),active:=false);
commit;
