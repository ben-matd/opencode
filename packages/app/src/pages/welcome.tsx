import { createMemo, For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { ServerConnection } from "@/context/server"
import { getFilename } from "@opencode-ai/core/util/path"

export type WelcomeProps = {
  /** The server the chosen folder will be opened on. */
  server: ServerConnection.Any
  /** Folders already opened, newest last. Empty on a genuine first run. */
  workspaces: () => string[]
  /** Opens the given folders as workspaces. */
  onChoose: (directories: string[]) => void
  /** Leaves onboarding for the normal home screen. */
  onDone: () => void
}

/**
 * First-run screen. Two things stand between a new person and doing work: the
 * app does not know which folder to work in, and it has no AI service to think
 * with. This asks for both in that order, in plain language, with no mention of
 * config files or the terminal.
 */
export function Welcome(props: WelcomeProps) {
  const language = useLanguage()
  const dialog = useDialog()
  const pickDirectory = useDirectoryPicker()
  const providers = useProviders()

  const connected = createMemo(() => providers.connected())
  const hasProvider = createMemo(() => connected().length > 0)
  const hasWorkspace = createMemo(() => props.workspaces().length > 0)
  const ready = createMemo(() => hasWorkspace() && hasProvider())

  function chooseFolder() {
    pickDirectory({
      server: props.server,
      title: language.t("welcome.folder.action"),
      multiple: false,
      onSelect: (result) => {
        if (result === null) return
        props.onChoose(Array.isArray(result) ? result : [result])
      },
    })
  }

  function connectProvider() {
    void import("@/components/dialog-connect-provider").then(({ DialogConnectProvider }) => {
      void dialog.show(() => <DialogConnectProvider />)
    })
  }

  return (
    <div class="flex min-h-full w-full items-center justify-center px-6 py-12">
      <div class="flex w-full max-w-[560px] flex-col gap-8">
        <header class="flex flex-col gap-2">
          <h1 class="text-20-medium text-text-strong">{language.t("welcome.title")}</h1>
          <p class="text-14-regular text-text-weak">{language.t("welcome.subtitle")}</p>
        </header>

        <Step
          index={1}
          done={hasWorkspace()}
          title={language.t("welcome.folder.title")}
          description={language.t("welcome.folder.description")}
          action={language.t(hasWorkspace() ? "welcome.folder.actionAgain" : "welcome.folder.action")}
          onAction={chooseFolder}
        >
          <Show when={hasWorkspace()}>
            <ul class="flex flex-col gap-1">
              <For each={props.workspaces()}>
                {(directory) => (
                  <li class="text-12-regular text-text-weak" title={directory}>
                    {getFilename(directory) || directory}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Step>

        <Step
          index={2}
          done={hasProvider()}
          title={language.t("welcome.provider.title")}
          description={language.t("welcome.provider.description")}
          action={language.t(hasProvider() ? "welcome.provider.actionAgain" : "welcome.provider.action")}
          onAction={connectProvider}
        >
          <Show when={hasProvider()}>
            <div class="text-12-regular text-text-weak">
              {language.t("welcome.provider.connected", { names: connected().map((item) => item.name).join(", ") })}
            </div>
          </Show>
        </Step>

        <div class="flex items-center gap-3">
          <Button class="px-3" disabled={!ready()} onClick={props.onDone}>
            {language.t("welcome.start")}
          </Button>
          <Show when={!ready()}>
            <span class="text-12-regular text-text-weak">{language.t("welcome.start.blocked")}</span>
          </Show>
        </div>
      </div>
    </div>
  )
}

function Step(props: {
  index: number
  done: boolean
  title: string
  description: string
  action: string
  onAction: () => void
  children?: unknown
}) {
  return (
    <section class="flex gap-4 rounded-[10px] border border-border-weak p-4">
      <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center">
        <Show when={props.done} fallback={<span class="text-12-medium text-text-weak">{props.index}</span>}>
          <Icon name="circle-check" size="small" />
        </Show>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-col gap-1">
          <div class="text-14-medium text-text-strong">{props.title}</div>
          <p class="text-12-regular text-text-weak">{props.description}</p>
        </div>
        {props.children as never}
        <div>
          <Button class="px-3" onClick={props.onAction}>
            {props.action}
          </Button>
        </div>
      </div>
    </section>
  )
}
