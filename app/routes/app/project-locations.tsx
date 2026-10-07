import { useParams, useSearchParams } from "react-router"

import { LocalSeoMapPage } from "~/components/local-seo-map-page"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"

export default function ProjectLocationsRoute() {
  const params = useParams()
  const projectId = params.projectID ?? params.projectId ?? ""
  const [searchParams] = useSearchParams()
  const initialLocationId = searchParams.get("location") ?? undefined
  const initialVisibilityAuditId = searchParams.get("audit") ?? undefined

  if (projectId === "") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Missing project</EmptyTitle>
            <EmptyDescription>
              This screen needs a project in the URL.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  return (
    <main aria-label="Locations map" className="h-full min-h-0 w-full">
      <LocalSeoMapPage
        key={`${projectId}:${initialLocationId ?? ""}:${initialVisibilityAuditId ?? ""}`}
        projectId={projectId}
        initialLocationId={initialLocationId}
        initialVisibilityAuditId={initialVisibilityAuditId}
      />
    </main>
  )
}
