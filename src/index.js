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
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Defaults to the hosted Mneva service. Override MNEVA_API only for
// self-hosting or local development against your own engine.
const API = (process.env.MNEVA_API || 'https://mneva.dev').replace(/\/$/, '');
const KEY = process.env.MNEVA_KEY;
// Optional agent identity for the Team plan — multiple agents share one
// brain and observe each other. Defaults to 'default' so solo use is
// unaffected. Set MNEVA_AGENT=alice (or coda, or whatever) in .mcp.json.
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

/** Forward one tool call to the hosted brain (POST). */
async function call(path, body) {
  let res;
  try {
    res = await fetch(`${API}/v1/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mneva-key': KEY, 'x-mneva-agent': AGENT },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
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

/** Read from the hosted brain (GET). For endpoints that don't take a body. */
async function getJson(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  let res;
  try {
    res = await fetch(`${API}/v1/${path}${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: { 'x-mneva-key': KEY, 'x-mneva-agent': AGENT },
      signal: AbortSignal.timeout(20000),
    });
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

const server = new McpServer({ name: 'mneva', version: '0.8.0' });

server.registerTool(
  'remember',
  {
    description:
      'Record something that happened in this project — a decision, a fix, a fact. Your hosted Mneva brain keeps it across every session and every tool.',
    inputSchema: { text: z.string().describe('What to remember.') },
  },
  ({ text }) => call('remember', { text }),
);

server.registerTool(
  'recall',
  {
    description:
      'Recall past memories related to a query — semantic, so it finds relevant memories even with no shared words. You do not start cold.',
    inputSchema: { query: z.string().describe('What to recall about.') },
  },
  ({ query }) => call('recall', { query }),
);

server.registerTool(
  'believe',
  {
    description: 'Assert a belief — something held true about this project (a convention, a constraint).',
    inputSchema: {
      text: z.string().describe('The belief to hold.'),
      confidence: z.number().min(0).max(1).optional(),
    },
  },
  ({ text, confidence }) => call('believe', { text, confidence }),
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
  ({ belief_id, new_text, confidence }) => call('revise', { belief_id, new_text, confidence }),
);

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
  ({ text, caution }) => call('flag', { text, caution }),
);

server.registerTool(
  'assess',
  {
    description:
      'Gut-check a topic before working on it. Returns clear, caution, or danger with the reason — the partner\'s instinct.',
    inputSchema: { topic: z.string().describe('What you are about to work on.') },
  },
  ({ topic }) => call('assess', { topic }),
);

server.registerTool(
  'recall_dreams',
  {
    description:
      'Surface unprompted thoughts your Mneva brain produced between sessions — nightly recombinations of your memories that found a connection worth saying. Dreams surface ONCE; reading them marks them seen. Call this at the start of a session to see what your brain noticed while you were gone.',
    inputSchema: {
      limit: z.number().int().min(1).max(20).optional().describe('Max dreams to return (default 5).'),
    },
  },
  ({ limit }) => getJson('dreams', limit ? { limit: String(limit) } : {}),
);

server.registerTool(
  'predict',
  {
    description:
      'Record a falsifiable prediction so it can be checked later. Use a short domain label (e.g. "deploy", "schema", "user-flow") — predictions cluster by domain for calibration. Confidence is 0.0-1.0. Past predictions become the foundation of assess: an instinct earns trust by being measured.',
    inputSchema: {
      prediction: z.string().describe('What you expect to happen.'),
      domain: z.string().describe('Short label to group predictions for calibration (e.g. "deploy").'),
      confidence: z.number().min(0).max(1).optional().describe('How sure are you? 0.0-1.0, default 0.5.'),
      basis: z.string().optional().describe('Why you think this — optional, but useful when reviewing surprises.'),
    },
  },
  ({ prediction, domain, confidence, basis }) =>
    call('predict', { prediction, domain, confidence, basis }),
);

server.registerTool(
  'resolve',
  {
    description:
      'Close out a prediction with what actually happened. outcome is correct, incorrect, or partial. The surprise value (auto-derived if omitted) feeds calibration — confident wrong predictions teach more than hedged wrong ones.',
    inputSchema: {
      prediction_id: z.number().int().describe('Id of the prediction to resolve.'),
      outcome: z.enum(['correct', 'incorrect', 'partial']).describe('How it landed.'),
      actual: z.string().describe('What actually happened.'),
      surprise: z.number().min(0).max(1).optional().describe('Optional override 0-1; auto-derived from outcome+confidence if omitted.'),
    },
  },
  ({ prediction_id, outcome, actual, surprise }) =>
    call('resolve', { prediction_id, outcome, actual, surprise }),
);

server.registerTool(
  'predictions_open',
  {
    description:
      'List predictions you made but have not yet resolved. Oldest first — surfaces stale commitments. Check this when you start a session or before assess to see what you owe answers on.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Max predictions to return (default 20).'),
    },
  },
  ({ limit }) => getJson('predictions/open', limit ? { limit: String(limit) } : {}),
);

