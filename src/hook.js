#!/usr/bin/env node
// The loop. Claude Code runs this at the start of a session, with each message, and at the end.
// It prints what the agent should know and never holds a session up: short timeouts, silent on failure.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, HOME_DIR } from './config.js';
import { api } from './api.js';
import { renderWake, renderPeek, renderContext } from './brief.js';

const STATE_DIR = join(HOME_DIR, 'sessions');

function stdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function seenFile(id) {
  return join(STATE_DIR, `${String(id || 'none').replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
}

function loadSeen(id) {
  try {
    return JSON.parse(readFileSync(seenFile(id), 'utf8'));
  } catch {
    return { memories: [], words: [], rules: [] };
  }
}

function saveSeen(id, seen) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(seenFile(id), JSON.stringify(seen));
    for (const f of readdirSync(STATE_DIR)) {
      const p = join(STATE_DIR, f);
      if (Date.now() - statSync(p).mtimeMs > 7 * 86400000) unlinkSync(p);
    }
  } catch {
    /* the briefing matters more than the bookkeeping */
  }
}

export async function runHook(event) {
  const input = stdin();
  const cfg = loadConfig(input.cwd || process.cwd());
  if (!cfg.key) return;

  if (event === 'session-start') {
    const reread = input.source === 'compact' || input.source === 'resume';
    if (reread) {
      const r = await api(cfg, 'GET', 'peek', { timeout: 8000 });
      if (r.ok) process.stdout.write(`${renderPeek(r.data)}\n`);
      return;
    }
    const r = await api(cfg, 'POST', 'wake', { timeout: 10000 });
    if (r.ok) {
      saveSeen(input.session_id, { memories: [], words: [], rules: (r.data.rules || []).map((x) => x.id) });
      process.stdout.write(`${renderWake(r.data)}\n`);
    }
    return;
  }

  if (event === 'prompt') {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) return;
    const r = await api(cfg, 'POST', 'context', { body: { prompt, keep_words: cfg.words !== false }, timeout: 5000 });
    if (!r.ok) return;
    const seen = loadSeen(input.session_id);
    process.stdout.write(`${renderContext(r.data, seen)}\n`);
    for (const [kind, key, id] of [['memories', 'memories', 'id'], ['words', 'their_words', 'at'], ['rules', 'rules', 'id']]) {
      seen[kind] = [...new Set([...(seen[kind] || []), ...(r.data[key] || []).map((x) => x[id])])].slice(-400);
    }
    saveSeen(input.session_id, seen);
    return;
  }

  if (event === 'session-end') {
    await api(cfg, 'POST', 'session_end', { timeout: 5000 });
  }
}

if (process.argv[1] && process.argv[1].endsWith('hook.js')) {
  runHook(process.argv[2]).catch(() => {}).finally(() => process.exit(0));
}
