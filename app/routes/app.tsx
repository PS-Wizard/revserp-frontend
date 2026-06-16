import { Link, useLoaderData } from "react-router"

import type { MeResponse } from "~/lib/api.types"
import { requireAuthenticatedUser } from "~/lib/auth.server"

export async function loader({ request }: { request: Request }) {
  return requireAuthenticatedUser(request)
}

export default function AppPage() {
  const data = useLoaderData() as MeResponse

  return (
    <main className="min-h-svh bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-xl border border-border bg-card p-8 shadow-xs">
        <p className="text-sm text-muted-foreground">Protected route</p>
        <h1 className="text-3xl font-medium tracking-tight">You are signed in.</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{data.user.email}</span>
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link className="underline underline-offset-4" to="/">
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
