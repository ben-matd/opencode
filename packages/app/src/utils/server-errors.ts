export type ConfigInvalidError = {
  name: "ConfigInvalidError"
  data: {
    path?: string
    message?: string
    issues?: Array<{ message: string; path: string[] }>
  }
}

export type ProviderModelNotFoundError = {
  name: "ProviderModelNotFoundError"
  data: {
    providerID: string
    modelID: string
    suggestions?: string[]
  }
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

function tr(translator: Translator | undefined, key: string, text: string, vars?: Record<string, string | number>) {
  if (!translator) return text
  const out = translator(key, vars)
  if (!out || out === key) return text
  return out
}

export function formatServerError(error: unknown, translate?: Translator, fallback?: string) {
  const unwrapped = unwrapNamedError(error)
  if (isConfigInvalidErrorLike(unwrapped)) return parseReadableConfigInvalidError(unwrapped, translate)
  if (isProviderModelNotFoundErrorLike(unwrapped)) return parseReadableProviderModelNotFoundError(unwrapped, translate)
  const plain = plainLanguageErrorKey(unwrapped)
  if (plain && translate) {
    const text = translate(plain)
    if (text && text !== plain) return text
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  if (fallback) return fallback
  return tr(translate, "error.chain.unknown", "Unknown error")
}

function unwrapNamedError(error: unknown): unknown {
  if (error instanceof Error && error.cause && typeof error.cause === "object" && "body" in error.cause) {
    return (error.cause as Record<string, unknown>).body
  }
  return error
}

// Client-synthesized session not-found errors share one constructor and
// predicate so the message contract cannot drift between the sync store
// (server-session.ts), the route lineage (session-lineage.ts), and the
// not-found fallback matching (session.tsx).
const sessionNotFoundMessage = (sessionID: string) => `Session not found: ${sessionID}`

export function sessionNotFoundError(sessionID: string) {
  return new Error(sessionNotFoundMessage(sessionID))
}

export function isLocalSessionNotFoundError(error: unknown, sessionID: string) {
  return error instanceof Error && error.message === sessionNotFoundMessage(sessionID)
}

export function isSessionNotFoundError(error: unknown, sessionID: string) {
  const unwrapped = unwrapNamedError(error)
  if (typeof unwrapped !== "object" || unwrapped === null) return false
  const value = unwrapped as Record<string, unknown>
  return value._tag === "SessionNotFoundError" && value.sessionID === sessionID
}

function isConfigInvalidErrorLike(error: unknown): error is ConfigInvalidError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null
}

function isProviderModelNotFoundErrorLike(error: unknown): error is ProviderModelNotFoundError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null
}

export function parseReadableConfigInvalidError(errorInput: ConfigInvalidError, translator?: Translator) {
  const file = errorInput.data.path && errorInput.data.path !== "config" ? errorInput.data.path : "config"
  const detail = errorInput.data.message?.trim() ?? ""
  const issues = (errorInput.data.issues ?? [])
    .map((issue) => {
      const msg = issue.message.trim()
      if (!issue.path.length) return msg
      return `${issue.path.join(".")}: ${msg}`
    })
    .filter(Boolean)
  const msg = issues.length ? issues.join("\n") : detail
  if (!msg) return tr(translator, "error.chain.configInvalid", `Config file at ${file} is invalid`, { path: file })
  return tr(translator, "error.chain.configInvalidWithMessage", `Config file at ${file} is invalid: ${msg}`, {
    path: file,
    message: msg,
  })
}

function parseReadableProviderModelNotFoundError(errorInput: ProviderModelNotFoundError, translator?: Translator) {
  const p = errorInput.data.providerID.trim()
  const m = errorInput.data.modelID.trim()
  const list = (errorInput.data.suggestions ?? []).map((v) => v.trim()).filter(Boolean)
  const body = tr(translator, "error.chain.modelNotFound", `Model not found: ${p}/${m}`, { provider: p, model: m })
  const tail = tr(translator, "error.chain.checkConfig", "Check your config (opencode.json) provider/model names")
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ")
    return [body, tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, { suggestions }), tail].join(
      "\n",
    )
  }
  return [body, tail].join("\n")
}

/**
 * Recognizes the handful of failures that are common and fixable, and says what
 * to do about them in a sentence. Everything else falls through to the original
 * message — a wrong plain-language guess is worse than a technical truth.
 */
export function plainLanguageErrorKey(error: unknown): string | undefined {
  const status = statusOf(error)
  const text = messageOf(error).toLowerCase()

  if (
    status === 401 ||
    status === 403 ||
    /(invalid|incorrect|bad|missing)[_ -]?api[_ -]?key|unauthorized|authentication failed|invalid[_ -]?token/.test(text)
  )
    return "error.plain.apiKey"
  if (status === 429 || /rate[_ -]?limit|too many requests/.test(text)) return "error.plain.rateLimit"
  if (/quota|insufficient[_ -]?(quota|credit|balance)|billing/.test(text)) return "error.plain.quota"
  if (/enotfound|econnrefused|etimedout|network error|fetch failed|dns/.test(text)) return "error.plain.offline"
  if (/enoent|no such file or directory|directory not found/.test(text)) return "error.plain.folderMissing"
  if (/eacces|eperm|permission denied|operation not permitted/.test(text)) return "error.plain.permissionDenied"
  if (/no provider|provider not (found|configured)|no models? available/.test(text)) return "error.plain.noProvider"
  return undefined
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const value = error as Record<string, unknown>
  if (typeof value.status === "number") return value.status
  if (typeof value.statusCode === "number") return value.statusCode
  const data = value.data
  if (typeof data === "object" && data !== null && typeof (data as Record<string, unknown>).status === "number")
    return (data as Record<string, number>).status
  return undefined
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return `${error.name} ${error.message} ${String(error.cause ?? "")}`
  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>
    const parts = [value.name, value.message, value.code, value._tag].filter((part) => typeof part === "string")
    const data = value.data
    if (typeof data === "object" && data !== null) {
      for (const nested of Object.values(data as Record<string, unknown>))
        if (typeof nested === "string") parts.push(nested)
    }
    if (parts.length) return parts.join(" ")
    try {
      return JSON.stringify(error)
    } catch {
      return ""
    }
  }
  return ""
}
