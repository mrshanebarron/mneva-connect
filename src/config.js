// Where the key lives: MNEVA_KEY in the environment, else .mneva.json in this project or a parent,
// else ~/.mneva/config.json. The key stays out of .mcp.json so it is never committed with the repo.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const HOME_DIR = join(process.env.MNEVA_HOME || homedir(), '.mneva');
export const HOME_CONFIG = join(HOME_DIR, 'config.json');
export const DEFAULT_API = 'https://mneva.dev';

const read = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

export function projectConfigPath(from = process.cwd()) {
  let dir = from;
  for (let i = 0; i < 40; i += 1) {
    const p = join(dir, '.mneva.json');
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function loadConfig(from = process.cwd()) {
  const home = read(HOME_CONFIG) || {};
  const projectPath = projectConfigPath(from);
  const project = projectPath ? read(projectPath) || {} : {};
  const key = process.env.MNEVA_KEY || project.key || home.key || null;
  return {
    key,
    api: (process.env.MNEVA_API || project.api || home.api || DEFAULT_API).replace(/\/$/, ''),
    agent: process.env.MNEVA_AGENT || project.agent || home.agent || 'default',
    words: process.env.MNEVA_WORDS === '0' ? false : (project.words ?? home.words ?? true),
    source: process.env.MNEVA_KEY ? 'MNEVA_KEY' : project.key ? projectPath : home.key ? HOME_CONFIG : null,
  };
}

export function saveConfig(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const merged = { ...(read(path) || {}), ...data };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* not every filesystem has modes */
  }
  return merged;
}
