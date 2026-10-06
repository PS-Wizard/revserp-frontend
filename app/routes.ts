import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("terms", "routes/terms.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("oauth/consent", "routes/oauth-consent.tsx"),
  route("invite/:token", "routes/invite.tsx"),
  route("account-suspended", "routes/account-suspended.tsx"),
  route("app", "routes/app.tsx", [
    route("projects/:projectID/locations", "routes/app/project-locations.tsx"),
  ]),
  route("dev/audit-pdf", "routes/dev.audit-pdf.tsx"),
] satisfies RouteConfig
