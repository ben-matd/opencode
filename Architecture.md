# OpenCode Architecture

## Overview

OpenCode is an open-source AI-powered coding agent that runs in the terminal (TUI), as a desktop app (Electron), as a web app, or headlessly as a server. It provides AI-assisted development workflows including code generation, editing, file operations, shell execution, and multi-agent conversations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict, ESM) |
| Runtime | Bun (primary), Node.js (secondary) |
| Effect System | Effect (v4 beta) |
| UI (Terminal) | OpenTUI + Solid.js |
| UI (Web/Desktop) | Solid.js + Tailwind CSS + Vite |
| Desktop | Electron + electron-vite |
| Database | SQLite (Drizzle ORM + Effect SQL) |
| AI SDK | Vercel AI SDK + `@opencode-ai/llm` (native route system) |
| API | Hono + `effect/unstable/httpapi` |
| Monorepo | Turborepo + Bun workspaces |
| Linting | Oxlint |
| Testing | Bun test, Playwright (e2e) |
| Infra | SST (Ion v4) on Cloudflare + AWS |

## Directory Structure

```
opencode/
  packages/            Monorepo workspaces (32 packages)
    schema/            Pure data contracts (Effect Schema)
    protocol/          HTTP API protocol definitions
    server/            HTTP server implementation (Hono)
    client/            Auto-generated HTTP client
    llm/               Provider-agnostic LLM routing framework
    core/              Domain logic (sessions, tools, agents, config, etc.)
    opencode/          CLI entry point + composition root
    tui/               Terminal UI (OpenTUI + Solid.js)
    app/               Web/Desktop UI (Solid.js + Vite)
    desktop/           Electron shell
    ui/                Shared UI component library
    plugin/            Plugin SDK
    sdk/               Legacy JavaScript SDK
    sdk-next/          Next-generation SDK
    codemode/          Structured code editing mode
  infra/               SST infrastructure definitions
  specs/               Architecture design documents
```

## Layered Package Architecture

Packages have strict dependency direction. No circular dependencies between layers:

```
Schema ← Protocol ← Server
   ↑                     ↑
   ├── Client ───────────┘
   │
LLM (native provider routes)
   │
Core (domain logic, database, agents, tools, sessions)
   │
Opencode (CLI entry point — composition root)
   │
   ├── TUI (terminal UI)
   ├── App (web/desktop UI)
   ├── Desktop (Electron shell)
   └── ... (other UI/app packages)
```

### Bottom-Up Description

**`@opencode-ai/schema`** — Pure Effect Schema data contracts used across all packages (wire format, storage format). Browser-safe, no runtime side effects. Defines canonical models: `Session`, `Message`, `Event`, `Permission`, `Provider`, `Agent`, `Tool`, `Question`, `FileDiff`, `Plugin`, `Skill`, etc.

**`@opencode-ai/protocol`** — HTTP API protocol specification using `effect/unstable/httpapi`. Defines endpoints, middleware, and error types for the server API.

**`@opencode-ai/server`** — Hono-based HTTP server implementation. Routes compose service layers via Effect `Layer`.

**`@opencode-ai/client`** — Auto-generated HTTP client from the protocol spec. Two variants: plain TypeScript and Effect-native.

**`@opencode-ai/llm`** — Provider-agnostic LLM routing framework. Uses composable **4-axis routes**: `Protocol` (semantic API contract), `Endpoint` (URL construction), `Auth` (per-request auth), `Framing` (byte-to-frame parsing: SSE, AWS event-stream). Supports 20+ providers. Dual runtime: Vercel AI SDK or native route pipeline.

**`@opencode-ai/core`** — The heart of the application. Domain services organized by module:
- **`session/`** — Session V2 lifecycle: creation, execution, history, compaction, run-coordinator, prompt management, event-sourced projections, todo tracking, session runner (LLM interaction loop, model selection, tool execution)
- **`tool/`** — Built-in tool definitions: bash, glob, grep, read, write, edit, websearch, webfetch, skill, question, patch, todo-write, registry
- **`agent/`** — Agent definitions, selection, info management
- **`project/`** — Project resolution, VCS integration, copy strategies
- **`config/`** — Configuration system: agent, provider, plugin, MCP, LSP, formatter, compaction, experimental features, etc.
- **`plugin/`** — Plugin host, commands, providers, skills, variants
- **`permission/`** — Permission system with saved rules, SQL persistence
- **`event.ts`** — EventV2: durable event-sourcing with publish/subscribe, sequence tracking, projectors
- **`database/`** — SQLite layer via Drizzle ORM, migrations
- **`filesystem/`** — File operations, ignore patterns, protected paths, file watcher
- **`observability/`** — OpenTelemetry, structured logging
- **`state.ts`** — Replayable state management with transforms, batch updates, scoped lifecycle

