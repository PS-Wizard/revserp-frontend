import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { clientApiPost, ApiError } from "~/lib/api"
import type {
  MeResponse,
  SignupCompletedWithoutSessionResponse,
} from "~/lib/api.types"
import { buildAuthHref, sanitizeNextPath } from "~/lib/auth-path"
import { startGoogleSignIn } from "~/lib/auth.client"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"

export function AuthForm({
  className,
  mode,
  ...props
}: React.ComponentProps<"form"> & {
  mode: "login" | "signup"
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = sanitizeNextPath(searchParams.get("next"))
  const isLogin = mode === "login"
  const alternatePath = buildAuthHref(isLogin ? "/signup" : "/login", nextPath)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage("")
    setInfoMessage("")
    setIsSubmitting(true)

    try {
      if (isLogin) {
        await clientApiPost<MeResponse>("/auth/login", { email, password })
      } else {
        const response = await clientApiPost<
          MeResponse | SignupCompletedWithoutSessionResponse
        >("/auth/signup", { email, password })

        if ("signup_completed_without_session" in response) {
          setInfoMessage(
            "Signup completed without a session. Verify your email if this is a new account, or log in if it already exists."
          )
          return
        }
      }

      await navigate(nextPath)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : isLogin
            ? "Unable to log in."
            : "Unable to sign up."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setErrorMessage("")
    setInfoMessage("")
    setIsGoogleSubmitting(true)

    try {
      await startGoogleSignIn(nextPath)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in."
      )
      setIsGoogleSubmitting(false)
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">
            {isLogin ? "Login to Revserp.ai" : "Create your Revserp.ai account"}
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            {isLogin
              ? "Enter your email below to access your workspace."
              : "Create an account to start organizing projects, crawls, and audits."}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="m@example.com"
            required
            type="email"
            value={email}
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            {isLogin && (
              <a
                className="ml-auto text-sm underline-offset-4 hover:underline"
                href="#"
              >
                Forgot your password?
              </a>
            )}
          </div>
          <Input
            autoComplete={isLogin ? "current-password" : "new-password"}
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </Field>
        <Field>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting
              ? isLogin
                ? "Logging in..."
                : "Creating account..."
              : isLogin
                ? "Login"
                : "Create account"}
          </Button>
        </Field>
        <FieldSeparator>Or continue with</FieldSeparator>
        <Field>
          <Button
            disabled={isGoogleSubmitting}
            onClick={handleGoogleSignIn}
            type="button"
            variant="outline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path
                d="M21.8 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.7 3-4.2 3-7.4Z"
                fill="currentColor"
              />
              <path
                d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z"
                fill="currentColor"
              />
              <path
                d="M6.4 13.8A6 6 0 0 1 6 12c0-.6.1-1.2.4-1.8V7.5H3A10 10 0 0 0 2 12c0 1.6.4 3 1 4.5l3.4-2.7Z"
                fill="currentColor"
              />
              <path
                d="M12 6.1c1.4 0 2.7.5 3.6 1.4l2.7-2.7A10 10 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7C7.2 7.8 9.4 6.1 12 6.1Z"
                fill="currentColor"
              />
            </svg>
            {isGoogleSubmitting
              ? "Redirecting..."
              : isLogin
                ? "Login With Google"
                : "Sign up with Google"}
          </Button>
          {infoMessage && (
            <FieldDescription className="text-center">
              {infoMessage}
            </FieldDescription>
          )}
          {errorMessage && (
            <FieldDescription className="text-center text-destructive">
              {errorMessage}
            </FieldDescription>
          )}
          <FieldDescription className="text-center">
            {isLogin ? "Don&apos;t have an account?" : "Already have an account?"}{" "}
            <Link className="underline underline-offset-4" to={alternatePath}>
              {isLogin ? "Sign up" : "Login"}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
