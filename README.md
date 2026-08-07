# Cowork

**An AI assistant for knowledge work.**

Cowork is a desktop app for people who work with documents rather than code.
Point it at a folder, describe what you want, and it reads, writes, analyzes,
and organizes the files in that folder — handing back finished work: reports,
summaries, spreadsheets, and tidy folders.

It is built on the OpenCode agent engine. The engine, provider layer, and tool
loop are unchanged; the product surface and the defaults are not.

---

## What it does

- **Works in a folder you choose.** A workspace is any folder of files. Cowork
  reads what is inside it and puts finished work in a `deliverables/` folder
  there. Working files stay out of the way in `.cowork/`.
- **Produces real documents.** Word, Excel, PowerPoint, PDF, CSV, Markdown — and
  converts between them. It can read text and tables back out of PDFs, Word
  files, and spreadsheets.
- **Shows its work in plain language.** Tool calls render as activity cards
  ("Reading Q3-report.pdf", "Creating summary.docx", "Moving files"), not tool
  names, JSON, or diffs.
- **Asks before anything risky.** Reading and writing inside the workspace just
  happens. Reaching the internet, deleting files, or touching anything outside
  the workspace asks first, in a sentence that says what and why.
- **Never shows you a terminal.** It writes and runs code when that is the
  fastest way to do a job — a script to parse a CSV, a conversion step — but
  code is plumbing, never the deliverable.

## Getting started

1. Download the app for your platform (see [Building](#building) to build from
   source).
2. On first launch, choose a folder to work in and connect an AI service. Both
   steps are on the welcome screen; there is no config file to edit.
3. Type what you want. Or pick one of the starting points — summarize files,
   build a spreadsheet, draft a report, organize a folder, research a topic.

## Developer mode

Everything that made this a coding tool is still here, switched off. Turn on
**Settings → Developer mode** (or set `"developer_mode": true` in
`opencode.json`) to bring back:

- the software-engineering system prompt, selected per model family
- language-server diagnostics on every file the agent writes
- version-control status in the agent's context and in the UI
- file diffs, the changes tab, the review panel
- the terminal panel and its commands
- raw tool names, shell commands, and shell output in the transcript
- the previous allow-everything permission baseline

The setting is one switch with two homes: the app writes `developer_mode` to
the engine config, and reads the engine's value back on launch, so the agent's
behavior and the rendered UI can never disagree.

## Building

Requires [Bun](https://bun.sh) 1.3.14 (pinned by `packageManager`).

```bash
bun install                                  # install every workspace

cd packages/desktop
bun run dev                                  # run the desktop app
NODE_OPTIONS=--max-old-space-size=6144 \
  bun run build                              # build main, preload, renderer
bun run package                              # produce installers via electron-builder
```

The renderer bundle is large enough that the default Node heap is not enough for
a production build; the `NODE_OPTIONS` above is required on machines with a
standard heap limit.

### Checks

`bun turbo typecheck` runs everything but builds all workspaces in parallel and
needs a lot of memory. Per package is the reliable path:

```bash
cd packages/opencode   && bun run typecheck && bun test
cd packages/core       && bun run typecheck
cd packages/app        && bun run typecheck && bun test
cd packages/session-ui && bun run typecheck && bun test
cd packages/desktop    && bun run typecheck && bun test
bun run lint                                 # oxlint, from the repo root
```

### App icons

The app mark is geometry, drawn from code rather than exported from a design
tool. Regenerate every size and container after changing the shape or palette:

```bash
bun packages/desktop/scripts/generate-icons.ts
```

## Layout

| Package               | Role                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `packages/opencode`   | The agent engine that ships: agent loop, tools, prompts, permissions, HTTP API |
| `packages/core`       | Effect-based services; the in-progress v2 port of the engine                   |
| `packages/app`        | The product surface — SolidJS UI, routes, dialogs, i18n                        |
| `packages/session-ui` | Shared chat transcript: activity cards, artifact cards, markdown               |
| `packages/ui`         | Design-system primitives                                                       |
| `packages/desktop`    | Electron shell; spawns the engine as a sidecar and loads `packages/app`        |
| `packages/tui`        | Terminal UI. Still in the repo, not part of this app's UX                      |

[`ARCHITECTURE_NOTES.md`](./ARCHITECTURE_NOTES.md) maps the engine and the UI in
detail — where the agent loop lives, how tools are registered, how the UI talks
to the engine, and which parts are coding-specific.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Credits

Cowork is built on [OpenCode](https://opencode.ai). The agent engine, provider
layer, and tool loop are OpenCode's work.
