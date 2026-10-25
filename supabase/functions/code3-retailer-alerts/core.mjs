export const GUILD = '1558588508204179611';
export const BOT = '1563636539370639420';
export const CHANNEL = '1563700457803612254';
export const GAMES = Object.freeze({
  pokemon: { role: '1563700437771878470', search: 'pokemon tcg', name: 'Pokemon' },
  onepiece: { role: '1563700440158179470', search: 'one piece card game', name: 'One Piece' },
  magic: { role: '1563700441525657720', search: 'magic gathering', name: 'Magic' },
  lorcana: { role: '1563700442310123570', search: 'lorcana', name: 'Lorcana' },
});
const clean = value => String(value).normalize('NFKC').replace(/@/gu, '@\u200b').replace(/[\\`*_{}\[\]()<>|~]/gu, '\\$&').slice(0, 220);

export function normalizeProduct(raw, game, now = new Date()) {
  if (!Object.hasOwn(GAMES, game) || !/^\d{4,12}$/u.test(String(raw?.sku ?? '')) ||
      typeof raw.name !== 'string' || typeof raw.onlineAvailability !== 'boolean') return null;
  const name = raw.name.normalize('NFKC').toLowerCase();
  const matchesGame = { pokemon: /pok[eé]mon/u, onepiece: /one\s+piece/u,
    magic: /magic.*gathering/u, lorcana: /lorcana/u }[game].test(name);
  const cards = /booster|elite trainer|trading card|card game|starter deck|commander|gift set|illumineer.*trove|collection box/u.test(name);
  const accessory = /sleeves?|binders?|playmats?|deck boxes?|protectors?|video game|nintendo|controller|plush|figure|funko/u.test(name);
  if (!matchesGame || !cards || accessory) return null;
  let url;
  try { url = new URL(raw.url); } catch { return null; }
  // Accept only Best Buy's public product links, never cart or arbitrary redirects.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !((['www.bestbuy.com', 'bestbuy.com'].includes(url.hostname) && url.pathname.startsWith('/site/')) ||
        (url.hostname === 'api.bestbuy.com' && /^\/click\/[A-Za-z0-9]+\/\d+\/pdp$/u.test(url.pathname)))) return null;
  if ([...url.searchParams.keys()].some(k => /key|token|auth/iu.test(k))) return null;
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid observation time.');
  return { sku: String(raw.sku), game, available: raw.onlineAvailability,
    name: raw.name, url: url.href, observedAt: now.toISOString() };
}

export async function fetchGame(apiKey, game, { fetchImpl = fetch, now = new Date() } = {}) {
  if (!apiKey || !/^[A-Za-z0-9_-]{8,200}$/u.test(apiKey) || !Object.hasOwn(GAMES, game)) throw new Error('Retailer credentials are not configured.');
  const filter = GAMES[game].search.split(' ').map(word => `search=${word}`).join('&');
  const result = new Map();
  for (let page = 1; page <= 5; page++) {
    const url = new URL(`https://api.bestbuy.com/v1/products(${filter})`);
    for (const [key, value] of Object.entries({ apiKey, format: 'json', show: 'sku,name,onlineAvailability,url', pageSize: '100', page: String(page) })) url.searchParams.set(key, value);
    let response;
    try { response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(8000) }); }
    catch { throw new Error('Best Buy connection failed.'); }
    if (!response.ok) throw new Error(`Best Buy request failed (HTTP ${response.status}).`);
    let data;
    try { data = await response.json(); } catch { throw new Error('Best Buy returned invalid JSON.'); }
    if (!Array.isArray(data.products) || data.partial === true || !Number.isInteger(data.totalPages) || data.totalPages < 0 || data.totalPages > 5) {
      throw new Error('Best Buy returned an incomplete or oversized catalog. No observations accepted.');
    }
    for (const raw of data.products) {
      const item = normalizeProduct(raw, game, now);
      if (item) result.set(item.sku, item);
    }
    if (page >= data.totalPages) return [...result.values()];
  }
  throw new Error('Best Buy pagination did not finish.');
}

export function alertPayload(product, now = new Date()) {
  if (!product || !Object.hasOwn(GAMES, product.game) || product.available !== true ||
      !Number.isFinite(Date.parse(product.observedAt)) || now - new Date(product.observedAt) > 600_000 ||
      new Date(product.observedAt) - now > 60_000) throw new Error('Only fresh, available retailer observations can notify.');
  const checked = normalizeProduct({ sku: product.sku, name: product.name, onlineAvailability: product.available, url: product.url }, product.game, new Date(product.observedAt));
  if (!checked) throw new Error('Unapproved retailer product.');
  const role = GAMES[product.game].role;
  return { content: `<@&${role}>`, allowed_mentions: { parse: [], users: [], roles: [role], replied_user: false },
    embeds: [{ title: `Best Buy — ${GAMES[product.game].name} online availability`, color: 0xD4AF37,
      description: `${clean(product.name)}\n\nBest Buy's official API reports this product available online. Availability can change; confirm on the retailer page.`,
      url: product.url, fields: [{ name: 'Source', value: 'Best Buy Products API' },
        { name: 'Observed', value: product.observedAt }, { name: 'Code 3 TCG', value: 'https://code3tcg.app/' }],
      timestamp: product.observedAt, footer: { text: 'Optional game alerts • no stock quantity or checkout automation' } }] };
}

