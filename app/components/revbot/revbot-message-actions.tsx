"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

import { copyText } from "./revbot-artifact-export"

type RevbotMessageActionsProps = {
  content: string
  variant: "default" | "dark"
}

export function RevbotMessageActions({
  content,
  variant,
}: RevbotMessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await copyText(content)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, 2000)
    } catch {
      toast.error("Unable to copy response")
    }
  }, [content])

  const isDark = variant === "dark"

  return (
    <div className="flex">
      <Button
        aria-label={copied ? "Response copied" : "Copy response as Markdown"}
        className={cn(
          "size-6 border-0 bg-transparent shadow-none",
          isDark
            ? "text-white/40 hover:bg-white/10 hover:text-white/80"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={handleCopy}
        size="icon-xs"
        title={copied ? "Copied" : "Copy response as Markdown"}
        type="button"
        variant="ghost"
      >
        <span className="relative flex size-3.5 items-center justify-center">
          <CopyIcon
            aria-hidden="true"
            className={cn(
              "absolute size-3.5 transition-all duration-200 ease-out motion-reduce:transition-none",
              copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
            )}
          />
          <CheckIcon
            aria-hidden="true"
            className={cn(
              "absolute size-3.5 transition-all duration-200 ease-out motion-reduce:transition-none",
              copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
            )}
          />
        </span>
      </Button>
    </div>
  )
}
