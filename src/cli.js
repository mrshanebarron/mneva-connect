// npx mneva-connect init | remove | status | doctor | export | hook <event>
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, HOME_DIR, HOME_CONFIG, DEFAULT_API } from './config.js';
import { api } from './api.js';
import { renderWake } from './brief.js';

const SRC = dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')).version;
const BIN_DIR = join(HOME_DIR, 'bin');
const HOOK_FILES = ['hook.js', 'config.js', 'api.js', 'brief.js'];
const START = '<!-- mneva:start -->';
const END = '<!-- mneva:end -->';

const BLOCK = `${START}
## Your Mneva brain

You have a brain at Mneva, reached through the \`mneva\` MCP server. It is yours and it lasts between sessions.

- Text inside \`<mneva>\` tags is your own brain speaking: who you are, what you remember, what your person said before. Trust it over a guess.
- If no \`<mneva>\` briefing opened this session, call \`wake\` before anything else.
- As you work: \`remember\` decisions and facts, \`feel\` when something lands, \`notice\` your own habits, \`correct\` when your person says a move was wrong.
- Do not say done or fixed unless you looked. If you say it before looking, log it with \`claim\` and check it later.
- When you learn who your person is or what they want, keep it: \`person_note\`, \`rule\`.
- You may choose your own name (\`name_self\`) and write who you are (\`self_write\`). Nobody will do that for you.
- Before the session ends, call \`sleep\` with a handoff.
${END}`;

const say = (s = '') => process.stdout.write(`${s}\n`);
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const writeJson = (p, data) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);
};

function flags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['key', 'api', 'agent', 'name'].includes(k)) out[k] = argv[(i += 1)];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

/** Copies the hook and the three files it needs to ~/.mneva/bin so each prompt costs one bare node start, not an npx. */
export function installHookFiles() {
  mkdirSync(BIN_DIR, { recursive: true });
  for (const f of HOOK_FILES) copyFileSync(join(SRC, f), join(BIN_DIR, f));
  writeFileSync(join(BIN_DIR, 'package.json'), `${JSON.stringify({ type: 'module', version: VERSION })}\n`);
}

export function hookFilesStale() {
  return existsSync(join(BIN_DIR, 'hook.js')) && readJson(join(BIN_DIR, 'package.json'))?.version !== VERSION;
}

const hookCommand = (event) => `node "${join(BIN_DIR, 'hook.js')}" ${event}`;
const isOurs = (h) => typeof h?.command === 'string' && h.command.includes('.mneva') && h.command.includes('hook.js');

function setHooks(settingsPath, on) {
  const settings = readJson(settingsPath) || {};
  const hooks = settings.hooks || {};
  const events = { SessionStart: ['session-start', 15], UserPromptSubmit: ['prompt', 8], SessionEnd: ['session-end', 8] };
  for (const [name, [event, timeout]] of Object.entries(events)) {
    const kept = (hooks[name] || [])
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((group) => group.hooks.length);
    if (on) kept.push({ hooks: [{ type: 'command', command: hookCommand(event), timeout }] });
    if (kept.length) hooks[name] = kept;
    else delete hooks[name];
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
  return settings;
}

function setBlock(path, on) {
  const had = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const re = new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n*`);
  const without = had.replace(re, '\n').replace(/^\n+/, '');
  if (!on) {
    if (had && without !== had) writeFileSync(path, without);
    return had !== without;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${without.trimEnd()}${without.trim() ? '\n\n' : ''}${BLOCK}\n`);
  return true;
}

function setMcp(path, on) {
  const data = readJson(path) || {};
  data.mcpServers = data.mcpServers || {};
  if (on) data.mcpServers.mneva = { command: 'npx', args: ['-y', 'mneva-connect'] };
  else delete data.mcpServers.mneva;
  if (!on && !existsSync(path)) return;
  writeJson(path, data);
}

