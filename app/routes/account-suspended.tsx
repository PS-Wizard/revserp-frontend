import { Asterisk, LogOutIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { clientApiPost } from "~/lib/api"

export default function AccountSuspendedPage() {
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await clientApiPost<unknown>("/auth/logout", {})
    } catch {
      // Logout may fail if the session is already invalidated
    }
    navigate("/login")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Asterisk className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4 text-xl">Account suspended</CardTitle>
          <CardDescription className="text-base">
            Your account has been suspended. Contact support if you believe this
            is a mistake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={handleSignOut}>
            <LogOutIcon className="mr-2 size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
