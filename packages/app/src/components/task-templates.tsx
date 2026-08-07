import { For } from "solid-js"
import { useLanguage } from "@/context/language"

/**
 * Starting points for someone facing an empty box. Each one fills the composer
 * with a sentence they can edit, so the first move is editing rather than
 * inventing.
 */
export const TASK_TEMPLATES = [
  { id: "summarize", icon: "📄" },
  { id: "spreadsheet", icon: "📊" },
  { id: "report", icon: "📝" },
  { id: "organize", icon: "🗂️" },
  { id: "research", icon: "🔎" },
] as const

export type TaskTemplateID = (typeof TASK_TEMPLATES)[number]["id"]

export function TaskTemplates(props: { onSelect: (prompt: string) => void }) {
  const language = useLanguage()

  return (
    <div data-component="task-templates" class="flex flex-col gap-2">
      <div class="text-12-regular text-v2-text-text-faint">{language.t("task.templates.heading")}</div>
      <ul class="flex flex-wrap justify-center gap-2">
        <For each={TASK_TEMPLATES}>
          {(template) => (
            <li>
              <button
                type="button"
                class="flex items-center gap-2 rounded-full border border-v2-border-border-faint px-3 py-1.5 text-12-regular text-v2-text-text-base hover:bg-v2-background-bg-subtle"
                title={language.t(`task.template.${template.id}.prompt`)}
                onClick={() => props.onSelect(language.t(`task.template.${template.id}.prompt`))}
              >
                <span aria-hidden="true">{template.icon}</span>
                <span>{language.t(`task.template.${template.id}.title`)}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
