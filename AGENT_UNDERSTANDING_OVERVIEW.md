# Agent Understanding Overview: How Coding Agents Perceive the OpenCode Codebase

## Summary

When a coding agent (like opencode itself) is asked to work on the opencode codebase, it builds an understanding from three tiers of source material. This document explains what agents currently understand, where their understanding is strong, and where it breaks down.

---

## Tier 1: What Agents Read First (The Executive Summary)

Agents that read `AGENTS.md`, `Architecture.md`, and `CONTEXT.md` at the repo root get a **solid high-level picture**:

- **AGENTS.md** (161 lines) — Branch/PR conventions, code style (imports, destructuring, control flow, Effect patterns), testing rules, V2 session core principles. This is the agent's primary behavioral guide.
- **Architecture.md** (170 lines) — Tech stack, monorepo package map (Schema → Protocol → Server layered architecture with Core and LLM adjacent), 8 key architectural patterns, entry points, plugin system overview, testing approach.
- **CONTEXT.md** (225 lines) — Domain vocabulary defining ~40 precise terms (System Context, Context Epoch, Session Drain, Mid-Conversation System Message, etc.) plus client contract architecture rules. This is critical because these terms pervade the source code and are non-obvious.

**What they understand:** The overall purpose, tech stack, package dependency direction, major domain concepts, coding style expected, and how to submit changes.

**What's missing:** Actual code structure navigation (where to find specific logic), migration status, deprecated areas.

---

## Tier 2: Package-Specific AGENTS.md Files (Deep Dives per Package)

The codebase has **15+ AGENTS.md files** scattered across packages. The most important ones:

| Package | File | Key Content for Agents |
|---------|------|----------------------|
| `schema/` | `AGENTS.md` | Schema boundary rules, V1 vs V2 naming conventions, event classification, ID patterns |
| `llm/` | `AGENTS.md` (321 lines) | Effect conventions in LLM context, 4-axis route system (Protocol/Endpoint/Auth/Framing), provider facades, recording tests |
| `core/tool/` | `AGENTS.md` | Tool architecture: `Tool.make`, registration scoping, permissions, output bounding |
| `opencode/` | `AGENTS.md` | Database guide, dev server setup, module shape rules, Effect runtime patterns |
| `codemode/` | `AGENTS.md` | CodeMode execution boundaries |
| `desktop/` | `AGENTS.md` | Electron IPC conventions |

**What they understand:** Deep domain-specific patterns unique to each package that are not obvious from source code alone (e.g., the 4-axis route decomposition in LLM, or how to properly define schemas without importing databases).

**Problem:** These are hard to discover. An agent that doesn't explicitly glob for `**/AGENTS.md` will miss critical per-package guidance. There is no index or cross-reference.

---

## Tier 3: Source Code Structure (What Agents Actually Navigate)

### Easy to Navigate

- **`packages/schema/src/`** (61 files) — All data contracts in one place. Schema-first means agents can quickly find the shape of any domain object.
- **`packages/core/src/`** (82 entries) — Domain logic organized by module: `session/`, `tool/`, `agent/`, `config/`, `plugin/`, `permission/`, `event.ts`, `database/`, `filesystem/`, `observability/`, `system-context/`.
- **Specs directory** (`specs/v2/*`) — Contains design docs with rationale for every V2 subsystem.
- **`.opencode/` directory** — Config, commands, tools, agents, skills for the opencode project itself.

### Hard to Navigate

