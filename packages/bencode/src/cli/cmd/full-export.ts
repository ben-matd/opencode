import { Session } from "@/session/session"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionID } from "../../session/schema"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { EOL } from "os"
import { Effect } from "effect"
import { SystemPrompt } from "@/session/system"
import { Instruction } from "@/session/instruction"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { MCP } from "@/mcp"
import { Skill } from "@/skill"
import { Permission } from "@/permission"
import { InstanceState } from "@/effect/instance-state"
import { sanitize as sanitizeExport } from "./export"

function redact(kind: string, id: string, value: string) {
  return value.trim() ? `[redacted:${kind}:${id}]` : value
}

function sanitizeSystem(system: FullSystem, sessionID: string): FullSystem {
  return {
    ...system,
    basePrompt: redact("system-base-prompt", sessionID, system.basePrompt),
    environment: redact("system-environment", sessionID, system.environment),
    instructions: system.instructions.map((i) => redact("system-instruction", sessionID, i)),
    mcpInstructions: system.mcpInstructions ? redact("system-mcp", sessionID, system.mcpInstructions) : null,
    skills: system.skills ? redact("system-skills", sessionID, system.skills) : null,
    fullSystemPrompt: redact("system-full", sessionID, system.fullSystemPrompt),
  }
}

interface FullSystem {
  agent: { name: string; prompt: string | null }
  model: { id: string | null; providerID: string | null }
  basePrompt: string
  environment: string
  instructions: string[]
  mcpInstructions: string | null
  skills: string | null
  fullSystemPrompt: string
}

interface FullExportData {
  info: Session.Info
  system: FullSystem
  messages: SessionV1.WithParts[]
}

function sanitize(data: FullExportData): FullExportData {
  const base = sanitizeExport({ info: data.info, messages: data.messages })
  return {
    info: base.info as FullExportData["info"],
    system: sanitizeSystem(data.system, data.info.id),
    messages: base.messages as FullExportData["messages"],
  }
}

const reconstructSystem = (session: Session.Info, messages: SessionV1.WithParts[]) =>
  Effect.gen(function* () {
    const agentName = session.agent ?? messages.find((m): m is SessionV1.WithParts & { info: SessionV1.User } => m.info.role === "user")?.info.agent ?? "default"

    const firstUser = messages.find((m): m is SessionV1.WithParts & { info: SessionV1.User } => m.info.role === "user")
    const modelID = session.model?.id ?? firstUser?.info.model.modelID
    const providerID = session.model?.providerID ?? firstUser?.info.model.providerID

    const agentSvc = yield* Agent.Service
    const agentInfo = yield* agentSvc.get(agentName).pipe(Effect.catch(() => agentSvc.defaultInfo()))

    const modelLike = { api: { id: modelID ?? "unknown" } } as Provider.Model
    const basePromptStrings = agentInfo.prompt ? [agentInfo.prompt] : SystemPrompt.provider(modelLike)
    const basePrompt = basePromptStrings.join("\n")

    const ctx = yield* InstanceState.context
    const env = [
      `You are powered by the model named ${modelID ?? "unknown"}. The exact model ID is ${providerID ?? "unknown"}/${modelID ?? "unknown"}`,
      `Here is some useful information about the environment you are running in:`,
      `<env>`,
      `  Working directory: ${session.directory}`,
      `  Workspace root folder: ${ctx.worktree}`,
      `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
      `  Platform: ${process.platform}`,
      `  Today's date: ${new Date().toDateString()}`,
      `</env>`,
    ].join("\n")

    const instructionSvc = yield* Instruction.Service
    const instructions = yield* instructionSvc.system().pipe(Effect.orDie)

    const mcpSvc = yield* MCP.Service
    const mcpInstructionsData = yield* mcpSvc.instructions()
    const ruleset = Permission.merge(agentInfo.permission, session.permission ?? [])
    const filteredMcp = mcpInstructionsData.filter(
      (item) => item.tools.length === 0 || Permission.disabled(item.tools, ruleset).size < item.tools.length,
    )
    const mcpInstructions = filteredMcp.length > 0
      ? [
          "<mcp_instructions>",
          ...filteredMcp.flatMap((item) => [
            `  <server name="${item.name}">`,
            ...item.instructions.split("\n").map((line) => `    ${line}`),
            "  </server>",
          ]),
          "</mcp_instructions>",
        ].join("\n")
      : null

    const skillSvc = yield* Skill.Service
    const skillsDisabled = Permission.disabled(["skill"], agentInfo.permission).has("skill")
    let skills: string | null = null
    if (!skillsDisabled) {
      const list = yield* skillSvc.available(agentInfo)
      const described = list.filter((s) => s.description !== undefined)
      if (described.length > 0) {
        skills = [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }
    }

    const fullSystemPrompt = [
      basePrompt,
      env,
      ...instructions,
      ...(mcpInstructions ? [mcpInstructions] : []),
      ...(skills ? [skills] : []),
    ]
      .filter((x) => x)
      .join("\n\n")

    return {
      agent: { name: agentName, prompt: agentInfo.prompt ?? null },
      model: { id: modelID ?? null, providerID: providerID ?? null },
      basePrompt,
      environment: env,
      instructions,
      mcpInstructions,
      skills,
      fullSystemPrompt,
    } satisfies FullSystem
  })

export const FullExportCommand = effectCmd({
  command: "full-export [sessionID]",
  describe: "export session data as JSON with full model context including system prompts",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session id to export",
        type: "string",
      })
      .option("sanitize", {
        describe: "redact sensitive transcript and file data",
        type: "boolean",
      }),
  handler: Effect.fn("Cli.fullExport")(function* (args) {
    return yield* run(args)
  }),
})

const run = Effect.fn("Cli.fullExport.body")(function* (args: { sessionID?: string; sanitize?: boolean }) {
  const svc = yield* Session.Service
  let sessionID = args.sessionID ? SessionID.make(args.sessionID) : undefined
  process.stderr.write(`Exporting full session context: ${sessionID ?? "latest"}\n`)

  if (!sessionID) {
    UI.empty()
    prompts.intro("Export session", { output: process.stderr })

    const sessions = yield* svc.list()

    if (sessions.length === 0) {
      prompts.log.error("No sessions found", { output: process.stderr })
      prompts.outro("Done", { output: process.stderr })
      return
    }

    sessions.sort((a, b) => b.time.updated - a.time.updated)

    const selectedSession = yield* Effect.promise(() =>
      prompts.autocomplete({
        message: "Select session to export",
        maxItems: 10,
        options: sessions.map((session) => ({
          label: session.title,
          value: session.id,
          hint: `${new Date(session.time.updated).toLocaleString()} • ${session.id.slice(-8)}`,
        })),
        output: process.stderr,
      }),
    )

    if (prompts.isCancel(selectedSession)) {
      return yield* Effect.die(new UI.CancelledError())
    }

    sessionID = selectedSession

    prompts.outro("Exporting session...", { output: process.stderr })
  }

  return yield* Effect.gen(function* () {
    const sessionInfo = yield* svc.get(sessionID!)
    const messages = yield* svc.messages({ sessionID: sessionInfo.id })
    const system = yield* reconstructSystem(sessionInfo, messages)

    const exportData: FullExportData = { info: sessionInfo, system, messages }

    process.stdout.write(JSON.stringify(args.sanitize ? sanitize(exportData) : exportData, null, 2))
    process.stdout.write(EOL)
  }).pipe(Effect.catchCause(() => fail(`Session not found: ${sessionID!}`)))
})
