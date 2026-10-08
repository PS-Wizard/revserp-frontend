"use client"

import { useCallback, useRef, useState } from "react"
import { Link, useNavigate, useRevalidator, useSearchParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import {
  ArrowRightIcon,
  MapPinIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  ApiError,
} from "~/lib/api"
import {
  deleteLocalSeoLocation,
  fetchLocalSeoLocations,
  isLocalSeoLocationBound,
  localSeoLocationsQueryKey,
  localSeoMapsBudgetQueryKey,
  type LocalSeoLocation,
} from "~/lib/local-seo-api"

import { LocationCreateDialog } from "./location-create-dialog"

/** The scoped shell owns the location; this route only lists them. */
export function locationOpenPath(projectId: string, locationId: string) {
  const params = new URLSearchParams({
    project: projectId,
    location: locationId,
  })
  return `/app?${params.toString()}`
}

const COVER_GRADIENTS = [
  "linear-gradient(145deg, rgb(225 29 72 / 0.24) 0%, rgb(127 29 29 / 0.14) 42%, transparent 74%)",
  "linear-gradient(145deg, rgb(20 184 166 / 0.24) 0%, rgb(15 118 110 / 0.14) 42%, transparent 74%)",
  "linear-gradient(145deg, rgb(99 102 241 / 0.24) 0%, rgb(67 56 202 / 0.14) 42%, transparent 74%)",
] as const

function coverGradient(index: number) {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length]
}

