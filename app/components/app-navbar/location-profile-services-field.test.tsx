import { describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { LocationProfileServicesField } from "~/components/app-navbar/location-profile-services-field"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

describe("location profile services field", () => {
  test("renders the snapshot copy and reports line edits", async () => {
    let seen: string[][] = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    try {
      act(() => {
        root.render(
          <LocationProfileServicesField
            services={["Coffee"]}
            onChange={(next) => {
              seen.push(next)
            }}
          />
        )
      })
      await act(async () => {
        await flushTestDom()
      })
      const area = host.querySelector("textarea")
      expect(area?.value).toBe("Coffee")
      expect(document.body.innerHTML).toContain("Location services")
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
    expect(seen).toEqual([])
  })

  test("normalize keeps the snapshot trim and de-duplicated", async () => {
    const { normalizeProfileServices } = await import(
      "~/components/app-navbar/use-business-profile"
    )
    expect(normalizeProfileServices([" Coffee ", "", "coffee", "Tea "])).toEqual(
      ["Coffee", "Tea"]
    )
  })
})