1. **V2 vs V1 migration is opaque** — The migration is mid-flight. Logic is split between `packages/core/src/` (new V2 services) and `packages/opencode/src/` (legacy orchestration). An agent must infer from file names and imports which is which. There is no single migration status document.
2. **No dependency diagram** — The layered diagram in Architecture.md is conceptual. The actual `import` graph is complex; agents discover circular dependency risks only by reading imports across many files.
3. **Config schema is external** — Architecture.md mentions "~60+ properties in Config.Info" but the JSON schema lives at `https://opencode.ai/config.json` (external). No local reference file exists.
4. **Dual LLM runtime** — The session layer decides per-request to use Vercel AI SDK or native route system. This bifurcation is invisible from any single file and requires reading across `packages/opencode/src/session/llm` and `packages/llm/src/`.
5. **Plugin system has multiple generations** — Legacy in `packages/core/src/plugin/`, V2 design in `packages/plugin/src/v2/`, future plan in `PLAN.md`. Easy to confuse which is active.
6. **Effect v4 beta APIs** — The codebase uses Effect v4 beta APIs (`Effect.forkIn(scope)` instead of `Effect.fork`, `Schema.TaggedErrorClass`, etc.). The `.opencode/skills/effect/SKILL.md` tells agents to clone `effect-smol` for reference, a heavy prerequisite that agents may skip.

---

## Key Pain Points for Agent Understanding

### 1. Scattered Domain Logic Between Two Packages
The `core` package holds new V2 services; the `opencode` package holds legacy orchestration (sessions, tools, LLM). An agent working on sessions must check both `packages/core/src/session/` and `packages/opencode/src/session/` — often 10+ files across two packages — to understand the full picture.

### 2. No Single V2 Migration Map
Status of each V2 migration slice is distributed across `specs/v2/todo.md`, `specs/v2/session.md` (with its "Runtime Context Parity" table tracking 24 behaviors), `specs/v2/schema-changelog.md`, and `specs/v2/instructions.md`. An agent would need to read all four to know what's done and what's pending.

### 3. 15+ Disconnected AGENTS.md Files
Each package has its own AGENTS.md with critical conventions, but there is no central index or table of contents. An agent that does not search broadly will miss important rules (like schema naming conventions or LLM route patterns).

### 4. Legacy Code Not Explicitly Marked
Files in `packages/opencode/src/` that are being replaced by V2 equivalents are not consistently marked `@deprecated`. Agents may waste time modifying code slated for removal.

### 5. Architecture Decision Rationale Is Absent
Specs describe what was chosen but rarely why alternatives were rejected. Agents may suggest changes that were already considered and dismissed, requiring senior developer review to catch.

### 6. No Package Entry Point Guidance
For a 32-package monorepo, there is no per-package "how to navigate this source" documentation. Agents typically start reading from `src/index.ts` or `src/main.ts`, but this varies per package and isn't documented.

---

## What Agents Understand Well

- **Code style** — AGENTS.md gives very specific, opinionated rules (no destructuring, no else, prefer ternaries, inline single-use values, etc.)
- **Architecture layering** — Schema → Protocol → Server direction is clear and enforced by package.json dependency direction
- **Domain vocabulary** — CONTEXT.md provides precise shared terms, reducing ambiguity in agent-human communication
- **Testing approach** — No mocks, test actual implementation, run from package directories
- **Data contracts** — Schema-first with Effect Schema means agents can find and understand any data shape quickly

---

## Recommendations for Improvement

1. **Create a V2 Migration Status Dashboard** (`MIGRATION_STATUS.md` at root) — A single file with a table per domain area (session, config, tools, plugins, LLM, storage) and per-slice status: DONE / IN-PROGRESS / NOT-STARTED / DEPRECATED

2. **Add `@deprecated` JSDoc tags** to all legacy code in `packages/opencode/src/` that has a V2 replacement

3. **Add `@opencode-migration-target` JSDoc tags** pointing from legacy code to its V2 equivalent file

4. **Create a central AGENTS_INDEX.md** at root referencing all 15+ package-level AGENTS.md files with one-line summaries

5. **Add architecture decision records (ADRs)** in `specs/adr/` for key decisions, explicitly noting rejected alternatives

6. **Move the config JSON schema into the repo** or add a script to download it locally for agent reference

7. **Add a per-package README.md** or "Entry Points" section in each package's AGENTS.md explaining the key files to read first

8. **Mark CLI commands that are V2-ready** in the opencode package's command routing code, with a comment header explaining migration status

9. **Consolidate plugin documentation** into one location with clear "Legacy" vs "V2" vs "Planned" sections