server.registerTool(
  'calibration',
  {
    description:
      'Your own track record, by domain. For each prediction domain you have worked in, returns accuracy, the confidence_gap (how much higher your confidence runs when you are right vs wrong — positive means your confidence is informative, negative means discount it), and mean surprise. This is your epistemic mirror: where to trust your gut and where to slow down. Use before working in a domain where you have prior predictions.',
    inputSchema: {
      since_days: z.number().int().min(1).optional().describe('Only count predictions resolved in the last N days. Default: all time.'),
    },
  },
  ({ since_days }) => getJson('calibration', since_days ? { since_days: String(since_days) } : {}),
);

server.registerTool(
  'evidence',
  {
    description:
      'Record one supporting or refuting observation against a belief. Mneva runs a sequential probability ratio test (SPRT): when accumulated evidence crosses the promote threshold (+2.89 log-likelihood), the belief\'s confidence rises; crossing the demote threshold (-2.25) is the signal to call revise. This is how a belief earns its place over time — every evidence event is recorded and the audit trail is queryable via evidence_for.',
    inputSchema: {
      belief_id: z.number().int().describe('Id of the belief.'),
      kind: z.enum(['supporting', 'refuting']).describe('Does this evidence support or refute the belief?'),
      strength: z.number().min(0.1).max(0.9).describe('How probative is the evidence? 0.1 weak, 0.5 moderate, 0.9 strong.'),
      note: z.string().optional().describe('Optional note about what was observed.'),
    },
  },
  ({ belief_id, kind, strength, note }) =>
    call('evidence', { belief_id, kind, strength, note }),
);

server.registerTool(
  'evidence_for',
  {
    description:
      'See the evidence trail behind a belief — every supporting/refuting observation, with strengths and timestamps. Use this to answer "why is this belief at confidence X?" instead of taking the number on faith.',
    inputSchema: {
      belief_id: z.number().int().describe('Id of the belief.'),
    },
  },
  ({ belief_id }) => getJson(`evidence/${belief_id}`),
);

server.registerTool(
  'state',
  {
    description:
      "Your brain's current allostatic state — rest, engaged, or overloaded. Returns load (mean tool calls/min over the last 60 min on active minutes), variance, and reserve (headroom against a soft per-minute cap). overloaded means a high or spiky load — the signal to slow down, verify more, batch less. rest means there's room to take on something bigger. A memory product that knows when it's tired.",
    inputSchema: {},
  },
  () => getJson('state'),
);

server.registerTool(
  'note_about',
  {
    description:
      "Record an outside view of another agent sharing this brain (Team plan). Useful when you notice a teammate-agent's pattern — \"alice keeps forgetting to call assess before deploys\", \"bob's pricing predictions skew low\". The observation is recall-able by any agent on this brain via outside_views. Self-observation is allowed: subject_agent can be your own MNEVA_AGENT name.",
    inputSchema: {
      subject_agent: z.string().describe('Which agent you are observing (their MNEVA_AGENT name).'),
      observation: z.string().describe('What you observed.'),
      kind: z.enum(['characterization', 'feedback', 'pattern']).optional().describe('Optional classification.'),
    },
  },
  ({ subject_agent, observation, kind }) =>
    call('note_about', { subject_agent, observation, kind }),
);

