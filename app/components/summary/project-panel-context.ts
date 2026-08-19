import { createContext, useContext } from "react"

/**
 * Lets in-shell feature views (e.g. the summary greeting) open the shared
 * project/crawl picker owned by the workspace shell without threading a
 * callback through every layer. `null` means the opener is not mounted.
 */
export const ProjectPanelOpenContext = createContext<(() => void) | null>(null)

export function useProjectPanelOpen() {
  return useContext(ProjectPanelOpenContext)
}