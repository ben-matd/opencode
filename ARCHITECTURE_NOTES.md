# Architecture Notes — OpenCode → Cowork transformation

Phase 0 map of the existing codebase. Every later phase references section numbers
from this document. Written before any code changes.

Repo layout is a Bun/Turbo monorepo under `packages/`. The pieces that matter for
this transformation are:

| Package | Role |
| --- | --- |
| `packages/opencode` | **v1 engine** — the actual server that ships. Agent loop, tools, prompts, LSP, MCP, permissions, HTTP API, CLI. |
| `packages/core` | **v2 engine (in-progress port)** — Effect-based services: location, project, session, tools, permissions, system-context. Partially wired; v1 imports from it via `@opencode-ai/core`. |
| `packages/app` | **Web/desktop UI** (SolidJS + Vite). Routes, pages, dialogs, contexts, i18n. This is the product surface. |
| `packages/session-ui` | Shared chat-transcript rendering: message parts, tool cards, markdown, diffs. |
| `packages/ui` | Design-system primitives (buttons, icons, theme, dialog context). |
| `packages/desktop` | Electron shell — main/preload/renderer. Spawns the engine as a sidecar and loads `packages/app`. |
| `packages/tui` | Terminal UI. **Not part of the desktop app UX**; stays in repo. |
| `packages/schema` | Shared Effect `Schema` definitions (`@opencode-ai/schema`) used by engine + UI. |
| `packages/sdk`, `packages/client` | Generated/typed HTTP clients. |

---

## 1. Agent loop and session logic

### 1.1 Where the loop lives (v1 — the one that runs)

```
packages/opencode/src/session/
  session.ts        session lifecycle (create, list, abort, revert)
  processor.ts      streams assistant output into message parts
  llm.ts, llm/      request preparation + provider call
    llm/request.ts  ← assembles the final system prompt + tool set (see §3)
  tools.ts          resolves the tool set for a given agent/model/session
  message-v2.ts     message + part schema (text, tool, reasoning, file, ...)
  compaction.ts     context compaction
  reminders.ts      injected system reminders (e.g. plan mode)
  system.ts         ← system prompt selection by model family (see §3)
```

The flow per turn:

1. `session.ts` receives a prompt (from HTTP route, see §2).
2. `SessionTools.resolve()` (`session/tools.ts`) builds `Record<string, AITool>`
   from the tool registry, MCP servers, and plugins, wrapping each with
   permission checks and part-update callbacks.
3. `session/llm/request.ts::prepare()` builds `system: string[]`, `messages`,
   `tools`, provider params, then the AI SDK `streamText` loop runs.
4. `processor.ts` writes streamed deltas into message parts; the UI observes
   those parts over SSE (§2).

### 1.2 v2 engine (`packages/core`)

Mirrors the same concepts with Effect services and is being migrated leaf by leaf:

```
packages/core/src/session/
  runner/index.ts, runner/llm.ts   loop
  execution/local.ts               local execution
  message.ts, projector.ts, store.ts
packages/core/src/tool/
  registry.ts      ToolRegistry.Service — materialize() + settle()
  builtins.ts      static list of built-in tool nodes
  bash.ts read.ts write.ts edit.ts glob.ts grep.ts apply-patch.ts
  skill.ts todowrite.ts question.ts webfetch.ts websearch.ts
packages/core/src/system-context/
  registry.ts      SystemContextRegistry — pluggable system-context entries
  builtins.ts      `core/environment` + `core/date` entries
```

`packages/core/src/tool/builtins.ts` carries a TODO listing the leaves still to
port (task, LSP, repo_clone, repo_overview, plan_exit, code mode) — confirming v1
is still the shipping path.

### 1.3 Tool registration (v1 — authoritative)

`packages/opencode/src/tool/registry.ts` is the single place where tools are
assembled. It:

- instantiates each built-in tool service (`ReadTool`, `WriteTool`, `EditTool`,
  `GlobTool`, `GrepTool`, `ShellTool` (= `bash`), `TaskTool`, `TodoWriteTool`,
  `WebFetchTool`, `WebSearchTool`, `SkillTool`, `ApplyPatchTool`, `QuestionTool`,
  `LspTool`, `PlanExitTool`, `InvalidTool`);
- appends plugin-provided tools (`fromPlugin`) and MCP tools;
- filters by agent permission ruleset and runtime flags in `tools()`.

Tool descriptions live as sibling `.txt` files (`read.txt`, `write.txt`,
`grep.txt`, …) and are imported directly — the same pattern used for prompts.
**This is the insertion point for any new document tooling** (Phase 1.3).

