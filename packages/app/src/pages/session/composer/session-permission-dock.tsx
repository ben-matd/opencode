import { createMemo, For, Show } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"

const NETWORK = /\b(curl|wget|ssh|scp|rsync|ftp|nc)\b|\bgit\s+(push|pull|clone|fetch)\b|\b(pip3?|npm|pnpm|yarn|bun|brew|apt|apt-get)\s+(install|add)\b/
const DESTRUCTIVE = /(^|[\s;&|])(rm|rmdir|del|shred|truncate)\b/

/**
 * Says what the agent is about to do and why it is worth a moment's thought,
 * without naming a tool or showing a shell command. The raw request is still
 * one toggle away in developer mode.
 */
export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()
  const settings = useSettings()

  const command = () => (typeof props.request.metadata?.command === "string" ? props.request.metadata.command : "")
  const filepath = () => (typeof props.request.metadata?.filepath === "string" ? props.request.metadata.filepath : "")
  const directories = () =>
    Array.isArray(props.request.metadata?.directories)
      ? (props.request.metadata.directories as unknown[]).filter((item): item is string => typeof item === "string")
      : []

  const explanation = createMemo(() => {
    switch (props.request.permission) {
      case "bash": {
        const text = command()
        if (DESTRUCTIVE.test(text))
          return { what: language.t("permission.ask.bash.delete"), why: language.t("permission.ask.bash.delete.why") }
        if (NETWORK.test(text))
          return { what: language.t("permission.ask.bash.network"), why: language.t("permission.ask.bash.network.why") }
        return { what: language.t("permission.ask.bash.other"), why: language.t("permission.ask.bash.other.why") }
      }
      case "external_directory":
        return { what: language.t("permission.ask.outside"), why: language.t("permission.ask.outside.why") }
      case "edit": {
        const file = filepath()
        return {
          what: language.t("permission.ask.edit", { file: getFilename(file) || file }),
          why: language.t("permission.ask.edit.why"),
        }
      }
      default: {
        const key = `settings.permissions.tool.${props.request.permission}.description` as const
        const described = language.t(key as Parameters<typeof language.t>[0])
        return {
          what: language.t("permission.ask.generic"),
          why: described === key ? "" : described,
        }
      }
    }
  })

  // Folder names read as places; glob patterns and shell commands do not.
  const specifics = createMemo(() => {
    if (settings.visibility.developer()) return props.request.patterns
    const dirs = directories()
    if (dirs.length > 0) return dirs
    const file = filepath()
    if (file) return [file]
    return []
  })

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{explanation().what}</div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Button
              variant="secondary"
              size="normal"
              onClick={() => props.onDecide("always")}
              disabled={props.responding}
            >
              {language.t("ui.permission.allowAlways")}
            </Button>
            <Button variant="primary" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={explanation().why}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{explanation().why}</div>
        </div>
      </Show>

      <Show when={specifics().length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={specifics()}>
              {(item) => <code class="text-12-regular text-text-base break-all">{item}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
