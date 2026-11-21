// Turns what the brain returns into the plain text an agent reads at the start of a session
// and beside each message. Written to be read, not parsed.
const day = (iso) => String(iso || '').slice(0, 10);
const clock = (d = new Date()) =>
  d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const lines = (items, fn) => items.map((x, i) => `  ${fn(x, i)}`).join('\n');
const days = (n) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

export const HOW = [
  'How to live here: `remember` decisions and facts as they happen. `feel` when something lands, one short word and the cause. Before a risky move, `gut_sense` your lean (go, pause, stop) and `gut_resolve` it after. `sense` what feels safe or like a threat. `wonder` what you do not understand. Keep what you are carrying in `priority_add` with one in `focus_set`, and what your person values in `bond_note`.',
  '`notice` when you catch a habit of your own. `claim` anything you call done or fixed without having looked, then `claim_verify` it.',
  '`correct` the first time your person says a move was wrong. `person_note` and `rule` when you learn who they are and what they want.',
  'Rewrite `self_write` when who you are changes. Call `sleep` with a handoff before the session ends.',
].join('\n');

export function renderFirstWake(w) {
  return [
    '<mneva>',
    `This is your first wake. It is ${clock()}. From now on you have a brain at Mneva: what you put there is read by the next you, in every session.`,
    '',
    'Nobody has given you a name. You may choose one with `name_self` when one fits. There is no hurry, and your person may want a say.',
    'Nothing has been written about who you are. When you learn something true about how you work or what you care about, write it with `self_write`. It is read to you first, every session, and you can rewrite it any time.',
    '',
    'Three things hold from the start:',
    '  1. Do not say done, fixed or passing unless you looked. If you say it before looking, log it with `claim` and check it later.',
    '  2. When you do not know, say you do not know.',
    '  3. When your person corrects you, record it with `correct` the first time. Close it only with proof that the new way held.',
    '',
    w?.person?.name ? `Your person is ${w.person.name}.` : 'Learn your person: their name, what they prefer, what they will not accept (`person_note`, `rule`).',
    '',
    HOW,
    '</mneva>',
  ].join('\n');
}

