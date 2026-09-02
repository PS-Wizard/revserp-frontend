import { createContext, useContext } from "react"

export type RevbotStartPromptOptions = {
  keepDocked?: boolean
}

export type RevbotStartPromptContextValue = {
  startPrompt: (content: string, options?: RevbotStartPromptOptions) => void
  isActive: boolean
}

export const RevbotStartPromptContext =
  createContext<RevbotStartPromptContextValue | null>(null)

export function useRevbotStartPrompt() {
  return useContext(RevbotStartPromptContext)
}