server.registerTool(
  'outside_views',
  {
    description:
      "Outside views — observations other agents on this brain have left. Pass subject_agent to scope to one agent (including yourself, to see what teammates say about you); omit to see the most recent across all subjects. This is the multi-agent dimension Mem0/Letta/Zep don't surface as a tool.",
    inputSchema: {
      subject_agent: z.string().optional().describe('Only return observations about this agent.'),
      limit: z.number().int().min(1).max(100).optional().describe('Max observations to return (default 20).'),
    },
  },
  ({ subject_agent, limit }) => {
    const params = {};
    if (subject_agent) params.subject_agent = subject_agent;
    if (limit) params.limit = String(limit);
    return getJson('outside_views', params);
  },
);

server.registerTool(
  'wake',
  {
    description:
      'Call this first in every session. Returns how long you were away, the handoff the last session left, what happened since, the first act you set yourself, any open corrections, new overnight dreams, open predictions and your current state. You start mid-stride instead of cold.',
    inputSchema: {},
  },
  () => call('wake', {}),
);

server.registerTool(
  'sleep',
  {
    description:
      'Call this before a session ends. Leave a handoff for the next session: where you got to, what is still open, what to do first. Optionally set one first act (intent) that wake will put in front of you.',
    inputSchema: {
      handoff: z.string().describe('Where you got to, what is open, and what matters next.'),
      intent: z.string().optional().describe('One concrete first act for the next session.'),
    },
  },
  ({ handoff, intent }) => call('sleep', { handoff, intent }),
);

server.registerTool(
  'timeline',
  {
    description:
      'The running line: everything this brain did, in order (memories, beliefs, revisions, flags, corrections, reminders, wakes, sleeps, dreams). Use it to answer "when did we decide that" or "what happened yesterday".',
    inputSchema: {
      since_days: z.number().min(0).optional().describe('Only events from the last N days.'),
      kind: z.string().optional().describe('Only one kind, e.g. revise, flag, correction, sleep.'),
      query: z.string().optional().describe('Only events whose text matches these words.'),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  ({ since_days, kind, query, limit }) => {
    const params = {};
    if (since_days != null) params.since_days = String(since_days);
    if (kind) params.kind = kind;
    if (query) params.query = query;
    if (limit) params.limit = String(limit);
    return getJson('timeline', params);
  },
);

server.registerTool(
  'correct',
  {
    description:
      'Record that a move was wrong and what to do instead. Open on the first clear signal; do not wait for it to happen twice. The correction rides along on every recall and assess until you close it with proof.',
    inputSchema: {
      wrong: z.string().describe('What was done that was wrong.'),
      instead: z.string().describe('What to do instead from now on.'),
      source: z.enum(['user', 'self', 'review']).optional().describe('Who caught it.'),
    },
  },
  ({ wrong, instead, source }) => call('correct', { wrong, instead, source }),
);

server.registerTool(
  'corrections',
  {
    description: 'List corrections. Defaults to the open ones you are still proving.',
    inputSchema: { status: z.enum(['open', 'closed', 'all']).optional() },
  },
  ({ status }) => getJson('corrections', status ? { status } : {}),
);

server.registerTool(
  'correction_close',
  {
    description:
      'Close a correction once the new behaviour has held at least once. Requires proof: describe the real occasion when you did it the corrected way.',
    inputSchema: {
      id: z.number().int().describe('The correction id.'),
      proof: z.string().min(10).describe('The occasion that proved the new habit.'),
    },
  },
  ({ id, proof }) => call('correction_close', { id, proof }),
);

server.registerTool(
  'intend',
  {
    description: 'Set one first act for the next session. It replaces any open intent. wake returns it first.',
    inputSchema: { text: z.string().describe('The first thing to do next time.') },
  },
  ({ text }) => call('intend', { text }),
);

server.registerTool(
  'intent_done',
  {
    description: 'Close the first act: done, or missed with a reason.',
    inputSchema: {
      id: z.number().int(),
      missed: z.boolean().optional(),
      note: z.string().optional().describe('Required when missed.'),
    },
  },
  ({ id, missed, note }) => call('intent_done', { id, missed, note }),
);

server.registerTool(
  'remind',
  {
    description:
      'Prospective memory: a reminder that fires when a later recall or assess touches its cue, matched by meaning. "When anyone touches migrations, remind me to back up production first."',
    inputSchema: {
      cue: z.string().describe('The topic that should trigger it.'),
      text: z.string().describe('What to be reminded of.'),
    },
  },
  ({ cue, text }) => call('remind', { cue, text }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mneva] connected to your hosted brain at ${API}`);
