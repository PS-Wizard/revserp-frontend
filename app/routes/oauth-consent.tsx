import { useEffect, useState } from "react"
import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import { ShieldCheckIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ApiError, clientApiPost, serverApiFetch } from "~/lib/api"
import { requireAuthenticatedUser } from "~/lib/auth.server"

type AuthorizationClient = {
  id?: string
  name?: string
  uri?: string
  logo_uri?: string
}

// Supabase returns either the details to render, or a redirect_url when this
// user already granted these scopes and the request was auto-approved.
type AuthorizationDetails = {
  redirect_uri?: string
  scope?: string
  client?: AuthorizationClient
  redirect_url?: string
}

type ConsentDecisionResponse = {
  redirect_url?: string
}

type ConsentLoaderData =
  | { state: "error"; message: string }
  | { state: "redirect"; redirectUrl: string }
  | {
      state: "consent"
      authorizationID: string
      clientName: string
      logoUrl: string
      redirectUri: string
      scopes: string[]
    }

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<ConsentLoaderData> {
  const requestUrl = new URL(request.url)
  const authorizationID =
    requestUrl.searchParams.get("authorization_id")?.trim() ?? ""

  if (authorizationID === "") {
    return {
      state: "error",
      message: "This authorization link is missing its authorization id.",
    }
  }

  await requireAuthenticatedUser(request)

  let details: AuthorizationDetails
  try {
    details = await serverApiFetch<AuthorizationDetails>(
      `/oauth/authorizations/${encodeURIComponent(authorizationID)}`,
      request
    )
  } catch (error) {
    // Do not bounce 401 back to /login here. This page already passed
    // requireAuthenticatedUser, so a 401 from the authorization lookup is a
    // missing/expired request (or a dead Supabase token), not a logged-out
    // user. Sending them to login while the session cookie is valid loops:
    // login sees /me, redirects back here, 401 again.
    return { state: "error", message: getAuthorizationErrorMessage(error) }
  }

  if (details?.redirect_url) {
    return { state: "redirect", redirectUrl: details.redirect_url }
  }

  const client = details?.client ?? {}
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean)

  return {
    state: "consent",
    authorizationID,
    clientName: client.name?.trim() || client.id?.trim() || "this application",
    logoUrl: client.logo_uri?.trim() ?? "",
    redirectUri: details?.redirect_uri?.trim() ?? "",
    scopes,
  }
}

function getAuthorizationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.status === 401) {
      return "This authorization request expired or was already used. Start the connection again from your AI client."
    }

    if (error.status === 502) {
      return "The authorization service is having a temporary problem. Please try again in a moment."
    }

    if (error.message.trim() !== "") {
      return error.message
    }
  }

  return "Unable to load this authorization request."
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm your account identity",
  profile: "Your basic profile information",
  email: "Your email address",
  phone: "Your phone number",
  address: "Your postal address",
  offline_access: "Access while you are not actively using Revserp",
}

function formatScope(scope: string) {
  return SCOPE_LABELS[scope] ?? scope
}

export default function OAuthConsentPage() {
  const data = useLoaderData() as ConsentLoaderData
  const [pendingAction, setPendingAction] = useState<"approve" | "deny" | null>(
    null
  )
  const [errorMessage, setErrorMessage] = useState("")

  const redirectUrl = data.state === "redirect" ? data.redirectUrl : ""
  const authorizationID = data.state === "consent" ? data.authorizationID : ""
  const isPending = pendingAction !== null

  useEffect(() => {
    if (redirectUrl !== "") {
      window.location.assign(redirectUrl)
    }
  }, [redirectUrl])

  async function submitDecision(action: "approve" | "deny") {
    if (authorizationID === "" || isPending) {
      return
    }

    setPendingAction(action)
    setErrorMessage("")

    try {
      const response = await clientApiPost<ConsentDecisionResponse>(
        `/oauth/authorizations/${encodeURIComponent(authorizationID)}/consent`,
        { action }
      )

      const nextRedirectUrl = response?.redirect_url?.trim()
      if (!nextRedirectUrl) {
        throw new Error(
          "The authorization server did not return a redirect URL."
        )
      }

      window.location.assign(nextRedirectUrl)
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "Unable to complete the request. Please try again."
      )
      setPendingAction(null)
    }
  }

  if (data.state === "redirect") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </main>
    )
  }

  if (data.state === "error") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-xl">Authorization request</CardTitle>
            <CardDescription className="text-base">
              {data.message}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            {data.logoUrl ? (
              <img
                alt=""
                className="size-10 shrink-0 rounded-lg border border-border object-cover"
                src={data.logoUrl}
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <ShieldCheckIcon className="size-5 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0">
              <CardTitle className="text-lg">
                Connect {data.clientName}
              </CardTitle>
              <CardDescription>
                {data.clientName} is asking for access to your Revserp account.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Redirects to
            </p>
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
              {data.redirectUri || "Not provided"}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Requested access
            </p>
            {data.scopes.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {data.scopes.map((scope) => (
                  <li className="flex items-start gap-3" key={scope}>
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{formatScope(scope)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No specific permissions were requested.
              </p>
            )}
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            disabled={isPending}
            onClick={() => void submitDecision("deny")}
            variant="outline"
          >
            {pendingAction === "deny" ? "Denying..." : "Deny"}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => void submitDecision("approve")}
          >
            {pendingAction === "approve" ? "Allowing..." : "Allow"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
