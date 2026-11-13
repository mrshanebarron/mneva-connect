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
  const expected = ['assess', 'believe', 'calibration', 'claim', 'claim_verify', 'claims', 'correct', 'correction_close', 'corrections', 'evidence', 'evidence_for', 'feel', 'feelings', 'flag', 'intend', 'intent_done', 'name_self', 'note_about', 'notice', 'outside_views', 'patterns', 'person', 'person_note', 'person_retire', 'predict', 'predictions_open', 'recall', 'recall_dreams', 'remember', 'remind', 'resolve', 'revise', 'rule', 'rule_retire', 'rules', 'self', 'self_write', 'sleep', 'state', 'timeline', 'wake'];
  check(`connector exposes all ${expected.length} tools`,
    JSON.stringify(tools) === JSON.stringify(expected),
    `got ${JSON.stringify(tools)}`);
  check('the server tells the agent how to live in the brain', /call `wake` before anything else/.test(c.client.getInstructions() || ''), String(c.client.getInstructions()).slice(0, 120));

  const named = await c.call('name_self', { name: 'Quill', reason: 'short' });
  check('name_self names her', named.data.name === 'Quill', JSON.stringify(named.data));
  const felt = await c.call('feel', { word: 'relief', context: 'the migration ran clean' });
  check('feel records a feeling', felt.data.word === 'relief', JSON.stringify(felt.data));
  const cl = await c.call('claim', { text: 'The cache is cleared' });
  const short = await c.call('claim_verify', { id: cl.data.id, evidence: 'yes' });
  check('claim_verify refuses thin evidence', short.isError === true, JSON.stringify(short.data));

  const corr = await c.call('correct', { wrong: 'pushed straight to main', instead: 'open a pull request' });
  check('correct opens a correction', !corr.isError && corr.data.status === 'open', JSON.stringify(corr.data));
  const slept = await c.call('sleep', { handoff: 'Refund job half done.', intent: 'Finish the refund job test.' });
  check('sleep leaves a handoff and a first act', !slept.isError && slept.data.first_act?.status === 'open', JSON.stringify(slept.data));
  const woke = await c.call('wake', {});
  check('wake returns the handoff, first act and open correction',
    typeof woke.data === 'string' && woke.data.includes('You are Quill') && woke.data.includes('Refund job half done.') && woke.data.includes('Finish the refund job test.') && woke.data.includes('open a pull request') && woke.data.includes('The cache is cleared'),
    String(woke.data).slice(0, 400));
  await c.call('remind', { cue: 'deploying to production', text: 'Tell the client before any deploy.' });
  const a = await c.call('assess', { topic: 'about to deploy the release to production' });
  check('a reminder fires on its cue through assess', a.data.reminders?.[0]?.text === 'Tell the client before any deploy.', JSON.stringify(a.data).slice(0, 300));
  const tl = await c.call('timeline', { limit: 50 });
  check('timeline lists the session in order', Array.isArray(tl.data.events) && tl.data.events.some((e) => e.kind === 'sleep'), JSON.stringify(tl.data).slice(0, 200));

  await c.call('remember', { text: 'the deploy script is scripts/ship.sh and needs the staging DB up first' });
  const recalled = await c.call('recall', { query: 'how do we release' });
  const hits = recalled.data?.memories ?? recalled.data?.results ?? [];
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
  check('invalid key produces a clear error', res.isError === true && /not valid/i.test(res.data),
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
