import { createContext, useContext } from "react"

export type SelectedAuditPage = {
  id: string
  url: string
  title?: string | null
}

export type PageAuditContextValue = {
  selectedPage: SelectedAuditPage | null
  setSelectedPage: (page: SelectedAuditPage | null) => void
}

export const PageAuditContext = createContext<PageAuditContextValue | null>(
  null
)

export function usePageAudit() {
  return useContext(PageAuditContext)
}
