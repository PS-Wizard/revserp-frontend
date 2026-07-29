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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        {/* Only the mobile offset is lifted. Under 600px sonner goes full-width
            and would bury the bottom-centre Revserp AI button; above that the
            toast is right-aligned and 356px wide, so it clears the 13rem
            centred button on any normal desktop width without help. */}
        <Toaster
          mobileOffset={{ bottom: "5.5rem", left: "1rem", right: "1rem" }}
          position="bottom-right"
        />
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
