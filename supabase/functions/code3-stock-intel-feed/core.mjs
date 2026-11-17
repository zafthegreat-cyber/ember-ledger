const projectOrigin = 'https://gxsfququorfczvhrkudl.supabase.co';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Max-Age': '3600',
};
const headers = {
  ...cors,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=20, s-maxage=20',
  'X-Content-Type-Options': 'nosniff',
};
const response = (status, body, method = 'GET') =>
  new Response(method === 'HEAD' || status === 204 ? null : JSON.stringify(body), { status, headers });
export function createStockIntelHandler({ load }) {
  if (typeof load !== 'function') throw new TypeError('load required');
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.method !== 'GET' && req.method !== 'HEAD') return response(405, {error: 'Read-only feed'}, req.method);
    try {
      const url = new URL(req.url);
      if (url.search !== '' || !/^\/(?:functions\/v1\/)?code3-stock-intel-feed$/.test(url.pathname)) return response(400, {error:'Unsupported request'}, req.method);
      const payload = await load();
      if (payload?.version !== 1 || !Array.isArray(payload.sources) || !Array.isArray(payload.targets) || !Array.isArray(payload.signals) ||
          payload.sources.length > 6 || payload.targets.length > 80 || payload.signals.length > 40 ||
          !Array.isArray(payload.discoveryWatches) || payload.discoveryWatches.length > 20)
        throw new Error('Invalid feed');
      return response(200, payload, req.method);
    } catch {
      return response(503, {error: 'Stock intelligence temporarily unavailable'}, req.method);
    }
  };
}
export async function fetchStockIntel({project = projectOrigin, key, fetchImpl = fetch}) {
  if (project !== projectOrigin || !key) throw new Error('Project configuration unavailable');
  const upstream = await fetchImpl(project + '/rest/v1/rpc/code3_stock_intelligence_feed', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!upstream.ok) throw new Error('Stock intelligence storage unavailable');
  return upstream.json();
}
