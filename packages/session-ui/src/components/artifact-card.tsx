import { createMemo, Show } from "solid-js"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { Button } from "@opencode-ai/ui/button"
import { getFilename } from "@opencode-ai/core/util/path"
import { Markdown } from "./markdown"
import { FileMedia } from "./file-media"
import { useData } from "../context"

/** File kinds that get their own wording on the card. */
const KIND_BY_EXTENSION: Record<string, string> = {
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  csv: "spreadsheet",
  tsv: "spreadsheet",
  xlsx: "spreadsheet",
  xls: "spreadsheet",
  docx: "document",
  doc: "document",
  rtf: "document",
  odt: "document",
  pdf: "pdf",
  pptx: "slides",
  ppt: "slides",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
}

export function artifactKind(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return KIND_BY_EXTENSION[extension] ?? "file"
}

export type ArtifactCardProps = {
  path: string
  /** File text, when the caller already has it (the write tool does). */
  content?: string
  /** Suppresses the inline preview, leaving only the header and actions. */
  previewOff?: boolean
}

/**
 * What the agent produced, shown as the thing itself rather than as a diff:
 * markdown rendered, images inline, and everything a desktop app has to open
 * for you — Word, Excel, PDF — as a card with buttons that do that.
 */
export function ArtifactCard(props: ArtifactCardProps) {
  const i18n = useI18n()
  const data = useData()

  const name = createMemo(() => getFilename(props.path) || props.path)
  const kind = createMemo(() => artifactKind(props.path))
  const canOpen = createMemo(() => data.canOpenFiles?.() === true)

  const preview = createMemo(() => {
    if (props.previewOff) return "none"
    if (kind() === "image") return "image"
    if (kind() === "markdown" && props.content) return "markdown"
    return "none"
  })

  return (
    <div data-component="artifact-card">
      <div data-slot="artifact-card-header">
        <div data-slot="artifact-card-identity">
          <span data-slot="artifact-card-name">{name()}</span>
          <span data-slot="artifact-card-kind">{i18n.t(`ui.artifact.kind.${kind()}`)}</span>
        </div>
        <Show when={canOpen()}>
          <div data-slot="artifact-card-actions">
            <Button size="small" variant="secondary" onClick={() => data.openFile?.(props.path)}>
              {i18n.t("ui.artifact.open")}
            </Button>
            <Button size="small" variant="secondary" onClick={() => data.revealFile?.(props.path)}>
              {i18n.t("ui.artifact.reveal")}
            </Button>
          </div>
        </Show>
      </div>

      <Show when={preview() === "markdown"}>
        <div data-slot="artifact-card-preview">
          <Markdown text={props.content!} cacheKey={`${props.path}:${props.content!.length}`} />
        </div>
      </Show>

      <Show when={preview() === "image"}>
        <div data-slot="artifact-card-preview">
          <FileMedia
            media={{ path: props.path, readFile: data.readFile }}
            fallback={() => <span data-slot="artifact-card-note">{i18n.t("ui.artifact.preview.unavailable")}</span>}
          />
        </div>
      </Show>
    </div>
  )
}
