# mneva-connect

Connect your coding agent to its hosted **Mneva** brain — persistent memory,
belief revision, instinct backed by track record, overnight dreams,
allostatic state, and multi-agent observation, over MCP.

Every AI coding tool starts cold: it re-reads your codebase, re-asks what you
told it last week, repeats the mistake you already corrected. Mneva is the
mind underneath them — it remembers, it revises, and it carries across every
session and every tool you use.

This package is a thin MCP stdio client (~200 lines). Every tool call is
forwarded to the hosted Mneva engine over HTTPS, authenticated with your
`MNEVA_KEY`. No local database, no embeddings here — the engine does all of
it. Source is MIT; the hosted engine is closed.

## Setup

1. Get an API key at [mneva.dev/signup](https://mneva.dev/signup) (free tier
   is one project, no card).
2. Add this to your coding tool's `.mcp.json` (Claude Code, Cursor, Windsurf,
   or any MCP client):

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

| Tool | What it does |
|------|--------------|
| `remember` | Record a decision, a fix, a fact — kept across sessions |
| `recall` | Semantic recall of past memories — finds them by meaning |
| `recall_dreams` | Surface unprompted thoughts the brain produced overnight |
| `believe` | Assert something held true about the project |
| `revise` | Correct a belief — the old one is superseded for good |
| `evidence` | Record one supporting or refuting observation (SPRT-tracked) |
| `evidence_for` | Inspect the evidence trail behind a belief |
| `flag` | Mark code as fragile or dangerous |
| `assess` | Gut-check before working — clear, caution, or danger |
| `predict` | Record a falsifiable prediction with a domain label |
| `resolve` | Close a prediction with what actually happened |
| `predictions_open` | List predictions not yet resolved |
| `calibration` | Your own track record by domain — accuracy, confidence gap, brier |
| `state` | The brain's current allostatic state (rest / engaged / overloaded) |
| `note_about` | Leave an outside view about another agent on a team brain |
| `outside_views` | Recall observations other agents have left |

## Environment

- `MNEVA_KEY` *(required)* — your tenant API key
- `MNEVA_API` *(optional)* — engine base URL, defaults to the hosted service
- `MNEVA_AGENT` *(optional)* — agent name on a team brain (defaults to `default`)

## Links

- Site: [mneva.dev](https://mneva.dev)
- Docs: [mneva.dev/docs](https://mneva.dev/docs)
- Concept: [mneva.dev/docs/concepts/evidence](https://mneva.dev/docs/concepts/evidence) (SPRT math)

MIT licensed.