**`@opencode-ai/opencode`** — The **composition root**. Wires together all services from lower-level packages. Entry points:
- `src/index.ts` — CLI via `yargs`, routes to commands (run, serve, tui, agent, providers, models, mcp, session, github, etc.)
- `src/server/` — HTTP server, WebSocket support, mDNS discovery, auth
- `src/session/` — Session orchestration: LLM service, message management, tool management, retry, revert, compaction
- `src/tool/` — Tool definitions with rich metadata (40+ files)
- `src/mcp/` — Model Context Protocol: browser, catalog, auth
- `src/plugin/` — Provider-specific plugin loading
- `src/effect/` — Effect runtime: instance refs, state management, config service, bootstrap

## Communication Patterns

1. **Effect System** — Primary mechanism. Services are `Context.Service` wired via `Layer`. Dependencies injected through `Effect.gen(function*() { ... })`.

2. **HTTP API** — External communication via Hono REST API. Type-safe with `effect/unstable/httpapi`.

3. **EventV2** — Durable event sourcing with SQLite persistence. Events tracked by sequence per aggregate. Enables projectors that rebuild state from event streams.

4. **GlobalBus** — Lightweight in-process event bus for the opencode package (TUI/server local communication).

5. **IPC** — Electron main/renderer communication via `contextBridge`/`ipcRenderer`.

6. **WebSockets** — Real-time event streaming from server to clients.

7. **Plugins** — Communicate via a defined host interface (system prompts, chat transforms, tool execution, provider config).

## Configuration

- **Format**: JSONC (JSON with comments)
- **Locations**: Project root (`.opencode/config.jsonc`), user home
- **Schema**: `Config.Info` in `packages/core/src/config.ts` — ~60+ properties
- **Sub-configs**: Agent, provider, plugin, MCP, LSP, formatter, compaction, reference, experimental, watcher, etc.
- **Parsing**: `packages/opencode/src/config/parse.ts`

## Plugin System

- **SDK** at `packages/plugin/` defines plugin interfaces: `Tool`, `Shell`, `TUI`, `Example`, `Workspace`
- **Host** at `packages/core/src/plugin/host.ts` manages lifecycle
- **Loading** at `packages/opencode/src/plugin/`
- **Hooks**: System prompt transforms, chat transforms, tool execution
- **MCP**: Model Context Protocol for external tool integration

## Key Architectural Patterns

1. **Effect as Composition Glue** — Dependency injection, error handling, concurrency, streaming all via Effect. No framework-level DI container.

2. **Schema-First Contracts** — All data structures defined with Effect Schema, ensuring type safety across package boundaries and automatic serialization.

3. **Event Sourcing** — Durable events with sequence tracking per aggregate. Session history, compaction, and cross-process communication built on EventV2.

4. **Location-Scoped Services** — `LocationServiceMap` provides per-directory/per-workspace service instances. Each open project gets scoped state via `InstanceState` + `ScopedCache`, cleaned up on disposal.

5. **Dual LLM Runtime** — Supports both Vercel AI SDK and native route system. Session layer decides per-request which to use.

6. **Namespace Module Pattern** — Each module exports as `export * as Foo from "./foo"`. Consumers import `import { Foo } from "@/foo/foo"`. No barrel files in multi-sibling directories (prevents tree-shaking issues).

7. **Platform Abstraction** — Conditional `#imports` in package.json for Bun vs Node implementations (SQLite, PTY, filesystem).

8. **State Management** — `State` provides replayable transforms with batch updates. Domain state (agents, providers, config) is transformable, enabling plugins to modify through scoped transforms.

## Entry Points

| Command | Behavior |
|---------|----------|
| `opencode run` | Interactive/non-interactive session. Parses input, boots Effect runtime, streams LLM events. |
| `opencode serve` | Headless HTTP server. Loads project per-request by header. Full HTTP API + WebSocket. |
| `opencode tui` | Terminal UI. Local in-process server. OpenTUI + Solid.js rendering. |
| `opencode mcp` | Model Context Protocol server. |

## Testing

- **Framework**: Bun test (Jest/Vitest compatible)
- **Unit tests**: Co-located in `packages/*/test/`
- **LLM tests**: Cassette-based HTTP recording/replay (`packages/llm/test/recorded-test.ts`)
- **E2E**: Playwright (`packages/app/`)
- **Principles**: Avoid mocks, test actual implementations; tests run from package directories; prefer fixtures over live APIs
