/** Isolated acceptance fixture: real Base UI Dialog + real Driver.js.
 * Runs in a fresh `bun` subprocess (see onboarding-driver-real.test.tsx)
 * because the shared-registry suite run poisons Base UI's document cache.
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

// React dev profiling calls these; happy-dom's virtual console throws when
// called, so replace them outright before rendering anything.
for (const method of ["timeStamp", "time", "timeEnd", "profile", "profileEnd"] as const) {
  try {
    ;(console as unknown as Record<string, unknown>)[method] = () => {}
  } catch {
    // Console replacement is best-effort; rendering does not depend on it.
  }
}

const failures: string[] = []
function check(name: string, condition: boolean) {
  if (!condition) failures.push(name)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const { createRoot } = await import("react-dom/client")
const { CreateProjectDialog } = await import(
  "~/components/app-navbar/dialogs"
)
const { driver } = await import("driver.js")

const host = document.createElement("div")
document.body.appendChild(host)
const root = createRoot(host)
root.render(
  <CreateProjectDialog
    createProjectError=""
    isCreatingProject={false}
    isOpen
    projectBaseUrl=""
    projectName=""
    onBaseUrlChange={() => {}}
    onNameChange={() => {}}
    onOpenChange={() => {}}
    onSubmit={(event: { preventDefault(): void }) => event.preventDefault()}
  />,
)
await sleep(600)

const nameInput = document.querySelector(
  '[data-tour="onboarding-create-form"] #project-name',
) as HTMLInputElement | null
check("dialog renders project name input", !!nameInput)
check("input starts enabled", nameInput?.disabled === false)

let closeClicked = 0
const tour = driver({
  animate: false,
  allowClose: true,
  overlayClickBehavior: "none",
  popoverClass: "onboarding-tour-popover",
  showButtons: ["close"],
  steps: [
    {
      element: '[data-tour="onboarding-create-form"]',
      popover: {
        title: "Name your project",
        description: "Fill the real form.",
        showButtons: ["close"],
        onCloseClick: () => {
          closeClicked += 1
        },
      },
    },
  ],
})
tour.drive(0)
await sleep(400)

check(
  "single overlay while modal open",
  document.querySelectorAll(".driver-overlay").length === 1,
)
check(
  "modal input stays enabled under highlight",
  (
    document.querySelector("#project-name") as HTMLInputElement | null
  )?.disabled === false,
)
const closeButton = document.querySelector(
  ".driver-popover-close-btn",
) as HTMLButtonElement | null
check("tour close button renders", !!closeButton)
check("tour close button enabled", closeButton?.disabled === false)
check(
  "popover outside modal inert scope",
  closeButton?.closest('[aria-hidden="true"],[data-base-ui-inert]') == null,
)

nameInput?.focus()
check("input takes focus", document.activeElement === nameInput)
document.dispatchEvent(
  new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
)
await sleep(100)
const afterTab = document.activeElement as HTMLElement | null
check(
  "tab moves focus to a control",
  !!afterTab &&
    afterTab !== document.body &&
    /^(INPUT|BUTTON|TEXTAREA|SELECT|A)$/.test(afterTab.tagName),
)
closeButton?.focus()
check("tour close takes focus", document.activeElement === closeButton)

closeButton?.click()
await sleep(200)
check("close click fires hook", closeClicked === 1)

tour.destroy()
await sleep(200)
check(
  "destroy removes overlay",
  document.querySelectorAll(".driver-overlay").length === 0,
)
check(
  "destroy removes popover",
  document.querySelectorAll(".driver-popover").length === 0,
)
root.unmount()

nodeLog(`ONBOARDING_FIXTURE_RESULT ${JSON.stringify({ failures })}`)
process.exit(failures.length > 0 ? 1 : 0)
