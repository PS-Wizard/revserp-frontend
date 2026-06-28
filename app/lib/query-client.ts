import { QueryClient } from "@tanstack/react-query"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

// Browser singleton — one client for the lifetime of the page.
// On the server we never reach this module path (SSR calls are handled
// by the per-request client created in the Providers component).
let browserClient: QueryClient | undefined

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always create a fresh client (never shared across requests).
    return makeQueryClient()
  }
  if (!browserClient) {
    browserClient = makeQueryClient()
  }
  return browserClient
}

export { makeQueryClient }
