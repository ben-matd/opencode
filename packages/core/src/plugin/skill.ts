/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-opencode.md" with { type: "text" }
import produceDocumentsContent from "./skill/produce-documents.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent

export const ProduceDocumentsContent = produceDocumentsContent

export const ProduceDocumentsName = "produce-documents"

export const ProduceDocumentsDescription =
  "Use when producing or converting a document deliverable — Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, CSV, or Markdown — or when reading text and tables out of PDFs, Word files, or spreadsheets. Covers which tool to reach for, how to check what is installed, and the conversion routes between formats."

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-opencode",
            description:
              "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself.",
            location: AbsolutePath.make("/builtin/customize-opencode.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: ProduceDocumentsName,
            description: ProduceDocumentsDescription,
            location: AbsolutePath.make("/builtin/produce-documents.md"),
            content: ProduceDocumentsContent,
          }),
        }),
      )
    })
  }),
})
