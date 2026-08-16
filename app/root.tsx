import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { TooltipProvider } from "~/components/ui/tooltip"
import { Toaster } from "~/components/ui/sonner"
import { makeQueryClient } from "~/lib/query-client"

import type { Route } from "./+types/root"
import "./app.css"

const restoreThemeScript = `try {
  document.documentElement.classList.toggle(
    "dark",
    localStorage.getItem("revserp-theme") !== "light"
  )
} catch {}`

// Register the service worker at module scope so it becomes active as early as
// possible — Chrome only fires the install prompt once the worker controls the page.
// Never in dev: the worker's static-asset cache fights Vite HMR and serves stale
// bundles on normal reloads.
if (
  typeof window !== "undefined" &&
  !import.meta.env.DEV &&
  "serviceWorker" in navigator
) {
  void navigator.serviceWorker.register("/sw.js")
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#030f14" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <script dangerouslySetInnerHTML={{ __html: restoreThemeScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster offset={{ left: 86 }} position="bottom-left" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

// react-doctor-disable-next-line react-doctor/no-multi-comp
export default function App() {
  // useState initializer runs once per component instance — safe for SSR because
  // each server request gets its own React tree (and thus its own QueryClient).
  const [queryClient] = useState(() => makeQueryClient())


  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

// react-doctor-disable-next-line react-doctor/no-multi-comp
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
