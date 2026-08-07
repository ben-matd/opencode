import { createMemo, Show } from "solid-js"
import type { Todo } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"

/**
 * A long task is otherwise a scrolling wall of activity cards with no sense of
 * how far along it is. When the agent has written down a plan, this says which
 * step it is on and how many are left, and offers the one control that always
 * works: stop.
 */
export function TaskProgress(props: { working: boolean; todos: Todo[]; onStop: () => void }) {
  const language = useLanguage()

  const done = createMemo(() => props.todos.filter((todo) => todo.status === "completed").length)
  const current = createMemo(() => props.todos.find((todo) => todo.status === "in_progress"))
  const total = createMemo(() => props.todos.length)

  const label = createMemo(() => {
    const step = current()
    if (step) return step.content
    if (total() > 0 && done() === total()) return language.t("task.progress.finishing")
    return language.t("task.progress.working")
  })

  return (
    <Show when={props.working}>
      <div
        data-component="task-progress"
        class="flex items-center gap-3 rounded-[10px] border border-v2-border-border-faint px-3 py-2"
        role="status"
        aria-live="polite"
      >
        <Spinner />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-12-regular text-v2-text-text-base">{label()}</span>
          <Show when={total() > 0}>
            <span class="text-12-regular text-v2-text-text-faint">
              {language.t("task.progress.steps", { done: done(), total: total() })}
            </span>
          </Show>
        </div>
        <Button size="small" variant="secondary" onClick={props.onStop}>
          {language.t("prompt.action.stop")}
        </Button>
      </div>
    </Show>
  )
}
