import { createContext, createElement, useContext, type ReactNode } from "react"
import type { LocalSeoLocation } from "~/lib/local-seo-api"

export type LocationWebsiteScopeRevision = {
  id: string
  revision: number
  url: string | null
  match: "none" | "exact" | "subtree"
  created_at: string
}

export type LocationWorkspaceResponse = {
  location: LocalSeoLocation
  can_manage: boolean
  website_scope: LocationWebsiteScopeRevision | null
  website_scope_revisions: LocationWebsiteScopeRevision[]
}

export type LocationWorkspace = {
  projectId: string
  location: LocalSeoLocation
  canManage: boolean
  websiteScope: LocationWebsiteScopeRevision | null
  websiteScopeRevisions: LocationWebsiteScopeRevision[]
  /** Reloads the root loader so scope saves refresh workspace context. Set by the root route. */
  refresh?: () => void
}

const LocationWorkspaceContext = createContext<LocationWorkspace | null>(null)

export function LocationWorkspaceProvider({
  workspace,
  children,
}: {
  workspace: LocationWorkspace | null
  children: ReactNode
}) {
  return createElement(LocationWorkspaceContext.Provider, { value: workspace }, children)
}

export function useOptionalLocationWorkspace() {
  return useContext(LocationWorkspaceContext)
}

export function locationWorkspacePath(projectId: string, locationId: string) {
  return `/app?${new URLSearchParams({ project: projectId, location: locationId })}`
}

export function locationWorkspaceAPIPath(projectId: string, locationId: string) {
  return `/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(locationId)}`
}
