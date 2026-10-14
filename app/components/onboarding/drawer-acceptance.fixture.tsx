/** Isolated acceptance fixture: real vaul-backed BusinessProfileDrawer +
 * real Driver.js. Runs in a fresh `bun` subprocess (see
 * onboarding-driver-real.test.tsx) because suite-wide module sharing can
 * load vaul before any DOM exists, after which its portal never mounts.
 * Prints one `ONBOARDING_FIXTURE_RESULT {...}` line to stdout. */
import { Window } from "happy-dom"

const nodeLog = console.log.bind(console)

const window = new Window({ url: "http://localhost/" })
const target = globalThis as Record<string, unknown>
const source = window as unknown as Record<string, unknown>
for (const key of Object.getOwnPropertyNames(window)) {
  if (key === "undefined" || key === "NaN" || key === "Infinity") continue
  try {
    target[key] = source[key]
  } catch {
    continue
  }
}
target.window = window
target.document = window.document
target.navigator = window.navigator
target.IS_REACT_ACT_ENVIRONMENT = true

for (const method of ["timeStamp", "time", "timeEnd", "profile", "profileEnd"] as const) {
  try {
    ;(console as unknown as Record<string, unknown>)[method] = () => {}
  } catch {
    continue
  }
}

globalThis.fetch = (async () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch

const failures: string[] = []
function check(name: string, condition: boolean) {
  if (!condition) failures.push(name)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const { createRoot } = await import("react-dom/client")
const { act } = await import("react")
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { BusinessProfileDrawer } = await import(
  "~/components/app-navbar/business-profile-drawer"
)
const { localSeoProjectServicesQueryKey } = await import(
  "~/lib/local-seo-api"
)
const { driver } = await import("driver.js")
const { readFile } = await import("node:fs/promises")
try {
  const driverCss = await readFile(
    new URL("../../../node_modules/driver.js/dist/driver.css", import.meta.url),
    "utf8",
  )
  const style = document.createElement("style")
  style.textContent = driverCss
  document.head.appendChild(style)
} catch {
  // Styling only; behavior assertions below do not depend on it.
}

const noop = () => undefined
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
client.setQueryData(localSeoProjectServicesQueryKey("proj-1"), [
  { id: "svc-1", label: "Coffee" },
])

const host = document.createElement("div")
document.body.appendChild(host)
const root = createRoot(host)
const props = {
  businessProfileProject: {
    id: "proj-1",
    organization_id: "org-1",
    name: "Test Project",
    base_url: "https://example.com",
  },
  brandName: "",
  websiteUrl: "https://example.com",
  primaryCategory: "",
  primaryLocation: "",
  businessDescription: "",
  productDescription: "",
  targetAudience: "",
  businessCompetitors: "",
  seedPrompts: ["", "", "", "", ""],
  profileServices: [],
  businessProfileError: "",
  isLoadingBusinessProfile: false,
  isSavingBusinessProfile: false,
  canManageBusinessProfile: true,
  aiQuestions: null,
  isLoadingAIQuestions: false,
  isRegeneratingAIQuestions: false,
  hasUnsavedChanges: false,
  closeBusinessProfileDrawer: noop,
  regenerateAIQuestions: noop,
  saveAIQuestions: noop,
  handleSaveBusinessProfile: noop,
  updateSeedPrompt: noop,
  setBrandName: noop,
  setWebsiteUrl: noop,
  setPrimaryCategory: noop,
  setPrimaryLocation: noop,
  setBusinessDescription: noop,
  setProductDescription: noop,
  setTargetAudience: noop,
  setBusinessCompetitors: noop,
  setProfileServices: noop,
  setSeedPrompts: noop,
  openBusinessProfileDrawer: noop,
} as never
await act(async () => {
  root.render(
    <QueryClientProvider client={client}>
      <BusinessProfileDrawer businessProfile={props} />
    </QueryClientProvider>,
  )
  await sleep(600)
})

const panel = document.querySelector(
  '[data-tour="onboarding-business-profile-panel"]',
)
check("drawer panel renders", !!panel)

let dismissed = 0
const tour = driver({
  animate: false,
  allowClose: true,
  overlayClickBehavior: "none",
  popoverClass: "onboarding-tour-popover",
  onDestroyStarted: () => {
    dismissed += 1
    tour.destroy()
  },
  steps: [
    {
      element: '[data-tour="onboarding-business-profile-panel"]',
      popover: {
        title: "One look, no edits needed",
        description: "Reading is enough.",
      },
    },
  ],
})
await act(async () => {
  tour.drive(0)
  await sleep(400)
})
check(
  "single overlay while drawer open",
  document.querySelectorAll(".driver-overlay").length === 1,
)
const nextButton = document.querySelector(
  ".driver-popover-next-btn",
) as HTMLButtonElement | null
check("tour next renders", !!nextButton)
check("tour next enabled", nextButton?.disabled === false)
check(
  "popover outside modal inert scope",
  nextButton?.closest('[aria-hidden="true"],[data-base-ui-inert]') == null,
)
document.dispatchEvent(
  new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }),
)
await sleep(200)
check("escape dismisses with drawer open", dismissed === 1)
check(
  "escape removes overlay",
  document.querySelectorAll(".driver-overlay").length === 0,
)
await act(async () => {
  root.unmount()
})

nodeLog(`ONBOARDING_FIXTURE_RESULT ${JSON.stringify({ failures })}`)
process.exit(failures.length > 0 ? 1 : 0)
