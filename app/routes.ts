import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("invite/:token", "routes/invite.tsx"),
  route("app", "routes/app.tsx"),
  route("app/internal/scoring", "routes/app/internal/scoring.tsx"),
] satisfies RouteConfig
