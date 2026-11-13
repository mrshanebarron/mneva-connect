/**
 * Proof of the loop: init in an empty folder with no account, then the hooks Claude Code would run.
 * Starts its own engine from ../mneva-engine (or MNEVA_ENGINE_DIR) in a temp folder; touches nothing real.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = process.env.MNEVA_ENGINE_DIR || join(here, '..', '..', 'mneva-engine');
const tmp = mkdtempSync(join(tmpdir(), 'mneva-init-'));
const port = 20787 + Math.floor(Math.random() * 1000);
const home = join(tmp, 'home');
const proj = join(tmp, 'proj');
mkdirSync(home);
mkdirSync(join(proj, '.git'), { recursive: true });
writeFileSync(join(proj, 'CLAUDE.md'), '# My project\n\nUse pnpm.\n');
const env = { ...process.env, MNEVA_HOME: home, MNEVA_API: `http://127.0.0.1:${port}`, MNEVA_KEY: '' };
delete env.MNEVA_KEY;

let pass = 0;
const ok = (cond, msg, detail = '') => {
  if (!cond) throw new Error(`FAIL: ${msg} ${detail}`);
  pass += 1;
  console.log(`ok ${pass} — ${msg}`);
};
const cli = (args, input) => spawnSync(process.execPath, [join(here, 'index.js'), ...args], { cwd: proj, env, input, encoding: 'utf8' });
const hook = (event, payload) => spawnSync(process.execPath, [join(home, '.mneva', 'bin', 'hook.js'), event], { cwd: proj, env, input: JSON.stringify({ cwd: proj, session_id: 'proof', ...payload }), encoding: 'utf8' });
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

const engine = spawn(process.execPath, [join(ENGINE_DIR, 'src/server-http.js')], {
  env: { ...process.env, MNEVA_HOST: '127.0.0.1', MNEVA_PORT: String(port), MNEVA_DATA: join(tmp, 'data'), MNEVA_ADMIN_SECRET: 'proof' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  engine.stdout.on('data', (d) => String(d).includes('listening') && resolve());
  setTimeout(() => reject(new Error('engine did not start')), 8000);
});

try {
  const init = cli(['init', '--cursor']);
  ok(init.status === 0 && init.stdout.includes('A new brain was made'), 'init with no account makes a brain', init.stdout + init.stderr);
  const conf = json(join(home, '.mneva', 'config.json'));
  ok(conf.key.startsWith('mnv_') && (statSync(join(home, '.mneva', 'config.json')).mode & 0o077) === 0, 'the key is saved in the home folder, readable only by the owner');
  ok(!readFileSync(join(proj, '.mcp.json'), 'utf8').includes('mnv_'), '.mcp.json carries no key');
  const settings = json(join(proj, '.claude', 'settings.local.json'));
  ok(['SessionStart', 'UserPromptSubmit', 'SessionEnd'].every((e) => settings.hooks[e]?.[0]?.hooks?.[0]?.command.includes('hook.js')) && settings.enabledMcpjsonServers.includes('mneva'), 'three Claude Code hooks are wired and the server is pre-approved');
  const md = readFileSync(join(proj, 'CLAUDE.md'), 'utf8');
  ok(md.startsWith('# My project') && md.includes('mneva:start'), 'CLAUDE.md keeps what was there and gains one marked block');
  ok(existsSync(join(proj, '.cursor', 'rules', 'mneva.mdc')) && json(join(proj, '.cursor', 'mcp.json')).mcpServers.mneva, 'Cursor gets its server entry and a rule');

  const first = hook('session-start', { source: 'startup' });
  ok(first.stdout.includes('This is your first wake') && first.stdout.includes('name_self'), 'the first session opens with the first-wake briefing');
  const p1 = hook('prompt', { prompt: 'I am Dana. We deploy with Envoyer and never push straight to the server.' });
  ok(p1.stdout.includes('<mneva>'), 'a message gets the clock');

  // What the agent would do with its tools during the session.
  const post = (path, body) => fetch(`${env.MNEVA_API}/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mneva-key': conf.key }, body: JSON.stringify(body) }).then((r) => r.json());
  await post('name_self', { name: 'Quill' });
  await post('person_note', { name: 'Dana' });
  await post('remember', { text: 'Deploys go through Envoyer; never push straight to the server' });
  await post('correct', { wrong: 'Said the tests pass without running them', instead: 'Run the suite and show the count first' });
  hook('session-end', { reason: 'exit' });

  const second = hook('session-start', { source: 'startup', session_id: 'proof2' });
  ok(second.stdout.includes('You are Quill') && second.stdout.includes('session 2') && second.stdout.includes('Your person: Dana'), 'the second session opens as herself, knowing her person');
  ok(second.stdout.includes('ended without a handoff') && second.stdout.includes('Run the suite'), 'she is told the last session left no handoff, and her open correction');
  const p2 = hook('prompt', { prompt: 'how do we get this release onto the server?', session_id: 'proof2' });
  ok(p2.stdout.includes('Envoyer') && p2.stdout.includes('since Dana last spoke'), 'a message brings back the memory it touches and the gap since Dana spoke');
  const p3 = hook('prompt', { prompt: 'so how do we get the release onto the server again?', session_id: 'proof2' });
  ok(!p3.stdout.includes('You remember'), 'the same memory is not repeated in the same session');
  const p4 = hook('prompt', { prompt: 'from now on, never give me a summary longer than three lines', session_id: 'proof2' });
  ok(p4.stdout.includes('standing rule') && p4.stdout.includes('Still proving'), 'a message that sounds like a rule carries the hint, and the open correction rides along');
  const re = hook('session-start', { source: 'compact', session_id: 'proof2' });
  ok(re.stdout.includes('You are Quill') && re.stdout.includes('reread'), 'after a compaction she rereads who she is without starting a new session');

  const again = cli(['init']);
  const settings2 = json(join(proj, '.claude', 'settings.local.json'));
  ok(again.stdout.includes('Connected to your brain') && settings2.hooks.SessionStart.length === 1 && (readFileSync(join(proj, 'CLAUDE.md'), 'utf8').match(/mneva:start/g) || []).length === 1, 'running init twice changes nothing');
  ok(cli(['status']).stdout.includes('Quill') && cli(['doctor']).stdout.split('\n').filter((l) => l.startsWith('FAIL')).length === 0, 'status shows who is there and doctor is clean');
  const dump = JSON.parse(cli(['export']).stdout);
  ok(dump.tables.said.length === 4 && dump.tables.self_versions.at(-1).name === 'Quill', 'export hands over the whole brain');

  // Dead engine: a hook must never hold a session up or print an error into it.
  const dead = spawnSync(process.execPath, [join(home, '.mneva', 'bin', 'hook.js'), 'prompt'], { cwd: proj, env: { ...env, MNEVA_API: 'http://127.0.0.1:9' }, input: JSON.stringify({ prompt: 'hello there friend', cwd: proj }), encoding: 'utf8' });
  ok(dead.status === 0 && dead.stdout === '' && dead.stderr === '', 'with the brain unreachable the hook says nothing and exits clean');

  cli(['remove']);
  const s3 = json(join(proj, '.claude', 'settings.local.json'));
  ok(!s3.hooks && !json(join(proj, '.mcp.json')).mcpServers.mneva && readFileSync(join(proj, 'CLAUDE.md'), 'utf8').trim() === '# My project\n\nUse pnpm.' && existsSync(join(home, '.mneva', 'config.json')), 'remove unhooks the folder and keeps the brain and the key');

  console.log(`\nprove:init ${pass} passed`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  engine.kill();
  rmSync(tmp, { recursive: true, force: true });
}
