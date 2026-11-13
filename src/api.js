// One small client for the hosted brain. No dependencies, so the hook can run it on bare node.
export async function api(cfg, method, path, { body, params, timeout = 20000 } = {}) {
  const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  let res;
  try {
    res = await fetch(`${cfg.api}/v1/${path}${qs}`, {
      method,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(cfg.key ? { 'x-mneva-key': cfg.key } : {}),
        'x-mneva-agent': cfg.agent || 'default',
      },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    return { ok: false, error: `could not reach your Mneva brain (${err.message})` };
  }
  if (res.status === 401) return { ok: false, status: 401, error: 'your Mneva key is not valid. Run `npx mneva-connect doctor`.' };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, status: res.status, error: `unexpected response from Mneva (HTTP ${res.status})` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data.error || `Mneva error (HTTP ${res.status})` };
  return { ok: true, data };
}
