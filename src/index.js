#!/usr/bin/env node
/**
 * mneva-connect — connect a coding agent to its hosted Mneva brain.
 *
 * This is the package the Mneva signup page tells you to install. It is a
 * thin MCP stdio server: every tool call is forwarded to your hosted Mneva
 * brain over HTTPS, authenticated with your MNEVA_KEY. No local database,
 * no embeddings here — the hosted engine does all of it. Your agent just
 * sees sixteen tools and a memory that persists everywhere you code.
 *
 * Add to your coding tool's .mcp.json:
 *
 *   {
 *     "mcpServers": {
 *       "mneva": {
 *         "command": "npx",
 *         "args": ["-y", "mneva-connect"],
 *         "env": { "MNEVA_KEY": "mnv_your_key_here" }
 *       }
 *     }
 *   }
 *
 * Env:
 *   MNEVA_KEY   (required) — your tenant API key from the Mneva dashboard
 *   MNEVA_API   (optional) — engine base URL, defaults to the hosted service
 *   MNEVA_AGENT (optional) — agent name on a team brain; defaults to "default"
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.MNEVA_API || 'https://mneva.dev').replace(/\/$/, '');
const KEY = process.env.MNEVA_KEY;
const AGENT = process.env.MNEVA_AGENT || 'default';

if (!KEY) {
  console.error(
    '[mneva] MNEVA_KEY is not set. Add your API key to the mneva server\'s\n' +
      '        env block in .mcp.json. Get a key at https://mneva.dev/signup',
  );
  process.exit(1);
}

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: `error: ${msg}` }], isError: true });

const headers = () => ({
  'content-type': 'application/json',
  'x-mneva-key': KEY,
  'x-mneva-agent': AGENT,
});

async function call(method, path, body) {
  let url = `${API}/v1/${path}`;
  const init = { method, headers: headers(), signal: AbortSignal.timeout(20000) };
  if (method === 'GET') {
    if (body && Object.keys(body).length) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
  } else {
    init.body = JSON.stringify(body || {});
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return fail(`could not reach your Mneva brain (${err.message})`);
  }
  if (res.status === 401) return fail('your MNEVA_KEY is invalid — check it in the Mneva dashboard');
  let data;
  try {
    data = await res.json();
  } catch {
    return fail(`unexpected response from the Mneva engine (HTTP ${res.status})`);
  }
  if (!res.ok) return fail(data.error || `Mneva engine error (HTTP ${res.status})`);
  return json(data);
}

const post = (path, body) => call('POST', path, body);
const get = (path, query) => call('GET', path, query);

const server = new McpServer({ name: 'mneva', version: '0.2.0' });

// ── Memory ────────────────────────────────────────────────────────────
server.registerTool(
  'remember',
  {
    description:
      'Record something that happened in this project — a decision, a fix, a fact. Your hosted Mneva brain keeps it across every session and every tool.',
    inputSchema: { text: z.string().describe('What to remember.') },
  },
  ({ text }) => post('remember', { text }),
);

server.registerTool(
  'recall',
  {
    description:
      'Recall past memories related to a query — semantic, so it finds relevant memories even with no shared words. You do not start cold.',
    inputSchema: { query: z.string().describe('What to recall about.') },
  },
  ({ query }) => post('recall', { query }),
);

server.registerTool(
  'recall_dreams',
  {
    description:
      'Surface unprompted thoughts your Mneva brain produced overnight — recombinations of memories that found a connection worth saying. Dreams surface once; reading them marks them seen. Call this at the start of a session.',
    inputSchema: { limit: z.number().int().min(1).max(20).optional().describe('Max dreams to return. Default 5.') },
  },
  ({ limit }) => get('dreams', { limit }),
);

// ── Beliefs ──────────────────────────────────────────────────────────
server.registerTool(
  'believe',
  {
    description: 'Assert a belief — something held true about this project (a convention, a constraint).',
    inputSchema: {
      text: z.string().describe('The belief to hold.'),
      confidence: z.number().min(0).max(1).optional(),
    },
  },
  ({ text, confidence }) => post('believe', { text, confidence }),
);

server.registerTool(
  'revise',
  {
    description:
      'Revise a belief. The old one is superseded and will never resurface — this is how a corrected mistake stays corrected.',
    inputSchema: {
      belief_id: z.number().int().describe('Id of the belief to revise.'),
      new_text: z.string().describe('The corrected belief.'),
      confidence: z.number().min(0).max(1).optional(),
    },
  },
  ({ belief_id, new_text, confidence }) => post('revise', { belief_id, new_text, confidence }),
);

server.registerTool(
  'evidence',
  {
    description:
      'Record one supporting or refuting observation against a belief. Mneva runs sequential probability ratio testing (SPRT) on accumulated evidence; when the log-likelihood crosses the promote or demote threshold, confidence shifts. This is how a belief earns its place over time.',
    inputSchema: {
      belief_id: z.number().int().describe('Id of the belief.'),
      kind: z.enum(['supporting', 'refuting']).describe('Does this evidence support or refute the belief?'),
      strength: z.number().min(0.1).max(0.9).describe('How strong is this observation? 0.1..0.9, clamped.'),
      note: z.string().optional().describe('Optional context for the audit trail.'),
    },
  },
  ({ belief_id, kind, strength, note }) => post('evidence', { belief_id, kind, strength, note }),
);

server.registerTool(
  'evidence_for',
  {
    description:
      'See the evidence trail behind a belief — every supporting or refuting observation, with strengths and timestamps. Answers "why is this belief at confidence X?" instead of taking the number on faith.',
    inputSchema: { belief_id: z.number().int().describe('Id of the belief to inspect.') },
  },
  ({ belief_id }) => get(`evidence/${belief_id}`),
);

// ── Instinct ─────────────────────────────────────────────────────────
server.registerTool(
  'flag',
  {
    description:
      'Flag something as dangerous or fragile. Mneva remembers the danger and will warn about it later.',
    inputSchema: {
      text: z.string().describe('What is dangerous, and why.'),
      caution: z.number().min(0).max(1).optional(),
    },
  },
  ({ text, caution }) => post('flag', { text, caution }),
);

server.registerTool(
  'assess',
  {
    description:
      'Gut-check a topic before working on it. Returns clear, caution, or danger with the reason — the partner\'s instinct, backed by past predictions that were confidently wrong on this kind of thing.',
    inputSchema: { topic: z.string().describe('What you are about to work on.') },
  },
  ({ topic }) => post('assess', { topic }),
);

// ── Predictions ──────────────────────────────────────────────────────
server.registerTool(
  'predict',
  {
    description:
      'Record a falsifiable prediction so it can be resolved later and fed into calibration. State the prediction so it is testable; pick a domain label (e.g. "schema", "deploy", "perf") so calibration can group it.',
    inputSchema: {
      prediction: z.string().describe('What you expect to happen. State it falsifiably.'),
      domain: z.string().describe('Short label that groups predictions for calibration.'),
      confidence: z.number().min(0).max(1).optional().describe('How sure you are. Default 0.5.'),
      basis: z.string().optional().describe('Why you think this — useful when reviewing surprises.'),
    },
  },
  ({ prediction, domain, confidence, basis }) => post('predict', { prediction, domain, confidence, basis }),
);

server.registerTool(
  'resolve',
  {
    description:
      'Close out a prediction with what actually happened. The surprise value (auto-derived if you do not supply one) feeds calibration so future assess calls can show your track record.',
    inputSchema: {
      prediction_id: z.number().int().describe('Id of the prediction to resolve.'),
      outcome: z.enum(['correct', 'incorrect', 'partial']),
      actual: z.string().describe('What actually happened.'),
      surprise: z.number().min(0).max(1).optional().describe('Override the auto-derived surprise.'),
    },
  },
  ({ prediction_id, outcome, actual, surprise }) =>
    post('resolve', { prediction_id, outcome, actual, surprise }),
);

server.registerTool(
  'predictions_open',
  {
    description:
      'List predictions you have made but have not yet resolved. Oldest first — surfaces stale commitments so they do not get forgotten.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional().describe('Max to return. Default 20.') },
  },
  ({ limit }) => get('predictions/open', { limit }),
);

server.registerTool(
  'calibration',
  {
    description:
      'Your own track record, by domain. For each prediction domain you have worked in, returns accuracy, the confidence gap, brier score, and mean surprise. This is your epistemic mirror.',
    inputSchema: {
      since_days: z.number().int().min(1).optional().describe('Look-back window in days. Omit for all time.'),
    },
  },
  ({ since_days }) => get('calibration', { since_days }),
);

// ── State ────────────────────────────────────────────────────────────
server.registerTool(
  'state',
  {
    description:
      'Your brain\'s current allostatic state — rest, engaged, or overloaded — with the load, variance, and reserve numbers behind the verdict. A memory product that knows when it is tired.',
    inputSchema: {},
  },
  () => get('state'),
);

// ── Multi-agent ──────────────────────────────────────────────────────
server.registerTool(
  'note_about',
  {
    description:
      'Record an outside view of another agent sharing this brain. Useful when you notice a teammate-agent\'s pattern; the observation is recall-able by any agent on this brain via outside_views.',
    inputSchema: {
      subject_agent: z.string().describe('The agent you are observing (their MNEVA_AGENT name).'),
      observation: z.string().describe('What you observed.'),
      kind: z.enum(['characterization', 'feedback', 'pattern']).optional(),
    },
  },
  ({ subject_agent, observation, kind }) => post('note_about', { subject_agent, observation, kind }),
);

server.registerTool(
  'outside_views',
  {
    description:
      'Observations other agents on this brain have left, newest first. The multi-agent dimension — pass your own name as subject_agent to see what teammates say about you.',
    inputSchema: {
      subject_agent: z.string().optional().describe('Scope to observations about this agent.'),
      limit: z.number().int().min(1).max(100).optional().describe('Max to return. Default 20.'),
    },
  },
  ({ subject_agent, limit }) => get('outside_views', { subject_agent, limit }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mneva] connected to your hosted brain at ${API} (agent=${AGENT})`);
