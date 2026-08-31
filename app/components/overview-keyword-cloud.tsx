"use client"

import { cn } from "~/lib/utils"

const SIZE_STEPS = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
] as const

const TONES = [
  "text-muted-foreground",
  "text-foreground/60",
  "text-foreground/80",
  "text-foreground",
] as const

function wordWeight(word: string) {
  let hash = 0
  for (let index = 0; index < word.length; index += 1) {
    hash = (hash * 31 + word.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function OverviewKeywordCloud({ keywords }: { keywords: string[] }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 pb-5">
      <div className="flex flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 text-center">
        {keywords.map((keyword) => {
          const weight = wordWeight(keyword)
          return (
            <span
              className={cn(
                "max-w-full font-medium tracking-tight",
                SIZE_STEPS[weight % SIZE_STEPS.length],
                TONES[weight % TONES.length]
              )}
              key={keyword}
            >
              {keyword}
            </span>
          )
        })}
      </div>
    </div>
  )
}
