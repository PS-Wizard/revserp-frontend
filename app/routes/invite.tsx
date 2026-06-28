import { useState } from "react"
import { Link, redirect, useLoaderData, useNavigate } from "react-router"
import { Asterisk } from "lucide-react"

import { ApiError, clientApiPost, serverApiFetch } from "~/lib/api"
import type { MeResponse } from "~/lib/api.types"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export type InviteLookupResponse = {
  id: string
  organization_id: string
  organization_name: string
  max_uses: number
  used_count: number
  remaining_uses: number
  expires_at: string
  created_at: string
  status: "active" | "revoked" | "expired" | "exhausted"
}

type LoaderData = {
  invite: InviteLookupResponse | null
  inviteErrorMessage: string
  me: MeResponse | null
  token: string
}

export async function loader({
  params,
  request,
}: {
  params: { token?: string }
  request: Request
}) {
  if (!params.token) {
    throw redirect("/login")
  }

  let invite: InviteLookupResponse | null = null
  let inviteErrorMessage = ""

  try {
    invite = await serverApiFetch<InviteLookupResponse>(
      `/invites/${params.token}`,
      request
    )
  } catch (error) {
    if (error instanceof ApiError) {
      inviteErrorMessage = error.message
    } else {
      throw error
    }
  }

  let me: MeResponse | null = null

  try {
    me = await serverApiFetch<MeResponse>("/me", request)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error
    }
  }

  return {
    invite,
    inviteErrorMessage,
    me,
    token: params.token,
  } satisfies LoaderData
}

export default function InvitePage() {
  const { invite, inviteErrorMessage, me, token } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState("")
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false)

  const nextPath = `/invite/${token}`
  const loginPath = `/login?next=${encodeURIComponent(nextPath)}`
  const signupPath = `/signup?next=${encodeURIComponent(nextPath)}`
  const isAuthenticated = me !== null
  const canAcceptInvite =
    invite !== null && invite.status === "active" && isAuthenticated
  const statusMessage = getInviteStatusMessage(invite, inviteErrorMessage)

  async function acceptInvite() {
    if (!canAcceptInvite || isAcceptingInvite) {
      return
    }

    setErrorMessage("")
    setIsAcceptingInvite(true)

    try {
      await clientApiPost<{ ok: boolean; organization_id: string }>(
        `/invites/${token}/accept`,
        {}
      )
      await navigate("/app", { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
        if (error.status === 401) {
          await navigate(loginPath)
        }
        return
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to accept invite."
      )
    } finally {
      setIsAcceptingInvite(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background px-6 py-8 text-foreground">
      <Link
        to="/"
        prefetch="intent"
        className="flex w-fit items-center gap-2 font-medium"
      >
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Asterisk />
        </div>
        Revserp.ai
      </Link>

      <main className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-xl border-border/60 bg-card/80 shadow-2xl backdrop-blur">
          <CardHeader>
            <CardDescription>Workspace invite</CardDescription>
            <CardTitle className="text-4xl tracking-[-0.06em] sm:text-5xl">
              {invite?.organization_name || "Join workspace"}
            </CardTitle>
            <CardDescription className="max-w-lg pt-2 text-sm leading-6">
              {invite?.status === "active"
                ? "You’ve been invited to join this workspace and collaborate on projects, crawls, and audits."
                : statusMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <p className="mb-6 text-sm text-destructive">{errorMessage}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {!invite || invite.status !== "active" ? (
                <Button
                  className="sm:col-span-2"
                  render={
                    <Link
                      to={isAuthenticated ? "/app" : "/login"}
                      prefetch="intent"
                    >
                      {isAuthenticated ? "Open app" : "Back to login"}
                    </Link>
                  }
                  variant="outline"
                />
              ) : !isAuthenticated ? (
                <>
                  <Button
                    render={
                      <Link to={loginPath} prefetch="intent">
                        Log in first
                      </Link>
                    }
                    variant="outline"
                  />
                  <Button
                    render={
                      <Link to={signupPath} prefetch="intent">
                        Create account
                      </Link>
                    }
                  />
                </>
              ) : (
                <>
                  <Button
                    disabled={isAcceptingInvite}
                    onClick={() => void acceptInvite()}
                    type="button"
                  >
                    {isAcceptingInvite
                      ? "Accepting invite..."
                      : "Accept invite"}
                  </Button>
                  <Button
                    render={
                      <Link to="/app" prefetch="intent">
                        Reject / maybe later
                      </Link>
                    }
                    variant="outline"
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function getInviteStatusMessage(
  invite: InviteLookupResponse | null,
  inviteErrorMessage: string
) {
  if (inviteErrorMessage) {
    return inviteErrorMessage
  }
  if (!invite) {
    return "Invite unavailable."
  }
  if (invite.status === "revoked") {
    return "This invite has been revoked."
  }
  if (invite.status === "expired") {
    return "This invite has expired."
  }
  if (invite.status === "exhausted") {
    return "This invite has reached its usage limit."
  }

  return ""
}
