import { discordClient, poll, testPayload, deliver, verifyDestination } from './core.mjs';

const project = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${project}/rest/v1/rpc/${name}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('Monitor state request failed.');
  return await res.json();
}
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const secret = req.headers.get('x-code3-monitor-secret') ?? '';
    if (secret.length < 32 || secret.length > 200 || await rpc('code3_discord_authorize', { p_secret: secret }) !== true) {
      return new Response('Unauthorized', { status: 401 });
    }
    const body = await req.json();
    if (!body || !['poll', 'test'].includes(body.mode) || Object.keys(body).length !== 1) return new Response('Invalid request', { status: 400 });
    const token = Deno.env.get('CODE3_DISCORD_BOT_TOKEN');
    const key = Deno.env.get('BESTBUY_API_KEY');
    if (!token || (body.mode === 'poll' && !key)) return Response.json({ status: 'blocked', reason: 'Monitor credentials are not configured.' }, { status: 503 });
    const api = discordClient(token);
    if (body.mode === 'test') {
      await verifyDestination(api);
      const event = 'hosted-test-20261024';
      if (await rpc('code3_discord_claim_test', { p_event: event }) !== true) return Response.json({ status: 'already_tested_or_held' });
      const messageId = await deliver(api, testPayload(), event);
      await rpc('code3_discord_complete_test', { p_event: event, p_message: messageId });
      return Response.json({ status: 'test_delivered', messageId });
    }
    return Response.json(await poll({ apiKey: key, api, rpc }));
  } catch {
    // Provider URLs, query strings, headers, API payloads and tokens never enter logs.
    return Response.json({ status: 'failed', reason: 'Monitor stopped safely. Review configuration and private delivery state.' }, { status: 502 });
  }
});