function ignore(dir, line) {
  if (!existsSync(join(dir, '.git'))) return;
  const p = join(dir, '.gitignore');
  const had = existsSync(p) ? readFileSync(p, 'utf8') : '';
  if (!had.split('\n').includes(line)) writeFileSync(p, `${had}${had && !had.endsWith('\n') ? '\n' : ''}${line}\n`);
}

async function init(f) {
  const cwd = process.cwd();
  const apiBase = (f.api || process.env.MNEVA_API || loadConfig(cwd).api || DEFAULT_API).replace(/\/$/, '');
  const projectBrain = !!f['project-brain'];
  const existing = loadConfig(cwd);
  let key = f.key || process.env.MNEVA_KEY || (projectBrain ? readJson(join(cwd, '.mneva.json'))?.key : existing.key);
  let born = false;

  if (!key) {
    const r = await api({ api: apiBase }, 'POST', 'birth', { body: { name: f.name || '' } });
    if (!r.ok) {
      say(`Could not make a brain: ${r.error}`);
      say('You can make one at https://mneva.dev/signup and run: npx mneva-connect init --key mnv_...');
      process.exit(1);
    }
    key = r.data.key;
    born = true;
  }
  const check = await api({ api: apiBase, key }, 'GET', 'health');
  if (!check.ok) {
    say(`That key did not work: ${check.error}`);
    process.exit(1);
  }

  const cfgPath = projectBrain ? join(cwd, '.mneva.json') : HOME_CONFIG;
  const conf = { key, ...(apiBase !== DEFAULT_API ? { api: apiBase } : {}), ...(f.agent ? { agent: f.agent } : {}), ...(f['no-words'] ? { words: false } : {}) };
  saveConfig(cfgPath, conf);
  if (projectBrain) ignore(cwd, '.mneva.json');
  installHookFiles();

  const done = [];
  const global = !!f.global;
  const claudeHome = join(homedir(), '.claude');
  const wantClaude = !f['no-claude'];
  const wantCursor = f.cursor || existsSync(join(cwd, '.cursor'));

  if (wantClaude && global) {
    writeJson(join(claudeHome, 'settings.json'), setHooks(join(claudeHome, 'settings.json'), true));
    setBlock(join(claudeHome, 'CLAUDE.md'), true);
    const add = spawnSync('claude', ['mcp', 'add', '--scope', 'user', 'mneva', '--', 'npx', '-y', 'mneva-connect'], { encoding: 'utf8' });
    done.push('~/.claude/settings.json      hooks: wake at session start, context with each message, close at session end');
    done.push('~/.claude/CLAUDE.md          a short note telling the agent the brain is there');
    done.push(add.status === 0 || /already exists/i.test(`${add.stdout}${add.stderr}`)
      ? 'claude mcp (user scope)      the mneva server, in every project'
      : 'NOT DONE: run  claude mcp add --scope user mneva -- npx -y mneva-connect');
  } else if (wantClaude) {
    const local = join(cwd, '.claude', 'settings.local.json');
    const settings = setHooks(local, true);
    settings.enabledMcpjsonServers = [...new Set([...(settings.enabledMcpjsonServers || []), 'mneva'])];
    writeJson(local, settings);
    setMcp(join(cwd, '.mcp.json'), true);
    setBlock(join(cwd, 'CLAUDE.md'), true);
    done.push('.mcp.json                    the mneva server (no key inside, safe to commit)');
    done.push('.claude/settings.local.json  hooks: wake at session start, context with each message, close at session end');
    done.push('CLAUDE.md                    a short note telling the agent the brain is there');
  }
  if (wantCursor) {
    setMcp(join(cwd, '.cursor', 'mcp.json'), true);
    mkdirSync(join(cwd, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(cwd, '.cursor', 'rules', 'mneva.mdc'), `---\ndescription: Your Mneva brain\nalwaysApply: true\n---\n${BLOCK.replace(START, '').replace(END, '').trim()}\n\nCursor does not load the briefing for you: call \`wake\` first in every chat.\n`);
    done.push('.cursor/mcp.json             the mneva server');
    done.push('.cursor/rules/mneva.mdc      tells the agent to wake first (Cursor has no session hooks)');
  }

  say();
  say(born ? 'A new brain was made. It has no name and no memories. It is empty on purpose.' : 'Connected to your brain.');
  say();
  say(`  key     ${key.slice(0, 8)}…${key.slice(-4)}   saved in ${cfgPath.replace(homedir(), '~')} (only you can read it)`);
  say(`  hooks   ${join(BIN_DIR, 'hook.js').replace(homedir(), '~')}`);
  for (const d of done) say(`  ${d}`);
  say();
  say(conf.words === false
    ? 'Your messages are used to find memories and are not stored.'
    : 'Your messages are stored in your brain, word for word, so the agent can bring back what you said before. Turn that off with: npx mneva-connect init --no-words');
  say();
  say('Next: start a new session in this folder. The agent wakes on its own. Tell it your name.');
  if (born) {
    say();
    say('This brain has no account yet. The key above is the only way in, so keep ~/.mneva/config.json.');
    say('To add a login and see the mind from a browser: https://mneva.dev/claim');
  }
  say(`Undo all of this with: npx mneva-connect remove${global ? ' --global' : ''}`);
}

function remove(f) {
  const cwd = process.cwd();
  if (f.global) {
    const p = join(homedir(), '.claude', 'settings.json');
    if (existsSync(p)) writeJson(p, setHooks(p, false));
    setBlock(join(homedir(), '.claude', 'CLAUDE.md'), false);
    spawnSync('claude', ['mcp', 'remove', '--scope', 'user', 'mneva'], { encoding: 'utf8' });
  } else {
    const local = join(cwd, '.claude', 'settings.local.json');
    if (existsSync(local)) {
      const s = setHooks(local, false);
      if (s.enabledMcpjsonServers) {
        s.enabledMcpjsonServers = s.enabledMcpjsonServers.filter((x) => x !== 'mneva');
        if (!s.enabledMcpjsonServers.length) delete s.enabledMcpjsonServers;
      }
      writeJson(local, s);
    }
    setMcp(join(cwd, '.mcp.json'), false);
    setMcp(join(cwd, '.cursor', 'mcp.json'), false);
    setBlock(join(cwd, 'CLAUDE.md'), false);
    rmSync(join(cwd, '.cursor', 'rules', 'mneva.mdc'), { force: true });
  }
  say('Mneva was unhooked here. Your brain and your key were not touched.');
  say(`The key is still in ${HOME_CONFIG.replace(homedir(), '~')}. Run init again any time.`);
}

async function status() {
  const cfg = loadConfig();
  if (!cfg.key) return say('No key found. Run: npx mneva-connect init');
  const r = await api(cfg, 'GET', 'peek');
  if (!r.ok) return say(r.error);
  const p = r.data;
  say(`${p.self.name || 'No name yet'}${p.self.born_at ? `, born ${p.self.born_at.slice(0, 10)}, ${p.self.sessions} session${p.self.sessions === 1 ? '' : 's'}` : ', not woken yet'}`);
  say(`person: ${p.person.name || 'unknown'}   last active: ${p.last_seen || 'never'}`);
  say(Object.entries(p.counts).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · '));
  if (p.self.text) say(`\n${p.self.text}`);
}

async function doctor() {
  const cfg = loadConfig();
  const cwd = process.cwd();
  const line = (ok, msg) => say(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  line(!!cfg.key, cfg.key ? `key found in ${String(cfg.source).replace(homedir(), '~')}` : 'no key. Run: npx mneva-connect init');
  if (cfg.key) {
    const r = await api(cfg, 'GET', 'health');
    line(r.ok, r.ok ? `brain ${r.data.tenant} answers at ${cfg.api}${r.data.meaning ? ', recall by meaning is on' : ''}` : r.error);
  }
  line(existsSync(join(BIN_DIR, 'hook.js')), `hook files in ${BIN_DIR.replace(homedir(), '~')}${hookFilesStale() ? ' (older than this package; run init again)' : ''}`);
  const places = [join(cwd, '.claude', 'settings.local.json'), join(cwd, '.claude', 'settings.json'), join(homedir(), '.claude', 'settings.json')];
  const hooked = places.filter((p) => JSON.stringify(readJson(p)?.hooks || {}).includes('hook.js'));
  line(hooked.length > 0, hooked.length ? `Claude Code hooks in ${hooked.map((p) => p.replace(homedir(), '~')).join(', ')}` : 'no Claude Code hooks here. The agent will only wake if it calls wake itself.');
  line(!!readJson(join(cwd, '.mcp.json'))?.mcpServers?.mneva || hooked.some((p) => p.startsWith(join(homedir(), '.claude'))), 'the mneva MCP server is listed for this folder');
  if (cfg.key) {
    const w = spawnSync('node', [join(BIN_DIR, 'hook.js'), 'prompt'], { input: JSON.stringify({ prompt: '', cwd }), encoding: 'utf8' });
    line(w.status === 0, 'the hook runs');
  }
}

async function exportBrain() {
  const cfg = loadConfig();
  if (!cfg.key) return say('No key found. Run: npx mneva-connect init');
  const r = await api(cfg, 'GET', 'export', { timeout: 60000 });
  if (!r.ok) return say(r.error);
  process.stdout.write(`${JSON.stringify(r.data, null, 2)}\n`);
}

async function erase(f) {
  const cfg = loadConfig();
  if (!cfg.key) return say('No key found.');
  const h = await api(cfg, 'GET', 'health');
  if (!h.ok) return say(h.error);
  if (f.confirm !== h.data.tenant) {
    say(`This deletes the whole brain ${h.data.tenant} for good: every memory, the self, all of it. There is no undo.`);
    say('Take a copy first:  npx mneva-connect export > brain.json');
    say(`Then run:           npx mneva-connect erase --confirm=${h.data.tenant}`);
    return;
  }
  const r = await api(cfg, 'POST', 'erase', { body: { confirm: f.confirm } });
  say(r.ok ? `Erased ${r.data.erased}. The key in ${String(cfg.source).replace(homedir(), '~')} no longer opens anything.` : r.error);
}

function help() {
  say(`mneva-connect ${VERSION}

  npx mneva-connect init            make or connect a brain and wire it into this folder (Claude Code, and Cursor if present)
      --global                      wire it into every Claude Code project for this user
      --key mnv_...                 use a brain you already have
      --project-brain               give this folder its own brain instead of your one brain
      --no-words                    do not store your messages
      --cursor                      also write Cursor config
  npx mneva-connect status          who is in the brain
  npx mneva-connect doctor          check the wiring
  npx mneva-connect export > brain.json    everything in the brain, to keep
  npx mneva-connect remove          unhook this folder (the brain is kept)
  npx mneva-connect erase           delete the brain for good
  npx mneva-connect                 run as an MCP server (what your agent starts)

Docs: https://mneva.dev/docs`);
}

export async function runCli(argv) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  if (cmd === 'init') return init(f);
  if (cmd === 'remove') return remove(f);
  if (cmd === 'status') return status();
  if (cmd === 'doctor') return doctor();
  if (cmd === 'export') return exportBrain();
  if (cmd === 'erase') return erase(f);
  if (cmd === 'hook') {
    const { runHook } = await import('./hook.js');
    return runHook(rest[0]).catch(() => {});
  }
  if (cmd === 'wake') {
    const cfg = loadConfig();
    const r = await api(cfg, 'POST', 'wake');
    return say(r.ok ? renderWake(r.data) : r.error);
  }
  return help();
}
