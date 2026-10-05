import { Link } from "react-router"
import { MapPinIcon } from "lucide-react"

import { Button } from "~/components/ui/button"

/**
 * Genuine project child link: derives the target from the currently selected
 * project, renders nothing without one. Never workspace-global, never a
 * hardcoded ID.
 */
export function LocationsNavLink({
  projectId,
}: {
  projectId: string | null | undefined
}) {
  if (!projectId) return null
  return (
    <Button
      size="sm"
      variant="ghost"
      render={
        <Link to={`/app/projects/${projectId}/locations`}>
          <MapPinIcon
            aria-hidden="true"
            className="size-4"
            data-icon="inline-start"
          />
          Locations
        </Link>
      }
    />
  )
}
