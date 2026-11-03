// Tiny Redis client over Upstash's REST API (no packages needed).
// Works with either env-var naming the Vercel Marketplace may create.
export function makeStore() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (globalThis.__KR_MEMSTORE) return globalThis.__KR_MEMSTORE; // tests
  if (!url || !token) return null;
  const cmd = async (...args) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json();
    if (j.error) throw new Error('redis: ' + j.error);
    return j.result;
  };
  return {
    get: k => cmd('GET', k),
    set: (k, v) => cmd('SET', k, v),
    rpush: (k, v) => cmd('RPUSH', k, v),
    lrange: (k, a, b) => cmd('LRANGE', k, a, b),
  };
}

// in-memory stand-in, same interface (used only by local tests)
export function memStore() {
  const kv = {}, lists = {};
  return {
    get: async k => kv[k] ?? null,
    set: async (k, v) => { kv[k] = v; return 'OK'; },
    rpush: async (k, v) => (lists[k] = lists[k] || []).push(v),
    lrange: async (k, a, b) => { const L = lists[k] || []; return L.slice(a, b === -1 ? undefined : b + 1); },
  };
}
