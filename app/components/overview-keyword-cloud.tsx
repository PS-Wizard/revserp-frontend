"use client"

import { cn } from "~/lib/utils"
import type {
  CombinedProjectKeyword,
  ProjectKeywordKind,
} from "~/lib/project-keywords-query"

const SIZE_STEPS = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
] as const

const KIND_TONES: Record<ProjectKeywordKind, string> = {
  brand: "text-yellow-700 dark:text-yellow-400",
  non_brand: "text-blue-600 dark:text-blue-400",
}

function wordWeight(word: string) {
  let hash = 0
  for (let index = 0; index < word.length; index += 1) {
    hash = (hash * 31 + word.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function OverviewKeywordCloud({
  items,
}: {
  items: CombinedProjectKeyword[]
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
      <div className="m-auto flex min-h-full flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 text-center">
        {items.map((item) => {
          const weight = wordWeight(item.keyword)
          return (
            <span
              className={cn(
                "max-w-full font-medium tracking-tight",
                SIZE_STEPS[weight % SIZE_STEPS.length],
                KIND_TONES[item.kind]
              )}
              key={`${item.kind}:${item.keyword}`}
            >
              {item.keyword}
            </span>
          )
        })}
      </div>
    </div>
  )
}
