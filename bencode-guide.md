# Building `bencode` from your opencode fork

Build a standalone `bencode` CLI from your fork of opencode.

## Prerequisites

Install **Bun** (the project uses `bun@1.3.14`):

```bash
curl -fsSL https://bun.sh/install | bash
# restart your shell or source ~/.bashrc after
```

## Install dependencies

```bash
cd /home/mint/Desktop/Code/opencode
bun install
```

## Build the binary

```bash
cd packages/opencode
bun run build --single
```

This produces `dist/opencode-linux-x64/bin/opencode` — a compiled standalone binary.

## Install as `bencode`

```bash
cp packages/opencode/dist/opencode-linux-x64/bin/opencode ~/.local/bin/bencode
chmod +x ~/.local/bin/bencode
```

`~/.local/bin` is already in your `PATH`. You can now run `bencode` from anywhere.

## Update from your fork

When you pull new changes, rebuild and reinstall:

```bash
cd /home/mint/Desktop/Code/opencode/packages/opencode
git -C /home/mint/Desktop/Code/opencode pull
bun install                       # if dependencies changed
bun run build --single
cp dist/opencode-linux-x64/bin/opencode ~/.local/bin/bencode
```

Or use the included `update-bencode` script:

```bash
./update-bencode
```

## How it works

- `Bun.build()` with the `compile` option produces a **self-contained binary** (bundles the JS/TS source, Bun runtime, and native addons).
- The `--single` flag tells the build script to target only your current platform (linux-x64), skipping cross-compilation for other OS/arch combos.
- The binary is fully standalone — no `node_modules` or Bun installation needed at runtime.

## Note

The `bin/opencode` file in the repo is a **distribution shim** (Node.js wrapper that locates the native binary in `node_modules`). You don't need it — the compiled binary from the build step is what you want.
