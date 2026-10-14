import { useEffect, useRef } from "react"
import { useLocation, useNavigate, useNavigation } from "react-router"

import { getProjectIdFromLocationsPath } from "~/components/app-navbar/utils"
import type { ProjectResponse } from "~/lib/api.types"

/** Explicit project URLs take priority over the per-user saved selection. */
export function useLastActiveProject({
  userId,
  activeProjectId,
  projects,
}: {
  userId: string
  activeProjectId: string | null
  projects: Pick<ProjectResponse, "id">[]
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const restoringEntry = useRef<string | null>(null)

  useEffect(() => {
    if (!userId || navigation.state !== "idle") return

    const params = new URLSearchParams(location.search)
    const explicitProjectId =
      getProjectIdFromLocationsPath(location.pathname) ?? params.get("project")
    const isGenericEntry =
      /^\/app\/?$/.test(location.pathname) &&
      !["project", "crawl", "location", "audit", "revbotConversation"].some(
        (parameter) => params.has(parameter)
      )

    if (!isGenericEntry && !explicitProjectId) return
    if (
      explicitProjectId &&
      explicitProjectId.toLowerCase() !== activeProjectId?.toLowerCase()
    ) {
      return
    }

    try {
      const storageKey = `revserp:last-active-project:v1:${userId}`
      if (isGenericEntry) {
        const savedProjectId = window.localStorage.getItem(storageKey)
        if (
          savedProjectId &&
          savedProjectId !== activeProjectId &&
          projects.some((project) => project.id === savedProjectId)
        ) {
          const entryKey = `${userId}:${location.key}`
          if (restoringEntry.current !== entryKey) {
            restoringEntry.current = entryKey
            params.set("project", savedProjectId)
            void navigate(
              {
                pathname: location.pathname,
                search: `?${params.toString()}`,
                hash: location.hash,
              },
              { replace: true }
            )
          }
          return
        }
      }

      if (
        activeProjectId &&
        projects.some((project) => project.id === activeProjectId)
      ) {
        window.localStorage.setItem(storageKey, activeProjectId)
      } else {
        window.localStorage.removeItem(storageKey)
      }
    } catch {
      return
    }
  }, [userId, activeProjectId, projects, location, navigation.state, navigate])
}