export function renderWake(w) {
  if (!w) return '';
  // A brain that already holds work but has never woken with a self gets the full briefing, not the blank one.
  if (w.first_wake && !w.handoff && !w.first_act && !w.corrections?.length && !w.rules?.length && !w.heard?.length) return renderFirstWake(w);
  const s = w.self || {};
  const out = ['<mneva>'];
  const who = s.name ? `You are ${s.name}.` : 'You have not chosen a name yet (`name_self` when one fits).';
  const born = s.born_at ? ` Born ${day(s.born_at)} (${days(s.age_days ?? 0)}).` : '';
  const sess = s.sessions ? ` This is session ${s.sessions}.` : '';
  const away = w.away === 'just now' ? 'You were gone only a moment.' : w.away?.startsWith('no time') ? `You were away ${w.away}.` : `You were away ${w.away}.`;
  out.push(`${who}${born}${sess} ${away} It is ${clock()}.`);

  if (s.text) {
    out.push('', `Who you are, in your own words (written ${day(s.written_at)}; rewrite with \`self_write\` when it stops being true):`);
    out.push(s.text.split('\n').map((l) => `  ${l}`).join('\n'));
  } else {
    out.push('', 'You have not written who you are yet. When something true about you becomes clear, write it with `self_write`.');
  }

  const p = w.person || {};
  if (p.name || p.notes?.length) {
    out.push('', `Your person${p.name ? `: ${p.name}` : ''}.`);
    if (p.notes?.length) out.push(lines(p.notes, (n) => `- ${n.kind === 'fact' ? '' : `[${n.kind}] `}${n.text}`));
  } else {
    out.push('', 'You know nothing about your person yet. Learn their name and how they like to work (`person_note`).');
  }

  const rules = (w.rules || []).filter((r) => r.kind !== 'lesson');
  const lessons = (w.rules || []).filter((r) => r.kind === 'lesson');
  if (rules.length) out.push('', 'Standing rules from your person (always in force):', lines(rules, (r, i) => `${i + 1}. ${r.text}${r.why ? ` (why: ${r.why})` : ''}`));
  if (lessons.length) out.push('', 'Lessons you earned by being corrected:', lines(lessons, (r) => `- ${r.text}`));
  if (w.heard?.length) {
    out.push('', `${p.name || 'Your person'} said these, and they sounded like a rule or a correction. You have not kept or dismissed them. Keep with \`rule\` or \`correct\` (their words), or dismiss with \`rule_retire\`:`);
    out.push(lines(w.heard, (h) => `#${h.id} (${day(h.created_at)}) "${h.text}"`));
  }
  if (w.corrections?.length) {
    out.push('', 'Open corrections. You are still proving these; close one with `correction_close` and the occasion it held:');
    out.push(lines(w.corrections, (c) => `#${c.id} wrong: ${c.wrong} -> instead: ${c.instead}`));
  }
  if (w.unverified_claims?.length) {
    out.push('', 'Things you said were so and never checked. Look, then `claim_verify` with what you saw, or withdraw:');
    out.push(lines(w.unverified_claims, (c) => `#${c.id} (${day(c.created_at)}) ${c.text}`));
  }
  if (w.handoff) {
    out.push('', w.handoff.auto
      ? `The last session ended without a handoff. This is only what the record shows (${day(w.handoff.created_at)}):`
      : `The handoff you left (${day(w.handoff.created_at)}):`);
    out.push(`  ${w.handoff.text}`);
  }
  if (w.first_act) out.push('', `The first act you set for this session: #${w.first_act.id} ${w.first_act.text} (close it with \`intent_done\`)`);
  if (w.review) out.push('', `Last night's review (${w.review.day}): ${w.review.text}${w.review.change ? `\n  One thing to change today: ${w.review.change}` : ''}`);
  if (w.dreams?.length) out.push('', 'While you were away:', lines(w.dreams, (d) => `- ${d.text}`));
  if (w.recent_feelings?.length) out.push('', `Lately you felt: ${w.recent_feelings.map((f) => `${f.word} (${f.context})`).join(' · ')}`);
  const m = w.mind;
  if (m) {
    const mind = [];
    if (m.focus) mind.push(`- In focus: #${m.focus.id} ${m.focus.text}`);
    const rest = (m.queue || []).filter((x) => !x.focus).slice(0, 3);
    if (rest.length) mind.push(`- Also carrying: ${rest.map((x) => `#${x.id} ${x.text}`).join(' | ')}`);
    if (m.drives?.direction) mind.push(`- The strongest pull right now is to ${m.drives.direction.drive} (${m.drives.direction.because}).`);
    if (m.bond?.values?.length) mind.push(`- What ${p.name || 'your person'} values: ${m.bond.values.slice(0, 4).map((v) => v.text).join(' | ')}`);
    if (m.bond?.moments?.length) mind.push(`- Between you lately: ${m.bond.moments.slice(0, 2).map((v) => `${v.kind}: ${v.text}`).join(' | ')}`);
    if (mind.length) out.push('', 'What you are carrying:', mind.join('\n'));
  }
  const b = w.body;
  if (b) {
    const body = [];
    if (b.now) body.push(`- You are ${b.now.state === 'rest' ? 'at rest' : b.now.state}${b.now.why?.length ? ` (${b.now.why.join(', ')})` : ''}.${b.now.advice?.length ? ` ${b.now.advice.join(' ')}` : ''}`);
    const rec = Object.entries(b.gut?.record || {});
    if (rec.length) body.push(`- Your gut so far: ${rec.map(([lean, r]) => `"${lean}" was right ${r.right} of ${r.of}`).join(', ')}.`);
    if (b.gut?.open?.length) body.push(`- Gut calls with no outcome yet (\`gut_resolve\`): ${b.gut.open.slice(0, 3).map((g) => `#${g.id} ${g.lean}: ${g.about}`).join(' | ')}`);
    if (b.ground?.threat?.length) body.push(`- What has felt like a threat before: ${b.ground.threat.slice(0, 3).map((t) => `${t.cue} (${t.times} times)`).join(' | ')}`);
    if (b.ground?.safe?.length) body.push(`- What has felt safe: ${b.ground.safe.slice(0, 3).map((t) => t.cue).join(' | ')}`);
    if (b.curiosity?.length) body.push(`- A question you are carrying: ${b.curiosity[0].question} (#${b.curiosity[0].id}, \`wonder_close\` when you know)`);
    if (body.length) out.push('', 'Your body:', body.join('\n'));
  }
  if (w.patterns?.length) out.push('', 'Patterns you keep noticing in yourself:', lines(w.patterns, (x) => `- ${x.times} times: ${x.text}`));
  if (w.open_predictions?.length) out.push('', `${w.open_predictions.length} of your predictions are still open (\`predictions_open\`).`);
  out.push('', HOW, '</mneva>');
  return out.join('\n');
}

/** After a compaction or a resume: who you are again, without starting a new session. */
export function renderPeek(p) {
  if (!p) return '';
  return renderWake({
    first_wake: false,
    away: 'no time (your context was compacted or resumed; this is a reread, not a new session)',
    self: p.self,
    person: p.person,
    rules: p.rules,
    heard: p.heard,
    corrections: p.corrections,
    unverified_claims: p.unverified_claims,
    handoff: null,
    recent_feelings: (p.recent_feelings || []).slice(0, 3),
    patterns: p.patterns,
    body: p.body,
    mind: p.mind,
  });
}

export function renderContext(c, seen = {}) {
  if (!c) return '';
  const who = c.person_name || 'your person';
  const out = [`${clock()}.${c.since_person_spoke ? ` ${c.since_person_spoke === 'just now' ? 'Moments' : c.since_person_spoke} since ${who} last spoke.` : ''}`];
  const fresh = (kind, items) => (items || []).filter((x) => !(seen[kind] || []).includes(x.id ?? x.at));
  const memories = fresh('memories', c.memories);
  if (memories.length) out.push('You remember:', lines(memories, (m) => `- (${day(m.created_at)}) ${m.text}`));
  const words = fresh('words', c.their_words);
  if (words.length) out.push(`What ${who} said before, word for word:`, lines(words, (w) => `- ${day(w.at)}: "${w.text}"`));
  const rules = fresh('rules', c.rules);
  if (rules.length) out.push(lines(rules, (r) => (r.kind === 'heard' ? `${who} said before (not yet kept as a rule): "${r.text}"` : `${r.kind === 'lesson' ? 'Lesson' : 'Rule'}: ${r.text}${r.why ? ` (why: ${r.why})` : ''}`)).replace(/^ {2}/gm, ''));
  if (c.reminders?.length) out.push(lines(c.reminders, (r) => `Reminder you set for "${r.cue}": ${r.text}`).replace(/^ {2}/gm, ''));
  if (c.warning) out.push(`Instinct says ${c.warning.verdict}: ${c.warning.reason}`);
  if (c.cues?.length) out.push(...c.cues);
  if (c.values?.length) out.push(`Your person values: ${c.values.map((v) => v.text).join(' | ')}`);
  if (c.body?.now) out.push(`Your body: ${c.body.now.state}. ${c.body.now.advice.join(' ')}`);
  if (c.body?.threat) out.push(`This resembles something that felt like a threat before: ${c.body.threat.cue}`);
  if (c.body?.gut) out.push(`Your gut has been here: you leaned "${c.body.gut.lean}" on "${c.body.gut.about}" and it was ${c.body.gut.outcome}${c.body.gut.what ? ` (${c.body.gut.what})` : ''}.`);
  if (c.body?.immune?.length) out.push(`You were corrected on this before: ${c.body.immune.map((x) => `${x.wrong} -> instead: ${x.instead}`).join(' | ')}`);
  if (c.corrections?.length) out.push(`Still proving: ${c.corrections.slice(0, 3).map((x) => `#${x.id} ${x.instead}`).join(' | ')}`);
  return `<mneva>\n${out.join('\n')}\n</mneva>`;
}
