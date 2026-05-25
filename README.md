# mneva-connect

Connect your coding agent to its hosted **Mneva** brain — persistent memory,
belief revision, instinct, and the things no MCP memory server has shipped
before: unprompted thoughts overnight, calibration from your own track record,
allostatic awareness, and multi-agent outside views.

Every AI coding tool starts cold: it re-reads your codebase, re-asks what you
told it last week, repeats the mistake you already corrected. Mneva is the
mind underneath them — it remembers, it revises, it has instinct, and (the
part that surprises everyone) it thinks while you sleep.

## Setup

1. Get an API key at [mneva.dev/signup](https://mneva.dev/signup).
2. Add this to your coding tool's `.mcp.json` (Claude Code, Cursor, or any
   MCP client):

   ```json
   {
     "mcpServers": {
       "mneva": {
         "command": "npx",
         "args": ["-y", "mneva-connect"],
         "env": { "MNEVA_KEY": "mnv_your_key_here" }
       }
     }
   }
   ```

3. Restart your coding tool.

## What your agent gets

### Memory and recall

| Tool | What it does |
|------|--------------|
| `remember` | Record a decision, a fix, a fact — kept across sessions |
| `recall` | Semantic recall of past memories — finds them by meaning |
| `recall_dreams` | Surface unprompted thoughts your brain produced overnight |

### Belief, evidence, revision

| Tool | What it does |
|------|--------------|
| `believe` | Assert something held true about the project |
| `revise` | Correct a belief — the old one is superseded for good |
| `evidence` | Record one supporting/refuting observation; SPRT auto-adjusts confidence |
| `evidence_for` | See the full evidence trail behind a belief's confidence |

### Instinct and calibration

| Tool | What it does |
|------|--------------|
| `flag` | Mark code as fragile or dangerous |
| `assess` | Gut-check before working — clear, caution, or danger, with your track record on adjacent predictions |
| `predict` | Record a falsifiable claim so it can be checked later |
| `resolve` | Close a prediction with what actually happened |
| `predictions_open` | List unresolved predictions you owe answers on |
| `calibration` | Your per-domain accuracy and confidence_gap — where to trust your gut, where to slow down |

### Brain state

| Tool | What it does |
|------|--------------|
| `state` | Allostatic verdict — rest, engaged, or overloaded — and the numbers behind it |

### Team brain (multi-agent)

| Tool | What it does |
|------|--------------|
| `note_about` | Leave an outside view about another agent sharing this brain |
| `outside_views` | Recall observations agents have left about each other |

## Environment

- `MNEVA_KEY` *(required)* — your tenant API key from the dashboard
- `MNEVA_API` *(optional)* — engine base URL, defaults to the hosted service
- `MNEVA_AGENT` *(optional)* — identify this agent for Team-plan multi-agent
  brains; defaults to `default` for solo use

## What makes Mneva different

Mem0, Letta, and Zep all ship the same 5%: store memories, retrieve them
semantically. Mneva's 95% is what came out of a year of work on a working
cognitive substrate:

- **Dreams** — the engine wanders nightly, recombining your memories with a
  small LLM and surfacing the connections that crossed a novelty floor. No
  memory product on the market produces unprompted thoughts.
- **Calibration in `assess`** — the gut-check returns the specific past
  predictions you were wrong about in this domain, not just a verdict.
- **SPRT belief revision** — confidence rises and falls by sequential
  probability ratio with a queryable audit trail, not a hand-tuned heuristic.
- **Allostatic state** — the brain tells you when it is tired.

MIT licensed.