Notable per-tool coupling to coding:

- `tool/edit.ts`, `tool/write.ts`, `tool/apply_patch.ts` all call
  `lsp.diagnostics()` after a mutation and append a diagnostics block to the tool
  output (`edit.ts:192-205`, `write.ts:76-79`, `apply_patch.ts:265-300`).
  → Phase 1.4 gates this behind developer mode.
- `tool/lsp.ts` is already behind `flags.experimentalLspTool`
  (`registry.ts:242`).

---

## 2. How the UI talks to the agent

### 2.1 Transport

```
Electron main (packages/desktop/src/main/index.ts)
  └── spawns sidecar: the opencode server (packages/opencode `serve`)
        listens on 127.0.0.1:<random port>
  └── BrowserWindow loads packages/app (built Vite bundle)
        app talks to the sidecar over HTTP + SSE
```

- `packages/desktop/src/main/sidecar.ts` / `server.ts` — spawn + health-check the
  engine, hand the URL to the renderer.
- `packages/desktop/src/main/ipc.ts` + `src/preload/index.ts` — Electron IPC
  surface exposed to the web app as `window.api` (dialogs, onboarding state,
  store, updater, shell integration). **This is where "reveal in folder" /
  "open file" for artifact cards belongs** (Phase 2.4).
- `packages/opencode/src/server/` — Hono HTTP routes + SSE event stream.
- `packages/app/src/context/*` — Solid contexts that wrap the client:
  `sdk.tsx`, `server-sdk.tsx`, `server-sync.tsx`, `global-sync/` (event
  reducer + child stores), `permission.tsx`, `session.*`, `tabs.tsx`,
  `settings.tsx`.

Events flow engine → SSE → `context/global-sync/event-reducer.ts` → Solid stores
→ components. File-change events already flow this way, which is what makes a
**live file tree** (Phase 2.2) feasible without new plumbing.

### 2.2 UI entry points

- `packages/app/src/app.tsx` — router; two layouts exist: `pages/layout.tsx`
  (`LegacyLayout`) and `pages/layout-new.tsx` (`NewLayout`), selected by
  `settings.general.newLayoutDesigns` (default `true`,
  `context/settings.tsx:60`). New work targets **NewLayout**.
- `packages/app/src/pages/session.tsx` (2426 lines) — the main session screen.
- `packages/app/src/pages/home.tsx` — recent projects / empty state.
- `packages/app/src/pages/new-session.tsx` — new session screen.
- `packages/app/src/components/file-tree.tsx` and `file-tree-v2.tsx` —
  workspace file tree (already exists; toggled by
  `settings.general.showFileTree`, default `false`).
- `packages/desktop/src/renderer/onboarding.tsx` — `DesktopFirstLaunchOnboarding`;
  currently silent, calls `window.api.finishFirstLaunchOnboarding()` and opens a
  directory. Phase 2.1 replaces this with a real screen.

### 2.3 Tool-call rendering (critical for Phase 2.3)

`packages/session-ui/src/components/message-part.tsx` (2659 lines) is the whole
transcript renderer.

- **`getToolInfo(tool, input, metadata)` at line 469** is a `switch` over tool
  name returning `{ icon, title, subtitle }`. This is the single function that
  decides what a tool call looks like. Rewriting its cases into task language
  ("Reading Q3-report.pdf", "Creating summary.docx") is the highest-leverage
  change in Phase 2.3.
- `HIDDEN_TOOLS` (line ~617) and `CONTEXT_GROUP_TOOLS` control which calls are
  collapsed/hidden.
- `toolDefaultOpen(...)` (line ~738) decides expansion; `shellToolPartsExpanded`
  and `editToolPartsExpanded` settings feed it.
- Diff rendering: `session-ui/src/components/session-diff.ts`,
  `session-review.tsx`, and the whole `session-ui/src/pierre/` directory
  (virtualized diff viewer, line comments, selection). Plus
  `packages/app/src/pages/session/review-tab.tsx`.
  → Phase 2.3 gates these behind developer mode rather than deleting them.
- Titles come from i18n keys: `ui.tool.read`, `ui.messagePart.title.write`, etc.

---

## 3. System prompts / agent instructions

### 3.1 v1 prompt selection

`packages/opencode/src/session/system.ts`:

```ts
export function provider(model: Provider.Model) {
  // dispatches on model id → one of the prompt .txt files
}
```