function LocationCard({
  index,
  location,
  projectId,
  canManage,
  onDeleteRequest,
}: {
  index: number
  location: LocalSeoLocation
  projectId: string
  /** Owner-gated permanent delete; members never see the trash affordance. */
  canManage: boolean
  onDeleteRequest: (location: LocalSeoLocation) => void
}) {
  const bound = isLocalSeoLocationBound(location)
  const title = location.name.trim() || "Untitled location"
  const meta = [location.locality.trim(), location.address.trim()]
    .filter((part) => part !== "")
    .join(" · ")
  const cover = coverGradient(index)
  const openTo = locationOpenPath(projectId, location.id)

  return (
    <Card className="relative flex min-h-44 w-full flex-col gap-0 py-0 transition-colors hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: cover }}
      />
      <Link
        aria-label={`Open ${title}`}
        className="relative flex flex-1 flex-col rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        to={openTo}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <span className="min-w-0 truncate pr-2 text-sm font-medium">
            {title}
          </span>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/50 text-micro font-semibold uppercase">
            {title.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-5 text-center">
          {meta ? (
            <p className="text-sm text-muted-foreground">{meta}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No address on file for this location.
            </p>
          )}
        </div>
      </Link>

      <div className="relative flex items-center justify-between gap-2 px-4 pb-4">
        <Badge variant={bound ? "secondary" : "outline"}>
          {bound ? "Listing verified" : "Listing needed"}
        </Badge>
        <span className="flex shrink-0 items-center gap-2">
          {canManage ? (
            <button
              aria-label={`Delete location ${title}`}
              className="flex size-8 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition-colors outline-none hover:border-destructive/50 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={(event) => {
                // The button sits beside the card links, never inside one;
                // belt and suspenders so a delete request never navigates.
                event.preventDefault()
                event.stopPropagation()
                onDeleteRequest(location)
              }}
              type="button"
            >
              <Trash2Icon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <Link
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground"
            tabIndex={-1}
            to={openTo}
          >
            <ArrowRightIcon className="size-4" />
          </Link>
        </span>
      </div>
    </Card>
  )
}

function LocationCardSkeleton() {
  return (
    <Card className="flex min-h-44 flex-col gap-0 py-0">
      <div className="flex items-start justify-between px-4 pt-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-6 rounded-md" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-5">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-center justify-between px-4 pb-4">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </Card>
  )
}

/** Data-router revalidation is unavailable under plain MemoryRouter test harnesses. */
function useOptionalRevalidator() {
  try {
    return useRevalidator()
  } catch {
    return null
  }
}

function DeleteLocationDialog({
  target,
  busy,
  error,
  onConfirm,
  onOpenChange,
}: {
  target: LocalSeoLocation | null
  busy: boolean
  error: string | null
  onConfirm: (location: LocalSeoLocation) => void
  onOpenChange: (open: boolean) => void
}) {
  const name = target?.name.trim() || "Untitled location"
  return (
    <AlertDialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <AlertDialog.Popup className="surface-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl border border-border p-6 text-sm text-popover-foreground duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="font-heading leading-none font-medium">
              {target ? `Delete ${name}?` : "Delete location?"}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {target
                ? `This permanently deletes ${name}, including its saved Maps results and AI chat history. This cannot be undone.`
                : "This permanently deletes the location, including its saved results and history."}
            </AlertDialog.Description>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              render={<Button disabled={busy} variant="outline" />}
            >
              Keep location
            </AlertDialog.Close>
            <Button
              disabled={busy}
              onClick={() => target && onConfirm(target)}
              type="button"
              variant="destructive"
            >
              {busy ? "Deleting…" : "Delete location"}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function LocationListView({
  projectId,
  parentWebsiteUrl,
  canManage = false,
}: {
  projectId: string
  /** Parent project origin used for client-side scope validation. */
  parentWebsiteUrl?: string | null
  /** Owner-gated permanent delete; members never see the trash affordance. */
  canManage?: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const revalidator = useOptionalRevalidator()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LocalSeoLocation | null>(
    null
  )
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Ref-gated as well as state-gated: the confirm button disables on
  // re-render, the ref drops a second click landing in the same tick.
  const deleteFlightRef = useRef(false)

  const locationsQuery = useQuery({
    queryKey: localSeoLocationsQueryKey(projectId),
    queryFn: () => fetchLocalSeoLocations(projectId),
  })
  const locations = locationsQuery.data ?? []

  const handleCreated = useCallback(
    (location: LocalSeoLocation) => {
      queryClient.setQueryData<LocalSeoLocation[]>(
        localSeoLocationsQueryKey(projectId),
        (old) => {
          const withoutDuplicate = (old ?? []).filter(
            (entry) => entry.id !== location.id
          )
          return [...withoutDuplicate, location]
        }
      )
      setDialogOpen(false)
      toast.success("Location created")
    },
    [projectId, queryClient]
  )

  const handleDeleteRequest = useCallback((location: LocalSeoLocation) => {
    setDeleteTarget(location)
    setDeleteError(null)
  }, [])

  const handleDeleteOpenChange = useCallback(
    (open: boolean) => {
      // Keep the confirmation up while the delete is in flight.
      if (deleteBusy) return
      if (!open) {
        setDeleteTarget(null)
        setDeleteError(null)
      }
    },
    [deleteBusy]
  )

  const handleDeleteConfirm = useCallback(
    async (location: LocalSeoLocation) => {
      if (deleteFlightRef.current) return
      deleteFlightRef.current = true
      setDeleteBusy(true)
      setDeleteError(null)
      try {
        await deleteLocalSeoLocation(projectId, location.id)
        queryClient.setQueryData<LocalSeoLocation[]>(
          localSeoLocationsQueryKey(projectId),
          (old) => (old ?? []).filter((entry) => entry.id !== location.id)
        )
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: localSeoLocationsQueryKey(projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: localSeoMapsBudgetQueryKey(projectId),
          }),
          // Every cached query naming the location is workspace state for
          // a row that no longer exists; the list itself is handled above.
          queryClient.removeQueries({
            predicate: (query) =>
              query.queryKey.some((part) => part === location.id),
          }),
        ])
        revalidator?.revalidate()
        if (searchParams.get("location") === location.id) {
          navigate(`/app/projects/${projectId}/locations`, { replace: true })
        }
        setDeleteTarget(null)
        toast.success("Location deleted")
      } catch (error) {
        // The card stays: only a confirmed success drops it from the list.
        setDeleteError(
          error instanceof ApiError
            ? error.message
            : "Could not delete this location."
        )
      } finally {
        deleteFlightRef.current = false
        setDeleteBusy(false)
      }
    },
    [projectId, queryClient, navigate, revalidator, searchParams]
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-medium tracking-tight">
            Locations
          </h1>
          <p className="text-sm text-muted-foreground">
            Each location tracks one verified listing against the shared project
            crawl.
          </p>
        </div>
        <Button
          disabled={locationsQuery.isPending}
          onClick={() => setDialogOpen(true)}
          type="button"
          variant="outline"
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          New location
        </Button>
      </div>

      {locationsQuery.isPending ? (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {[0, 1, 2].map((index) => (
            <LocationCardSkeleton key={index} />
          ))}
        </div>
      ) : locationsQuery.isError ? (
        <div className="flex flex-1 flex-col">
          <Empty className="min-h-64 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Locations unavailable</EmptyTitle>
              <EmptyDescription>
                {locationsQuery.error instanceof Error
                  ? locationsQuery.error.message
                  : "Could not load locations for this project."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                onClick={() => void locationsQuery.refetch()}
              >
                Try again
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-1 flex-col">
          <Empty className="min-h-64 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No locations</EmptyTitle>
              <EmptyDescription>
                Add a location to track one verified Google Maps listing.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setDialogOpen(true)} type="button">
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                New location
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {locations.map((location, index) => (
            <LocationCard
              canManage={canManage}
              index={index}
              key={location.id}
              location={location}
              onDeleteRequest={handleDeleteRequest}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      <DeleteLocationDialog
        busy={deleteBusy}
        error={deleteError}
        onConfirm={(location) => void handleDeleteConfirm(location)}
        onOpenChange={handleDeleteOpenChange}
        target={deleteTarget}
      />

      <LocationCreateDialog
        onCreated={handleCreated}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        parentWebsiteUrl={parentWebsiteUrl}
        projectId={projectId}
      />
    </div>
  )
}
