import { Effect } from "effect"
import type { Config } from "./config"

/**
 * Coding-oriented behavior is off by default — this is a knowledge-work app and
 * language-server errors, version-control status, and diff views are noise to
 * someone writing a report. Setting `developer_mode: true` in config turns all
 * of it back on. The code paths stay intact either way.
 *
 * Takes the already-acquired Config service rather than yielding it, so callers
 * inside a tool's `execute` (which must have no service requirements) can use it.
 */
export const developerMode = (config: Config.Interface) =>
  Effect.map(config.get(), (info) => info.developer_mode ?? false)
