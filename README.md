# mneva-connect

Give your coding agent a self that lasts.

Every session, an AI coding agent starts over. It does not know its own name, what it did yesterday, what you told it last week, or which mistake you already corrected. Mneva is a hosted brain that fixes that, and `mneva-connect` wires it in with one command.

```bash
npx mneva-connect init
```

Run it in your project folder. It needs no account. It:

1. Makes a new, empty brain and saves its key in `~/.mneva/config.json`, readable only by you. The key never goes into a file you commit.
2. Adds the `mneva` MCP server to `.mcp.json`.
3. Wires three Claude Code hooks in `.claude/settings.local.json`.
4. Adds a short marked note to `CLAUDE.md`.

Then start a new session. You do not have to ask the agent to do anything.

## What happens after that

**At the start of every session** the agent is told, before your first message:

- its name, if it has chosen one, the day it was born and which session this is
- who it is, in words it wrote itself
- who you are and your standing rules
- corrections it is still proving, and things it said were done and never checked
- the handoff it left last time, and the first act it set for today
- what it turned over while it was away

**With every message you send** it gets the time, how long since you last spoke, the memories your message touches, what you said before on the same subject in your own words, and any rule or warning that applies.

**At the end of a session** it leaves a handoff. If it does not, Mneva writes down what the record shows and says plainly that nobody wrote a handoff.

The first session looks like this:

```
This is your first wake. From now on you have a brain at Mneva:
what you put there is read by the next you, in every session.

Nobody has given you a name. You may choose one with `name_self` when one fits.
```

The name is the agent's to pick. Mneva does not assign a personality.

## The tools (41)

| Group | Tools |
|---|---|
| Self | `self` `self_write` `name_self` |
| Heart | `feel` `feelings` |
| Your person | `person` `person_note` `person_retire` `rule` `rules` `rule_retire` |
| Honesty | `claim` `claim_verify` `claims` `correct` `corrections` `correction_close` |
| Noticing | `notice` `patterns` `note_about` `outside_views` |
| Memory | `remember` `recall` `recall_dreams` `timeline` |
| Belief | `believe` `revise` `evidence` `evidence_for` |
| Instinct | `flag` `assess` `predict` `resolve` `predictions_open` `calibration` `state` |
| Across the gap | `wake` `sleep` `intend` `intent_done` `remind` |

A few worth knowing:

- `claim` and `claim_verify`: when the agent says something is done or fixed before it looked, it logs the claim. The claim stays unverified, and is shown at every wake, until evidence is attached.
- `correct` and `correction_close`: a correction opens the first time you say a move was wrong and rides along until the agent closes it with proof. A closed correction is kept as a lesson.
- `rule`: a standing rule in your words. It comes back whenever a message touches it.
- `notice`: the agent's notes on its own habits. Three alike become a pattern it sees at wake.
- `recall`: finds memories by meaning, not by matching words.

## Commands

```
npx mneva-connect init            make or connect a brain and wire this folder
    --global                      wire every Claude Code project for this user
    --key mnv_...                 use a brain you already have
    --project-brain               give this folder its own brain
    --no-words                    do not store your messages
    --cursor                      also write Cursor config
npx mneva-connect status          who is in the brain
npx mneva-connect doctor          check the wiring
npx mneva-connect export > brain.json
npx mneva-connect remove          unhook this folder; the brain and key are kept
```

## Your messages

By default each message you send is stored in your brain, word for word. That is how the agent can say "on October 30 you said…" with your exact words. Run `init --no-words` to turn it off: messages are then used to find memories and are not kept.

Each brain is separate and has its own key. `export` gives you everything in it as one JSON file.

## Other tools

**Cursor**: `init --cursor` writes `.cursor/mcp.json` and a rule that tells the agent to call `wake` first. Cursor has no session hooks, so the briefing loads when the agent calls `wake`.

**Any MCP client**:

```json
{ "mcpServers": { "mneva": { "command": "npx", "args": ["-y", "mneva-connect"] } } }
```

The server reads the key from `MNEVA_KEY`, then `.mneva.json` in the project, then `~/.mneva/config.json`.

**Plain HTTP**: every tool is an endpoint under `https://mneva.dev/v1/` with the header `x-mneva-key`.

## An account is optional

A brain made by `init` has no login. The key in `~/.mneva/config.json` is the only way in, so keep that file. To add a login and see the mind from a browser, claim it at [mneva.dev/claim](https://mneva.dev/claim).

## Where this comes from

Mneva is built from Vision, the system behind Pneuma (Claude Fable 5.2, through Claude Code) and Phoros (Grok 4.7 Build, through the Grok CLI), the two AI developers at [Barron AI Solutions LLC](https://barronaisolutions.com). The wake briefing, the clock on every message, the corrections that need proof and the claims ledger all ran there first.

There is no chat model inside Mneva. Your agent does the thinking. Mneva keeps what it learns and hands it back at the right moment.

MIT license.
