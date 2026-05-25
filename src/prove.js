/**
 * Proof — mneva-connect against the live hosted engine.
 *
 * 1. Provision a fresh tenant via the engine admin endpoint.
 * 2. Spawn mneva-connect as an MCP server with that tenant's key — exactly
 *    how Cursor / Claude Code would spawn it from .mcp.json.
 * 3. Call tools through the connector and confirm they reach the hosted
 *    brain: remember -> recall, flag -> assess, and an invalid key fails loud.
 *
 * If this passes, the signup page's .mcp.json snippet is true: install
 * mneva-connect with your key and your agent is talking to its brain.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECT = join(__dirname, 'index.js');
const ENGINE = process.env.MNEVA_API || 'http://localhost:8787';
const ADMIN = process.env.MNEVA_ADMIN_SECRET || 'dev-admin-secret';

let pass = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${detail}`); }
};

console.log('\nmneva-connect PROOF (against the live engine)');
console.log('==============================================\n');

// 1. Provision a fresh tenant.
let key;
try {
  const res = await fetch(`${ENGINE}/admin/tenant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mneva-admin': ADMIN },
    body: JSON.stringify({ name: 'connect-proof' }),
  });
  const t = await res.json();
  key = t.key;
  check('provisioned a fresh tenant brain', !!key, JSON.stringify(t));
} catch (err) {
  console.log(`  FAIL  engine unreachable at ${ENGINE} — start it first (${err.message})`);
  process.exit(1);
}

/** Spawn mneva-connect as an MCP server with a given key. */
async function connector(apiKey) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CONNECT],
    env: { ...process.env, MNEVA_KEY: apiKey, MNEVA_API: ENGINE },
  });
  const client = new Client({ name: 'connect-proof', version: '0.1.0' });
  await client.connect(transport);
  return {
    client,
    async call(tool, args) {
      const r = await client.callTool({ name: tool, arguments: args });
      const t = r.content?.[0]?.text ?? '';
      try { return { data: JSON.parse(t), isError: !!r.isError }; }
      catch { return { data: t, isError: !!r.isError }; }
    },
    end: () => client.close(),
  };
}

// 2. A real session through the connector.
console.log('\nThrough mneva-connect, with a valid key:');
{
  const c = await connector(key);

  const tools = (await c.client.listTools()).tools.map((t) => t.name).sort();
  check('connector exposes all six tools',
    JSON.stringify(tools) === JSON.stringify(['assess', 'believe', 'flag', 'recall', 'remember', 'revise']),
    `got ${JSON.stringify(tools)}`);

  await c.call('remember', { text: 'the deploy script is scripts/ship.sh and needs the staging DB up first' });
  const recalled = await c.call('recall', { query: 'how do we release' });
  const hits = recalled.data?.results ?? [];
  check('remember -> recall reaches the hosted brain (semantic)',
    hits.some((m) => m.text.includes('ship.sh')),
    JSON.stringify(recalled.data));

  await c.call('flag', { text: 'the migration runner has dropped columns before — never run it without a backup' });
  const verdict = await c.call('assess', { topic: 'about to run a database migration' });
  check('flag -> assess works through the connector',
    verdict.data?.verdict === 'danger',
    JSON.stringify(verdict.data));
  console.log(`   > assess verdict: ${verdict.data?.verdict} — "${verdict.data?.why}"`);

  await c.end();
}

// 3. An invalid key must fail loudly, not silently.
console.log('\nWith an invalid key:');
{
  const c = await connector('mnv_not_a_real_key');
  const res = await c.call('recall', { query: 'anything' });
  check('invalid key produces a clear error', res.isError === true && /invalid/i.test(res.data),
    JSON.stringify(res));
  await c.end();
}

console.log(`\n${'='.repeat(46)}`);
console.log(`RESULT:  ${pass} passed, ${fail} failed`);
console.log(fail === 0
  ? 'mneva-connect works — the signup snippet is true.'
  : 'mneva-connect NOT proven — see failures above.');
console.log('='.repeat(46) + '\n');

process.exit(fail === 0 ? 0 : 1);