export function testPayload() {
  const roles = Object.values(GAMES).map(g => g.role);
  return { content: roles.map(id => `<@&${id}>`).join(' '),
    allowed_mentions: { parse: [], users: [], roles, replied_user: false },
    embeds: [{ title: 'TEST — hosted retailer alert pipeline', color: 0xD4AF37,
      description: 'This is a TEST of the hosted sender and all four optional game roles. It does not report real product availability.' }] };
}

export function discordClient(token, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!token) throw new Error('Discord credentials are not configured.');
  return async (route, { method = 'GET', body } = {}) => {
    if (!/^\/[a-zA-Z0-9/@_-]+$/u.test(route)) throw new Error('Invalid Discord route.');
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try { res = await fetchImpl(`https://discord.com/api/v10${route}`, { method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
      catch { throw new Error('Discord connection failed; delivery may be uncertain.'); }
      if (res.status === 429 && attempt < 2) {
        const retry = Number((await res.json()).retry_after);
        if (!Number.isFinite(retry) || retry < 0 || retry > 5) throw new Error('Discord rate limit requires a later review.');
        await sleep(Math.ceil(retry * 1000) + 100); continue;
      }
      if (method === 'DELETE' && res.status === 404) return null;
      if (!res.ok) throw new Error(`Discord request failed (HTTP ${res.status}); inspect before retrying.`);
      return res.status === 204 ? null : await res.json();
    }
  };
}

export async function verifyDestination(api) {
  const bot = await api('/users/@me');
  const channel = await api(`/channels/${CHANNEL}`);
  if (!bot.bot || bot.id !== BOT || channel.guild_id !== GUILD || channel.type !== 0) throw new Error('Discord destination identity mismatch.');
  const access = channel.permission_overwrites?.find(item => item.type === 1 && item.id === BOT);
  if (!access || !(BigInt(access.allow) & (1n << 17n)) || BigInt(access.deny) & (1n << 17n)) throw new Error('The server owner must allow bot role mentions in restock-alerts.');
}

export async function deliver(api, payload, eventKey) {
  const ids = payload.allowed_mentions?.roles;
  if (!ids?.length || ids.some(id => !Object.values(GAMES).some(game => game.role === id)) ||
      payload.content !== [...new Set(ids)].map(id => `<@&${id}>`).join(' ') ||
      payload.allowed_mentions.parse?.length || payload.allowed_mentions.users?.length || payload.allowed_mentions.replied_user !== false) throw new Error('Unsafe mention policy.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eventKey));
  const nonce = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const receipt = await api(`/channels/${CHANNEL}/messages`, { method: 'POST', body: { ...payload, nonce, enforce_nonce: true } });
  if (!/^\d{17,20}$/u.test(receipt.id ?? '')) throw new Error('Missing Discord receipt.');
  const saved = await api(`/channels/${CHANNEL}/messages/${receipt.id}`);
  if (saved.channel_id !== CHANNEL || saved.author?.id !== BOT || saved.content !== payload.content || saved.mention_everyone || saved.mentions?.length ||
      JSON.stringify([...(saved.mention_roles ?? [])].sort()) !== JSON.stringify([...ids].sort()) ||
      saved.embeds?.[0]?.title !== payload.embeds[0]?.title || saved.embeds?.[0]?.description !== payload.embeds[0]?.description) throw new Error('Discord readback mismatch; delivery held for review.');
  return saved.id;
}

export async function poll({ apiKey, api, rpc, fetchImpl = fetch, now = new Date() }) {
  await verifyDestination(api);
  const lease = await rpc('code3_discord_acquire', {});
  if (!lease) return { status: 'busy', checked: 0, sent: 0, errors: 0 };
  let checked = 0, sent = 0, errors = 0;
  let held = false;
  try {
    for (const old of await rpc('code3_discord_cleanup_list', { p_lease: lease })) {
      if (!/^\d{17,20}$/u.test(old.message_id)) throw new Error('Invalid cleanup receipt.');
      await api(`/channels/${CHANNEL}/messages/${old.message_id}`, { method: 'DELETE' });
      await rpc('code3_discord_cleaned', { p_lease: lease, p_event: old.event_key });
    }
    // Four small, independent official API queries. Failure in one game never
    // changes its stored availability or prevents another complete query.
    const games = Object.keys(GAMES);
    const snapshots = await Promise.allSettled(games.map(game => fetchGame(apiKey, game, { fetchImpl, now })));
    for (let i = 0; i < games.length; i++) {
      const snapshot = snapshots[i];
      if (snapshot.status !== 'fulfilled') { errors++; continue; }
      const products = snapshot.value;
      checked += products.length;
      const events = await rpc('code3_discord_observe', { p_lease: lease, p_game: games[i],
        p_products: products.map(p => ({ sku: p.sku, available: p.available })) });
      for (const event of events) {
        const product = products.find(p => p.sku === event.sku && p.available);
        if (!product || sent >= 10 || held) continue;
        if (!await rpc('code3_discord_claim', { p_lease: lease, p_event: event.event_key })) continue;
        try {
          const id = await deliver(api, alertPayload(product, now), event.event_key);
          await rpc('code3_discord_complete', { p_lease: lease, p_event: event.event_key, p_message: id });
          sent++;
        } catch {
          await rpc('code3_discord_uncertain', { p_lease: lease, p_event: event.event_key });
          errors++;
          held = true;
          // Stop notifications after an uncertain delivery or permission failure.
          break;
        }
      }
    }
    return { status: errors ? 'partial' : 'ok', checked, sent, errors };
  } catch (error) {
    errors++;
    throw error;
  } finally {
    await rpc('code3_discord_release', { p_lease: lease, p_checked: checked, p_sent: sent, p_errors: errors });
  }
}