Prompt files in `packages/opencode/src/session/prompt/`:
`anthropic.txt`, `default.txt`, `gpt.txt`, `beast.txt`, `codex.txt`,
`gemini.txt`, `kimi.txt`, `meta.txt`, `trinity.txt`, `plan.txt`,
`plan-mode.txt`, `plan-reminder-anthropic.txt`, `build-switch.txt`,
`copilot-gpt-5.txt`.

All of them are coding-agent prompts (software engineering tasks, git, tests).

Sub-agent prompts live in `packages/opencode/src/agent/prompt/`:
`compaction.txt`, `explore.txt`, `summary.txt`, `title.txt`, plus
`agent/generate.txt`.

### 3.2 Where the prompt is assembled

`packages/opencode/src/session/llm/request.ts::prepare()` — line 58ff:

```ts
const system = [[
  ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
  ...input.system,                       // environment, skills, mcp instructions
  ...(input.user.system ? [input.user.system] : []),
].filter(Boolean).join("\n")]
```

Two clean override points, in increasing invasiveness:

1. **`agent.prompt`** — if an agent config defines `prompt`, the model-family
   prompt is skipped entirely. Ships a Cowork agent without touching
   `system.ts`. **Preferred for Phase 1.1.**
2. `SystemPrompt.provider()` — swap the returned file per model family.

`SystemPrompt.environment()` (`system.ts:64`) injects the `<env>` block containing
`Working directory`, `Workspace root folder`, `Is directory a git repo`,
`Platform`, `Today's date`. The git line is coding-specific
→ gate in Phase 1.4. Note the v2 equivalent is
`packages/core/src/system-context/builtins.ts` (`core/environment`).

There is also a plugin hook: `experimental.chat.system.transform`
(`request.ts:66`) — lets a plugin rewrite the system array. Useful escape hatch.

### 3.3 Agent definitions

`packages/opencode/src/agent/agent.ts` defines built-in agents (`build`, `plan`,
`explore`, compaction/title/summary helpers) and merges user agents from config
(`packages/opencode/src/config/agent.ts`,
`packages/core/src/v1/config/agent.ts`). Default agent id is `build`
(`packages/core/src/agent.ts:defaultID`).

---

## 4. Permissions / approvals

### 4.1 Engine

- `packages/opencode/src/permission/index.ts` — `Permission.Service` with
  `ask()`, `reply()`, `list()`. `evaluate(permission, pattern, ...rulesets)`
  does last-match-wins wildcard resolution and defaults to `ask`.
- `packages/opencode/src/permission/evaluate.ts`, `arity.ts` — rule helpers.
- `packages/core/src/permission.ts`, `permission/saved.ts`, `permission/sql.ts` —
  v2 service + persistence of "always allow" rules.
- Schemas: `packages/schema/src/permission.ts`, `permission-v1.ts`,
  `permission-saved.ts`. A request carries `{ id, sessionID, permission,
  patterns, ... }`; the reply is `once` / `always` / `reject`.
- Rulesets come from agent config + `config.permission`
  (`packages/core/src/v1/config/permission.ts`).

Permission names in use (from the settings UI strings): `read`, `edit`, `glob`,
`grep`, `list`, `bash`, `task`, `skill`, `lsp`, `todowrite`, `webfetch`,
`websearch`, `external_directory`, `doom_loop`.
`packages/opencode/src/tool/external-directory.ts` handles access outside the
project directory — directly reusable for "writes outside the workspace"
(Phase 2.5).

### 4.2 UI

- `packages/app/src/context/permission.tsx` — pending-request store, reply
  actions.
- `packages/app/src/context/permission-auto-respond.ts` — the `autoApprove`
  setting (`settings.permissions.autoApprove`, default `false`).
- Prompts render inside the transcript / dialogs; strings under
  `settings.permissions.tool.*` in `packages/app/src/i18n/en.ts:1043-1070`.

---

## 5. Config, providers, MCP

### 5.1 Config

- `packages/opencode/src/config/config.ts` (681 lines) — loader/merger.
  Sub-modules: `agent.ts`, `command.ts`, `managed.ts`, `markdown.ts`,
  `parse.ts`, `paths.ts`, `plugin.ts`, `variable.ts`, `tui*.ts`.
- **Schema** lives in `packages/core/src/v1/config/` —
  `config.ts`, `agent.ts`, `permission.ts`, `provider.ts`, `mcp.ts`, `lsp.ts`,
  `formatter.ts`, `skills.ts`, `layout.ts`, `migrate.ts`, `attachment.ts`, …
  → **`packages/core/src/v1/config/config.ts` is where a `developerMode` flag
  belongs** (Phase 1.4).
