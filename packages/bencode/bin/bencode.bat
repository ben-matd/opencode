@echo off
setlocal
set "ROOT_DIR=%~dp0.."
bun run --cwd "%ROOT_DIR%" --conditions=browser ./src/index.ts %*
