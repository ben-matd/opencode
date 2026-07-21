# `/full-export` Command Implementation Plan

## Goal

Add a new CLI command `opencode full-export [sessionID]` that exports session history like `/export` but includes the **full system prompt context** that the model had at each turn — the dynamically assembled system prompt sections (base prompt, environment info, instructions, MCP instructions, skills) which are **not** captured in the current `/export` output.

## What `/export` Currently Captures

- `info`: Session metadata (title, directory, model, agent, timestamps, tokens, cost, etc.)
- `messages[]`: All user/assistant messages with their parts (text, file, tool, reasoning, etc.)
- Per-user `system` field (on User message `info`) — **already included**

## What `/export` Misses (The "Full Context")

The system prompt dynamically assembled at runtime (in `prompt.ts` `runLoop()`) contains:

1. **Base agent/model prompt** — either `agent.prompt` or model-family-specific prompt template (e.g., `anthropic.txt`, `gpt.txt`, `default.txt`)
2. **Environment info** — model name, cwd, workspace root, git status, platform, date, project references
3. **Instructions** — contents of `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and config `instructions` (files + URLs)
4. **MCP instructions** — per-MCP-server tool instructions (XML block)
5. **Skills** — available skills and their descriptions

These are assembled per-turn but are **not stored** in the session — they are computed at runtime from config, filesystem, and environment state.

## Implementation

### 1. New File: `packages/opencode/src/cli/cmd/full-export.ts`

Modeled after `export.ts` but adds system prompt reconstruction.

**Reuse from `export.ts`**:
- Session selection UI (autocomplete prompt)
- `svc.get()` / `svc.messages()` for data retrieval
- JSON output format for `info` and `messages`
- Sanitization logic (redact sensitive data)

**New logic**:
- Read the session's model info from the first assistant message
- Read the agent info from session or user messages
- Reconstruct the system prompt components using available services:
  - `SystemPrompt.provider(model)` — standalone function, no service needed
  - `Agent.Service.get(name)` — get agent config (including `agent.prompt`)
  - `Instruction.Service.system()` — read AGENTS.md etc. (already in AppServices)
  - `MCP.Service.instructions()` + format as XML block (already in AppServices)
  - `Skill.Service.available(agent)` + format (already in AppServices)
  - Build environment info block manually from `InstanceState.context` + model info
- Combine all sections into the full assembled system prompt

**Output format**:

```json
{
  "info": { /* same as /export */ },
  "system": {
    "agent": { "name": "...", "hasCustomPrompt": true/false },
    "model": { "id": "...", "providerID": "..." },
    "basePrompt": "You are...",
    "environment": "Working directory: ...",
    "instructions": ["Instructions from: /path/AGENTS.md\n..."],
    "mcpInstructions": "<mcp_instructions>...</mcp_instructions>",
    "skills": "Skills provide...",
    "fullSystemPrompt": "You are...\nWorking directory:...\nInstructions from:..."
  },
  "messages": [ /* same as /export */ ]
}
```

### 2. Registration: `packages/opencode/src/index.ts`

- Add `import { FullExportCommand } from "./cli/cmd/full-export"`
- Add `.command(FullExportCommand)` to the yargs chain

### 3. Key Details

**Command definition**:
```
command: "full-export [sessionID]"
describe: "export session data as JSON with full model context including system prompts"
options:
  --sanitize: redact sensitive transcript and file data
```

**System prompt reconstruction**:
- The base prompt comes from `agent.prompt ?? SystemPrompt.provider(model)`. `SystemPrompt.provider()` is a standalone sync function — it imports text from `prompt/*.txt` files and matches by model ID pattern.
- Environment info is built from `InstanceState.context` (directory, worktree, vcs info) + model's `api.id` and current date. Project references are omitted for simplicity (they require `Reference.Service` not in AppServices).
- Instructions are fetched via `Instruction.Service.system()` which reads AGENTS.md/CLAUDE.md/CONTEXT.md from the filesystem and fetches URL-based instructions.
- MCP instructions are fetched via `MCP.Service.instructions()` and formatted as an XML `<mcp_instructions>` block.
- Skills are fetched via `Skill.Service.available(agent)` and formatted as a descriptive block.
- All sections are joined with `\n` separators to form the `fullSystemPrompt`.

**Sanitization**: Reuses the same redaction patterns as `export.ts` (the `sanitize()` function would be shared or duplicated). The `system.fullSystemPrompt` text would also be redacted.

### 4. Dependencies (All Already in `AppServices`)

| Service | Source | How Used |
|---------|--------|----------|
| `Session.Service` | app-runtime.ts | `get()`, `messages()` |
| `Agent.Service` | app-runtime.ts | `get(name)` for agent info |
| `Instruction.Service` | app-runtime.ts | `system()` for instructions |
| `MCP.Service` | app-runtime.ts | `instructions()` for MCP prompts |
| `Skill.Service` | app-runtime.ts | `available(agent)` for skills |
| `SystemPrompt.provider()` | standalone fn | Base prompt by model |

### 5. Edge Cases

- **No messages in session**: Output `system` with defaults but empty `messages`
- **Unknown agent**: Use default agent info
- **No model info**: Use a safe default (`default.txt` base prompt)
- **Empty instructions/MCP/skills**: Omit those sections from `fullSystemPrompt`
- **Agent switches mid-session**: System prompt may differ per agent — document this limitation; reconstruct from the most recent agent info

### 6. Verification

- `bun typecheck` from `packages/opencode` — ensure no type errors
- Run `opencode full-export <session-id>` and verify JSON output
- Compare output with `opencode export <session-id>` — confirm `info` and `messages` are identical format

## Future Improvements

- Persist the assembled system prompt alongside each message during the session for 100% accurate reconstruction
- Include agent-switch boundaries showing which system prompt was active per turn