- Runtime env flags: `packages/opencode/src/effect/runtime-flags.ts` —
  `OPENCODE_*` booleans (`experimentalLspTool`, `experimentalPlanMode`,
  `disableLspDownload`, …). Good precedent for how a flag threads through
  services; but user-facing developer mode should be config + UI setting, not an
  env var.
- UI-side settings: `packages/app/src/context/settings.tsx` — persisted
  `settings.v3` store with a typed `Settings` interface
  (`general`, `appearance`, `keybinds`, `permissions`, `notifications`,
  `sounds`). `Settings.general` at line 23 is where a UI `developerMode`
  toggle goes.

### 5.2 Providers

- `packages/opencode/src/provider/provider.ts` + `transform.ts` — provider and
  model resolution, per-provider request options.
- `packages/core/src/provider.ts`, `model.ts`, `models-dev.ts`,
  `credential/`, `auth/` — catalog + credentials.
- UI: `components/dialog-connect-provider.tsx`,
  `dialog-custom-provider.tsx`, `settings-providers.tsx`,
  `dialog-select-model.tsx`, `dialog-manage-models.tsx`.
  → Phase 2.1 reuses `dialog-connect-provider` for plain-language key setup.

### 5.3 MCP

- Engine: `packages/opencode/src/mcp/` (`index.ts`, `catalog.ts`, `auth.ts`,
  `oauth-provider.ts`, `oauth-callback.ts`, `browser.ts`).
- Config schema: `packages/core/src/config/mcp.ts` and
  `packages/core/src/v1/config/mcp.ts`.
- Server instructions are injected into the system prompt by
  `SystemPrompt.mcp()` (`session/system.ts`).
- UI: `packages/app/src/components/dialog-select-mcp.tsx`,
  `packages/app/src/context/mcp.ts`.

---

## 6. Coding-specific vs. generic

### 6.1 Coding-specific — gate behind `developerMode`, do not delete

| Area | Location |
| --- | --- |
| LSP client/servers/diagnostics | `packages/opencode/src/lsp/` (`client.ts`, `diagnostic.ts`, `language.ts`, `launch.ts`, `server.ts`), `config/lsp.ts` |
| Diagnostics appended to tool output | `tool/edit.ts:192-205`, `tool/write.ts:76-79`, `tool/apply_patch.ts:265-300` |
| `lsp` tool | `tool/lsp.ts` (already flag-gated) |
| Git / VCS | `packages/core/src/git.ts`, `project.ts` (`vcs`), `packages/opencode/src/git/`, `worktree/` |
| Git surfacing in UI | `pages/session.tsx`, `pages/layout.tsx`, `pages/layout/sidebar-workspace.tsx`, `pages/layout/sidebar-project.tsx`, `context/global-sync/*`, `components/session/session-new-view.tsx` (`session.review.noVcs.createGit.*` strings) |
| Diff / review views | `session-ui/src/pierre/**`, `session-ui/src/components/session-diff.ts`, `session-review.tsx`, `line-comment*.tsx`, `app/src/pages/session/review-tab.tsx` |
| Syntax highlighting | `session-ui/src/components/markdown-shiki.worker.ts` + `markdown-worker*` (keep for code blocks, but code blocks stop being the deliverable) |
| Terminal | `app/src/components/terminal.tsx`, `pages/session/terminal-panel*.tsx`, `packages/core/src/pty/` |
| Formatters / lint | `packages/opencode/src/format/`, `config/formatter.ts` |
| `<env>` git line | `session/system.ts:71`, `core/src/system-context/builtins.ts:21` |
| Code mode | `tool/code-mode.ts` (behind `experimentalCodeMode`) |
| Coding prompts | `session/prompt/*.txt` |
| TUI | `packages/tui/**`, `packages/opencode/src/cli/tui/`, `cli/cmd/tui.ts` |

### 6.2 Generic agent infrastructure — keep as is

Agent loop, session store/history, message parts, provider + credential layer,
tool registry mechanics, permission engine, MCP, plugins, skills, event bus/SSE,
config loading, file watcher, snapshots, `read`/`write`/`edit`/`glob`/`grep`/
`bash`/`webfetch`/`websearch`/`todowrite`/`task`/`question`/`skill` tools,
markdown rendering, file tree, tabs, notifications, updater.

---

## 7. Naming: "project" / "repo" in the user-facing layer

The rename target (Phase 1.2) is concentrated, which is good news:

