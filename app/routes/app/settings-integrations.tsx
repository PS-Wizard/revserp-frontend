import { redirect } from "react-router"

/** Alias for the dead /app/settings/integrations path: opens the MCP page. */
export function loader({ request }: { request: Request }) {
  const url = new URL(request.url)
  const params = new URLSearchParams(url.search)
  params.delete("location")
  const search = params.toString()
  throw redirect(`/app${search ? `?${search}` : ""}#marketplace`)
}

export default function SettingsIntegrationsAlias() {
  return null
}
