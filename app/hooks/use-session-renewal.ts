import { useEffect } from "react"
import { toast } from "sonner"

import { ApiError, clientApiFetch } from "~/lib/api"

const CHECK_INTERVAL_MS = 60 * 1000

type SessionRenewalResponse = {
  renewed: boolean
  expires_at: string
  renew_after: string
  retry_after?: string
}

let renewalRequest: Promise<SessionRenewalResponse> | null = null
let renewalWarningShown = false

function requestSessionRenewal() {
  renewalRequest ??= clientApiFetch<SessionRenewalResponse>(
    "/auth/session/renew",
    { method: "POST" }
  ).finally(() => {
    renewalRequest = null
  })
  return renewalRequest
}

function parseTime(value: string | undefined) {
  const parsed = Date.parse(value ?? "")
  return Number.isFinite(parsed) ? parsed : null
}

function retryAfterFromError(error: ApiError) {
  if (!error.details || typeof error.details !== "object") return null
  const retryAfter = (error.details as { retry_after?: unknown }).retry_after
  return typeof retryAfter === "string" ? parseTime(retryAfter) : null
}

export function useSessionRenewal(
  initialExpiresAt: string | undefined,
  initialRenewAfter: string | undefined
) {
  useEffect(() => {
    const parsedExpiresAt = parseTime(initialExpiresAt)
    const parsedRenewAfter = parseTime(initialRenewAfter)
    if (parsedExpiresAt === null || parsedRenewAfter === null) return

    let expiresAt = parsedExpiresAt
    let nextAttemptAt = parsedRenewAfter
    let renewalInFlight = false
    let disposed = false

    const redirectToLogin = () => {
      if (disposed) return
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.assign(`/login?next=${encodeURIComponent(next)}`)
    }

    const checkSession = async () => {
      const now = Date.now()
      if (now >= expiresAt) nextAttemptAt = 0
      if (now < nextAttemptAt || renewalInFlight) return

      renewalInFlight = true
      try {
        const renewal = await requestSessionRenewal()
        if (disposed) return

        const renewedExpiry = parseTime(renewal.expires_at)
        const renewedAfter = parseTime(renewal.renew_after)
        if (renewedExpiry !== null) expiresAt = renewedExpiry
        nextAttemptAt = renewedAfter ?? expiresAt
      } catch (error) {
        if (disposed) return
        if (error instanceof ApiError && error.status === 401) {
          redirectToLogin()
          return
        }
        if (error instanceof ApiError && error.status === 409) {
          nextAttemptAt = Number.POSITIVE_INFINITY
          if (!renewalWarningShown) {
            renewalWarningShown = true
            toast.warning(
              "Your session cannot renew. Save your work before signing in again."
            )
          }
          return
        }
        nextAttemptAt =
          error instanceof ApiError
            ? (retryAfterFromError(error) ?? now + CHECK_INTERVAL_MS)
            : now + CHECK_INTERVAL_MS
      } finally {
        if (!disposed) renewalInFlight = false
      }
    }

    void checkSession()
    const intervalID = window.setInterval(
      () => void checkSession(),
      CHECK_INTERVAL_MS
    )
    return () => {
      disposed = true
      window.clearInterval(intervalID)
    }
  }, [initialExpiresAt, initialRenewAfter])
}
