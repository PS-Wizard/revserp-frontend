import { Link } from "react-router"
import { Asterisk } from "lucide-react"

import { AuthForm } from "~/components/login-form"
import { redirectAuthenticatedUser } from "~/lib/auth.server"

export async function loader({ request }: { request: Request }) {
  return redirectAuthenticatedUser(request)
}

export default function LoginPage() {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link to="/" prefetch="intent" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Asterisk />
            </div>
            Revserp.ai
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <AuthForm mode="login" />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <video
          aria-label="Revserp.ai cover animation"
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted
          playsInline
          src="/videos/ascii.mp4"
        />
      </div>
    </div>
  )
}
