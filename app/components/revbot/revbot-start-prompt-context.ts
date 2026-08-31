import { createContext, useContext } from "react"

export const RevbotStartPromptContext = createContext<
  ((content: string) => void) | null
>(null)

export function useRevbotStartPrompt() {
  return useContext(RevbotStartPromptContext)
}