- **`packages/app/src/i18n/en.ts`** (~1080 keys) holds essentially all UI copy.
  `project` appears in: `command.category.project`, `command.project.*`,
  `dialog.project.edit.*`, `home.recentProjects`, `home.projects`,
  `home.project.add`, `home.empty.*`, `session.new.project.*`,
  `sidebar.project.*`, `sidebar.nav.projectsAndSessions`, `toast.project.*`,
  `notification.*.description`, `prompt.example.*`, `session.header.search.*`,
  `settings.permissions.tool.external_directory.description`.
  16 sibling locale files mirror it.
- `packages/desktop/src/renderer/i18n/*.ts` — small (27 lines), desktop-shell copy.
- A `workspace` vocabulary **already exists** in the codebase
  (`command.category.workspace`, `pages/layout/sidebar-workspace.tsx`,
  `components/prompt-workspace-selector.tsx`, `packages/core/src/workspace.ts`,
  `experimentalWorkspaces` flag) but there it means *git worktree*. Phase 1.2
  must resolve that collision: user-facing "workspace" = the folder; the git
  worktree concept moves behind developer mode.
- Internal identifiers (`Project.Service`, `projectID`, DB columns, HTTP routes)
  stay as-is — the goal is user-facing text only.

---

## 8. Branding / packaging

- `packages/desktop/electron-builder.config.ts` — `productName: "OpenCode"`,
  per-channel app ids, `protocols.schemes: ["opencode"]`, mac dmg `name`.
- `packages/desktop/package.json` — `"name": "@opencode-ai/desktop"`, build
  `name: "OpenCode"`.
- `packages/desktop/icons/`, `packages/desktop/resources/` — app icons.
- `packages/ui/src/logo*` — in-app logo/splash (`Splash` used in `app.tsx`).
- Root `package.json` description: "AI-powered development tool".
- CLI/TUI entry points to keep out of the desktop UX:
  `packages/opencode/src/cli/cmd/tui.ts`, `packages/app/src/components/terminal.tsx`,
  `pages/session/terminal-panel*.tsx`, and the `command.terminal.*` /
  `command.category.terminal` i18n keys.

---

## 9. Build / verification commands

```
bun --cwd packages/app run typecheck        # UI typecheck   (baseline: passes)
bun --cwd packages/desktop run typecheck    # electron typecheck
bun --cwd packages/desktop run build        # electron-vite build
bun turbo typecheck                         # everything
bun run lint                                # oxlint
bun run dev:desktop                         # run the desktop app
```

Per the working rules, the app must build after every phase; `typecheck` on
`app` + `desktop` plus `oxlint` is the fast gate, `bun turbo typecheck` the
thorough one.

---

## 10. Plan-to-location map

| Phase | Primary files |
| --- | --- |
| 1.1 system prompt | new `packages/opencode/src/session/prompt/cowork.txt`; `session/system.ts`; or agent `prompt` in `agent/agent.ts` (§3.2) |
| 1.2 project→workspace | `packages/app/src/i18n/*.ts`, `packages/desktop/src/renderer/i18n/*.ts` (§7) |
| 1.3 document tooling | `packages/opencode/src/tool/registry.ts` + new tool + `.txt` description (§1.3) |
| 1.4 developerMode | `packages/core/src/v1/config/config.ts`, `runtime-flags.ts`, `tool/edit.ts`/`write.ts`/`apply_patch.ts`, `session/system.ts` (§5.1, §6.1) |
| 2.1 onboarding | `packages/desktop/src/renderer/onboarding.tsx`, `main/onboarding.ts`, `main/ipc.ts`, `components/dialog-connect-provider.tsx` (§2.2) |
| 2.2 layout + file tree | `pages/layout-new.tsx`, `pages/session.tsx`, `components/file-tree-v2.tsx` (§2.2) |
| 2.3 activity cards | `session-ui/src/components/message-part.tsx::getToolInfo` (§2.3) |
| 2.4 artifact previews | `message-part.tsx`, `session-ui/src/components/file*.tsx`, desktop IPC for open/reveal (§2.1) |
| 2.5 permissions UI | `app/src/context/permission.tsx`, `permission-auto-respond.ts`, engine defaults in config permission ruleset (§4) |
| 2.6 tasks/templates | `pages/new-session.tsx`, `pages/home.tsx`, `components/prompt-input*` |
| 2.7 rebrand | §8 |
| 3 polish | `pages/home.tsx` (history), `pages/error-description.ts`, `README.md` |
