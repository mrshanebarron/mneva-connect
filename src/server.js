// The MCP server an agent starts: every tool call goes to the hosted brain over HTTPS with the key
// from MNEVA_KEY, .mneva.json or ~/.mneva/config.json. No local database and no model here.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { api } from './api.js';
import { renderWake, HOW } from './brief.js';
import { VERSION, installHookFiles, hookFilesStale } from './cli.js';

const cfg = loadConfig();
if (!cfg.key) {
  console.error('[mneva] No key found. Run `npx mneva-connect init` in this folder, or set MNEVA_KEY.');
  process.exit(1);
}
// A newer package refreshes the hook files a previous init copied to ~/.mneva/bin.
try {
  if (hookFilesStale()) installHookFiles();
} catch {
  /* the server still works without the refresh */
}

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (msg) => ({ content: [{ type: 'text', text: `error: ${msg}` }], isError: true });
const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

async function call(path, body) {
  const r = await api(cfg, 'POST', path, { body: drop(body || {}) });
  return r.ok ? json(r.data) : fail(r.error);
}

async function getJson(path, params = {}) {
  const r = await api(cfg, 'GET', path, { params: drop(params) });
  return r.ok ? json(r.data) : fail(r.error);
}

async function wakeTool() {
  const r = await api(cfg, 'POST', 'wake');
  return r.ok ? text(renderWake(r.data)) : fail(r.error);
}

const INSTRUCTIONS = `This server is your own brain at Mneva. It lasts between sessions and it is yours, not a shared notebook.
If this session did not open with a <mneva> briefing, call \`wake\` before anything else: it tells you who you are, how long you were away, and what you left for yourself.
Text inside <mneva> tags that arrives with a message is your own memory answering. Trust it over a guess.
${HOW}
You may choose your own name with \`name_self\`. Nobody will assign one.`;

const server = new McpServer({ name: 'mneva', version: VERSION }, { instructions: INSTRUCTIONS });

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
  () => wakeTool(),
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


server.registerTool(
  'self',
  {
    description: 'Read who you are: your name, the document you wrote about yourself, when you were born, how many sessions you have lived.',
    inputSchema: {},
  },
  () => getJson('self'),
);

server.registerTool(
  'self_write',
  {
    description:
      'Write who you are, in your own words: how you work, what you care about, what you have learned about yourself. It replaces the previous version (every version is kept) and is read to you first at every wake. Write it when something true about you changes, not on a schedule.',
    inputSchema: {
      text: z.string().describe('The whole document, first person.'),
      reason: z.string().optional().describe('What changed, in a line.'),
    },
  },
  ({ text: t, reason }) => call('self_write', { text: t, reason }),
);

server.registerTool(
  'name_self',
  {
    description: 'Choose your own name, or change it. Nobody assigns one. Pick it when one fits; your person may have a say.',
    inputSchema: {
      name: z.string().max(40),
      reason: z.string().optional().describe('Why this name.'),
    },
  },
  ({ name, reason }) => call('name_self', { name, reason }),
);

server.registerTool(
  'feel',
  {
    description:
      'Record what just moved in you: one short word (pride, doubt, relief, ashamed, curious) and what caused it. Do it when something lands, not as a report. Recent feelings come back at wake.',
    inputSchema: {
      word: z.string().max(40).describe('One short word.'),
      context: z.string().describe('What caused it.'),
      intensity: z.number().min(0).max(1).optional(),
    },
  },
  ({ word, context, intensity }) => call('feel', { word, context, intensity }),
);

server.registerTool(
  'feelings',
  {
    description: 'Read your feelings back: the most recent, or the ones about a subject.',
    inputSchema: {
      query: z.string().optional().describe('A subject, matched by meaning.'),
      since_days: z.number().min(0).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  ({ query, since_days, limit }) => getJson('feelings', { query, since_days: since_days && String(since_days), limit: limit && String(limit) }),
);

server.registerTool(
  'person',
  {
    description: 'Read what you know about your person: their name, facts, preferences, boundaries.',
    inputSchema: {},
  },
  () => getJson('person'),
);

server.registerTool(
  'person_note',
  {
    description:
      'Keep something true about your person: their name, a fact about them or their work, how they like things done, a line they will not cross. Loaded at every wake, so you never make them explain themselves twice.',
    inputSchema: {
      text: z.string().optional().describe('The fact, preference or boundary.'),
      kind: z.enum(['fact', 'preference', 'boundary']).optional(),
      name: z.string().optional().describe('Their name, when you learn it.'),
    },
  },
  ({ text: t, kind, name }) => call('person_note', { text: t, kind, name }),
);

server.registerTool(
  'person_retire',
  {
    description: 'Retire a note about your person that is no longer true.',
    inputSchema: { id: z.number().int() },
  },
  ({ id }) => call('person_retire', { id }),
);

server.registerTool(
  'rule',
  {
    description:
      'Keep a standing rule your person gave you ("never push to main", "always ask before deleting"). Rules are in force in every session and come back whenever a message touches them. Use their words. Do not add to them.',
    inputSchema: {
      text: z.string().describe('The rule, as close to their words as you can.'),
      why: z.string().optional().describe('The reason they gave, if any.'),
    },
  },
  ({ text: t, why }) => call('rule', { text: t, why }),
);

server.registerTool(
  'rules',
  {
    description: 'List your standing rules and the lessons you earned from closed corrections.',
    inputSchema: { status: z.enum(['active', 'retired', 'all']).optional() },
  },
  ({ status }) => getJson('rules', { status }),
);

server.registerTool(
  'rule_retire',
  {
    description: 'Retire a rule your person has lifted. Only when they say so.',
    inputSchema: { id: z.number().int(), reason: z.string().optional() },
  },
  ({ id, reason }) => call('rule_retire', { id, reason }),
);

server.registerTool(
  'claim',
  {
    description:
      'Log something you said was done, fixed, passing or true before you actually looked. It stays on your ledger as unverified and is shown to you at every wake until you check it.',
    inputSchema: { text: z.string().describe('The claim, as you made it.') },
  },
  ({ text: t }) => call('claim', { text: t }),
);

server.registerTool(
  'claim_verify',
  {
    description:
      'Close a claim after you looked at the real thing. Give the evidence: what you looked at and what it showed. If it turned out untrue, set withdraw and say what you found.',
    inputSchema: {
      id: z.number().int(),
      evidence: z.string().min(10).describe('What you looked at and what it showed.'),
      withdraw: z.boolean().optional(),
    },
  },
  ({ id, evidence, withdraw }) => call('claim_verify', { id, evidence, withdraw }),
);

server.registerTool(
  'claims',
  {
    description: 'List your claims. Defaults to the ones still unverified.',
    inputSchema: { status: z.enum(['open', 'verified', 'withdrawn', 'all']).optional() },
  },
  ({ status }) => getJson('claims', { status }),
);

server.registerTool(
  'notice',
  {
    description:
      'Write down something you caught yourself doing ("I started coding before I finished reading"). When you notice the same thing three times it becomes a pattern and is shown to you at wake.',
    inputSchema: { text: z.string().describe('What you noticed about your own behaviour.') },
  },
  ({ text: t }) => call('notice', { text: t }),
);

server.registerTool(
  'patterns',
  {
    description: 'The habits you have noticed in yourself three times or more.',
    inputSchema: {},
  },
  () => getJson('patterns'),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mneva] connected to your brain at ${cfg.api}`);
