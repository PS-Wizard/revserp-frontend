import { redirect } from "react-router"

import { ApiError, serverApiFetch } from "~/lib/api"
import type { MeResponse } from "~/lib/api.types"
import { sanitizeNextPath } from "~/lib/auth-path"

// The backend signals a suspended account with 403 + {"error":"account suspended"}
// (see the auth middleware). Any other error must not be mistaken for suspension.
export function isAccountSuspended(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.message === "account suspended"
  )
}

export async function redirectAuthenticatedUser(request: Request) {
  const url = new URL(request.url)
  const redirectPath = sanitizeNextPath(url.searchParams.get("next"))

  try {
    await serverApiFetch<MeResponse>("/me", request)
    throw redirect(redirectPath)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    if (isAccountSuspended(error)) {
      throw redirect("/account-suspended")
    }

    throw error
  }
}

export async function requireAuthenticatedUser(request: Request) {
  try {
    return await serverApiFetch<MeResponse>("/me", request)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const url = new URL(request.url)
      const nextPath = `${url.pathname}${url.search}`
      throw redirect(`/login?next=${encodeURIComponent(nextPath)}`)
    }

    if (isAccountSuspended(error)) {
      throw redirect("/account-suspended")
    }

    throw error
  }
}

// requirePlatformAdmin gates a loader to platform admins only. It is a drop-in
// replacement for requireAuthenticatedUser (returns the same MeResponse) that
// additionally redirects non-admins away, providing the server-side gate the
// admin/internal routes previously lacked.
export async function requirePlatformAdmin(request: Request) {
  const me = await requireAuthenticatedUser(request)
  if (!me.is_platform_admin) {
    throw redirect("/app")
  }
  return me
}
