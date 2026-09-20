export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type InstallPromptListener = (
  prompt: BeforeInstallPromptEvent | null
) => void

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<InstallPromptListener>()

function publishInstallPrompt() {
  for (const listener of listeners) listener(deferredInstallPrompt)
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    publishInstallPrompt()
  })
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null
    publishInstallPrompt()
  })
}

export function getInstallPrompt() {
  return deferredInstallPrompt
}

export function clearInstallPrompt() {
  deferredInstallPrompt = null
  publishInstallPrompt()
}

export function subscribeInstallPrompt(listener: InstallPromptListener) {
  listeners.add(listener)
  listener(deferredInstallPrompt)
  return () => listeners.delete(listener)
}
