import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "~/lib/utils"

export const revbotRemarkPlugins = [remarkGfm]

export function RevbotMarkdown({
  children,
  className,
  components,
}: {
  children: string
  className?: string
  components?: Components
}) {
  return (
    <div className={cn("typeset typeset-docs w-full min-w-0", className)}>
      <ReactMarkdown
        components={components}
        remarkPlugins={revbotRemarkPlugins}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
