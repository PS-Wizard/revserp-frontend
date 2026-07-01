import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { clientApiPost, ApiError } from "~/lib/api"
import type { MeResponse } from "~/lib/api.types"
import { resolveOAuthSessionFromCallback } from "~/lib/auth.client"
import { sanitizeNextPath } from "~/lib/auth-path"

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [errorMessage, setErrorMessage] = useState("")
  const nextPath = sanitizeNextPath(searchParams.get("next"))
  const hasStartedOAuthExchange = useRef(false)

  useEffect(() => {
    if (hasStartedOAuthExchange.current) {
      return
    }

    hasStartedOAuthExchange.current = true
    let isMounted = true

    async function exchangeOAuthSession() {
      const session = await resolveOAuthSessionFromCallback()
      const expiresAtSeconds = session.expires_at

      if (!expiresAtSeconds) {
        throw new Error("Supabase OAuth did not return an expiry timestamp.")
      }

      await clientApiPost<MeResponse>("/auth/oauth/exchange", {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
      })

      await navigate(nextPath, { replace: true })
    }

    void exchangeOAuthSession().catch((error) => {
      if (!isMounted) {
        return
      }

      hasStartedOAuthExchange.current = false

      const nextErrorMessage = getOAuthExchangeErrorMessage(error)
      setErrorMessage(nextErrorMessage)
    })

    return () => {
      isMounted = false
    }
  }, [navigate, nextPath])

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card px-8 py-10 text-center shadow-xs">
        <h1 className="text-3xl font-medium tracking-tight">Signing you in</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {errorMessage ||
            "Finishing the Google sign-in flow and opening your workspace."}
        </p>
        {errorMessage && (
          <p className="mt-6 text-sm">
            <Link
              className="underline underline-offset-4"
              to="/login"
              prefetch="intent"
            >
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

function getOAuthExchangeErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return error.message
  }

  return "Unable to complete Google sign-in."
}
