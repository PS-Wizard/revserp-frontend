import { redirect } from "react-router"

import { ApiError, serverApiFetch } from "~/lib/api"
import type { MeResponse } from "~/lib/api.types"
import { sanitizeNextPath } from "~/lib/auth-path"

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

    if (error instanceof ApiError) {
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

    if (error instanceof ApiError) {
      throw redirect("/account-suspended")
    }

    throw error
  }
}
