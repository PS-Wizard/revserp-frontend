import { describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  LocationWorkspaceProvider,
  useOptionalLocationWorkspace,
  type LocationWorkspace,
} from "~/lib/location-workspace"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

function makeWorkspace(): LocationWorkspace {
  return {
    projectId: "p-1",
    location: {
      id: "l-9",
      project_id: "p-1",
      name: "Roastery",
      place_id: "ChIJ1",
      address: "Main Street 1",
      locality: "Downtown",
      localities: [],
      services: [],
      latitude: 27.7,
      longitude: 85.3,
      queries: [],
    },
    canManage: true,
    websiteScope: null,
    websiteScopeRevisions: [],
  }
}

describe("location workspace context", () => {
  test("provider passes the workspace through, refresh optional", async () => {
    let seen: LocationWorkspace | null | undefined
    let refreshed = 0
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    function Probe() {
      seen = useOptionalLocationWorkspace()
      return null
    }
    try {
      act(() => {
        root.render(
          <LocationWorkspaceProvider
            workspace={{ ...makeWorkspace(), refresh: () => { refreshed += 1 } }}
          >
            <Probe />
          </LocationWorkspaceProvider>
        )
      })
      await act(async () => {
        await flushTestDom()
      })
      expect(seen?.projectId).toBe("p-1")
      expect(seen?.location.name).toBe("Roastery")
      seen?.refresh?.()
      expect(refreshed).toBe(1)
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
  })

  test("absent workspace reads as null", async () => {
    let seen: LocationWorkspace | null | undefined = undefined
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    function Probe() {
      seen = useOptionalLocationWorkspace()
      return null
    }
    try {
      act(() => {
        root.render(
          <LocationWorkspaceProvider workspace={null}>
            <Probe />
          </LocationWorkspaceProvider>
        )
      })
      await act(async () => {
        await flushTestDom()
      })
      expect(seen).toBeNull()
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
  })
})
