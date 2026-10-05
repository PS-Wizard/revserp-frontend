import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { MapPinIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS,
  LOCAL_SEO_QUERY_COUNT,
  bindLocalSeoListing,
  createLocalSeoListingLookup,
  createLocalSeoLocation,
  deleteLocalSeoLocation,
  fetchLocalSeoLatestListingLookup,
  fetchLocalSeoLocations,
  generateLocalSeoQueries,
  isLocalSeoLocationBound,
  localSeoLatestListingLookupQueryKey,
  localSeoLocationQueryKey,
  localSeoLocationsQueryKey,
  reverseLocalSeoAddress,
  searchLocalSeoAddresses,
  splitLocalSeoServices,
  validateEditableLocalSeoQueries,
  validateLocalSeoCoordinates,
  type LocalSeoGeocodedAddress,
  type LocalSeoListingLookup,
  type LocalSeoLocation,
} from "~/lib/local-seo-api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function lookupStatusLabel(status: LocalSeoListingLookup["status"]) {
  switch (status) {
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "uncertain":
      return "Uncertain charge"
    case "running":
      return "Running"
  }
}

/** Pure cost-evidence block: recorded charge, never a no-match message. */
export function ListingLookupEvidence({
  lookup,
}: {
  lookup: LocalSeoListingLookup
}) {
  return (
    <dl className="flex flex-col gap-1 text-sm">
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium">{lookupStatusLabel(lookup.status)}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Expected cost</dt>
        <dd className="tabular-nums">{lookup.expected_credits} credit</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Confirmed spend</dt>
        <dd className="tabular-nums">{lookup.credits_used} credit</dd>
      </div>
      {lookup.reserved_credits > 0 ? (
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Still reserved</dt>
          <dd className="tabular-nums">{lookup.reserved_credits} credit</dd>
        </div>
      ) : null}
      {!lookup.credit_known ? (
        <p role="alert" className="text-sm text-destructive">
          Charge unconfirmed — confirmed spend may still settle. Kept reserved;
          nothing was retried automatically.
        </p>
      ) : null}
      {lookup.error ? (
        <p role="alert" className="text-sm text-destructive">
          {lookup.error}
        </p>
      ) : null}
    </dl>
  )
}

function QueryDraftEditor({
  drafts,
  onChange,
  idPrefix,
}: {
  drafts: string[]
  onChange: (next: string[]) => void
  idPrefix: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No queries. An empty list stays empty; a run needs exactly{" "}
          {LOCAL_SEO_QUERY_COUNT}.
        </p>
      ) : null}
      {drafts.map((query, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-${index}`}>Query {index + 1}</Label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-${index}`}
              value={query}
              autoComplete="off"
              onChange={(event) => {
                const next = [...drafts]
                next[index] = event.target.value
                onChange(next)
              }}
            />
            <Button
              variant="outline"
              onClick={() => onChange(drafts.filter((_, i) => i !== index))}
              aria-label={`Remove query ${index + 1}`}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      {drafts.length < LOCAL_SEO_QUERY_COUNT ? (
        <div>
          <Button variant="outline" onClick={() => onChange([...drafts, ""])}>
            Add query
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function CreateLocationCard({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: (location: LocalSeoLocation) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [service, setService] = useState("")
  const [address, setAddress] = useState("")
  const [bypassCache, setBypassCache] = useState(false)
  const [selected, setSelected] = useState<LocalSeoGeocodedAddress | null>(null)
  const [locality, setLocality] = useState("")
  const [queryDrafts, setQueryDrafts] = useState<string[] | null>(null)

  const searchMutation = useMutation({
    mutationFn: () =>
      searchLocalSeoAddresses(projectId, {
        address: address.trim(),
        ...(bypassCache ? { refresh: true } : {}),
      }),
    onSuccess: () => setSelected(null),
  })
  const reverseMutation = useMutation({
    mutationFn: () =>
      reverseLocalSeoAddress(projectId, {
        latitude: selected!.latitude,
        longitude: selected!.longitude,
        ...(bypassCache ? { refresh: true } : {}),
      }),
    onSuccess: (envelope) => {
      const first = envelope.results[0]
      if (first) setLocality(first.locality)
    },
  })
  const generateMutation = useMutation({
    mutationFn: () =>
      generateLocalSeoQueries(projectId, {
        service: service.trim(),
        services: splitLocalSeoServices(service),
        locality: locality.trim(),
      }),
    onSuccess: (data) => setQueryDrafts(data.queries),
  })
  const createMutation = useMutation({
    mutationFn: () =>
      createLocalSeoLocation(projectId, {
        name: name.trim(),
        address: selected!.display_name,
        locality: locality.trim(),
        query_service: service.trim(),
        latitude: selected!.latitude,
        longitude: selected!.longitude,
        queries: (queryDrafts ?? []).map((query) => query.trim()),
      }),
    onSuccess: (location) => {
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, location.id),
        location,
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
      onCreated(location)
    },
  })

  const drafts = queryDrafts ?? []
  const draftsError = validateEditableLocalSeoQueries(drafts)
  const coordsError = selected
    ? validateLocalSeoCoordinates(selected.latitude, selected.longitude)
    : "Search the address and choose a result first."
  const canCreate =
    name.trim() !== "" &&
    service.trim() !== "" &&
    selected !== null &&
    locality.trim() !== "" &&
    queryDrafts !== null &&
    draftsError === null &&
    coordsError === null &&
    !createMutation.isPending
  const envelope = searchMutation.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a location</CardTitle>
        <CardDescription>
          Address search and query generation are free. The location is saved
          unbound — no Google listing until you run an explicit paid search
          below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location-name">Business name</Label>
            <Input
              id="location-name"
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location-service">Service text</Label>
            <Input
              id="location-service"
              value={service}
              autoComplete="off"
              placeholder="e.g. life insurance, car repair"
              onChange={(event) => setService(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location-address">Street address</Label>
          <div className="flex gap-2">
            <Input
              id="location-address"
              value={address}
              autoComplete="off"
              onChange={(event) => setAddress(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={address.trim() === "" || searchMutation.isPending}
              onClick={() => searchMutation.mutate()}
            >
              <SearchIcon
                aria-hidden="true"
                className="size-4"
                data-icon="inline-start"
              />
              {searchMutation.isPending ? "Searching…" : "Search address · Free"}
            </Button>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              checked={bypassCache}
              onCheckedChange={(checked) =>
                setBypassCache(checked === true)
              }
              aria-label="Bypass cached geography"
            />
            <span className="text-xs text-muted-foreground">
              Bypass cached geography for the next search. Searches never run
              while typing.
            </span>
          </div>
          {searchMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessageOf(searchMutation.error, "Address search failed")}
            </p>
          ) : null}
        </div>

        {envelope ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Address results</h3>
              <Badge variant="outline">
                {envelope.cached ? "Cached" : "Live"}
              </Badge>
            </div>
            {envelope.refresh_error ? (
              <p role="alert" className="text-sm text-destructive">
                Refresh failed, showing cached results: {envelope.refresh_error}
              </p>
            ) : null}
            {envelope.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No address found. Saved data stays usable; try a different
                spelling.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {envelope.results.map((result) => {
                  const active =
                    selected?.latitude === result.latitude &&
                    selected?.longitude === result.longitude &&
                    selected?.display_name === result.display_name
                  return (
                    <li
                      key={`${result.latitude},${result.longitude},${result.display_name}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(result)
                          setLocality(result.locality)
                        }}
                        aria-pressed={active}
                        className={
                          active
                            ? "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border border-primary/50 bg-muted/60 p-3 text-left"
                            : "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border border-border p-3 text-left hover:bg-muted/40"
                        }
                      >
                        <span className="text-sm font-medium">
                          {result.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {result.latitude.toFixed(5)},{" "}
                          {result.longitude.toFixed(5)}
                          {result.locality ? ` · ${result.locality}` : ""}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        {selected ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm">
              Accepted coordinates:{" "}
              <span className="font-medium tabular-nums">
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </span>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location-locality">Locality</Label>
              <div className="flex gap-2">
                <Input
                  id="location-locality"
                  value={locality}
                  autoComplete="off"
                  onChange={(event) => setLocality(event.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={reverseMutation.isPending}
                  onClick={() => reverseMutation.mutate()}
                >
                  {reverseMutation.isPending
                    ? "Confirming…"
                    : "Confirm locality · Free"}
                </Button>
              </div>
              {reverseMutation.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessageOf(
                    reverseMutation.error,
                    "Could not confirm the locality",
                  )}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Queries</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={
                service.trim() === "" ||
                locality.trim() === "" ||
                generateMutation.isPending
              }
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending
                ? "Generating…"
                : "Generate five queries · Free"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Generation applies only when you click — it never replaces manual
            edits on its own. Generate first, then edit, add or remove rows.
          </p>
          {generateMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessageOf(
                generateMutation.error,
                "Could not generate queries",
              )}
            </p>
          ) : null}
          {queryDrafts !== null ? (
            <>
              <QueryDraftEditor
                drafts={drafts}
                onChange={setQueryDrafts}
                idPrefix="new-location-query"
              />
              {draftsError ? (
                <p role="alert" className="text-sm text-destructive">
                  {draftsError}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No queries yet. Generate the five defaults, or add rows manually.
            </p>
          )}
        </div>

        {createMutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessageOf(createMutation.error, "Could not create location")}
          </p>
        ) : null}
        <div>
          <Button disabled={!canCreate} onClick={() => createMutation.mutate()}>
            <PlusIcon
              aria-hidden="true"
              className="size-4"
              data-icon="inline-start"
            />
            {createMutation.isPending ? "Creating…" : "Create unbound location"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ResolveListingCard({
  projectId,
  location,
}: {
  projectId: string
  location: LocalSeoLocation
}) {
  const queryClient = useQueryClient()
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const bound = isLocalSeoLocationBound(location)

  const latestLookupQuery = useQuery({
    queryKey: localSeoLatestListingLookupQueryKey(projectId, location.id),
    queryFn: () => fetchLocalSeoLatestListingLookup(projectId, location.id),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 4000 : false,
  })
  const lookupMutation = useMutation({
    mutationFn: () => createLocalSeoListingLookup(projectId, location.id),
    onSuccess: (lookup) => {
      setSelectedPlaceId(null)
      queryClient.setQueryData(
        localSeoLatestListingLookupQueryKey(projectId, location.id),
        lookup,
      )
    },
  })
  const bindMutation = useMutation({
    mutationFn: (placeId: string) =>
      bindLocalSeoListing(projectId, location.id, {
        lookup_id: latestLookupQuery.data!.id,
        place_id: placeId,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, location.id),
        updated,
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
    },
  })

  const latest = latestLookupQuery.data ?? null
  const candidates = latest?.candidates ?? []
  const lookupError =
    lookupMutation.isError || bindMutation.isError
      ? errorMessageOf(
          lookupMutation.error ?? bindMutation.error,
          "Request failed",
        )
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google listing for {location.name}</CardTitle>
        <CardDescription>
          One deliberate search costs {LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS}{" "}
          credit and uses the saved name and address. Selecting a listing is
          free and never moves the accepted sample centre (
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bound ? (
          <p className="text-sm">
            Bound to <span className="font-medium">{location.place_id}</span>.
            Ranking is enabled once between one and five queries are saved. Fewer queries cost less per run.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Unbound — ranking is disabled until a real listing is bound. Never
            invent a placeId.
          </p>
        )}

        {latestLookupQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : null}
        {latest ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <ListingLookupEvidence lookup={latest} />
            {latest.status === "completed" && candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No listing matched. The location stays unbound; open the grid
                to see the disabled ranking state.
              </p>
            ) : null}
            {latest.status === "failed" || latest.status === "uncertain" ? (
              <p className="text-sm text-muted-foreground">
                This is a provider failure with recorded cost evidence above —
                not a no-match. Nothing was retried automatically.
              </p>
            ) : null}
            {candidates.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">
                  Choose your listing
                </legend>
                {candidates.map((candidate) => (
                  <label
                    key={candidate.place_id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 has-checked:border-primary/50 has-checked:bg-muted/60"
                  >
                    <input
                      type="radio"
                      name={`listing-candidate-${latest.id}`}
                      value={candidate.place_id}
                      checked={selectedPlaceId === candidate.place_id}
                      onChange={() => setSelectedPlaceId(candidate.place_id)}
                      className="mt-1"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {candidate.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {candidate.address} ·{" "}
                        <span className="tabular-nums">
                          {candidate.latitude.toFixed(5)},{" "}
                          {candidate.longitude.toFixed(5)}
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : (
          !latestLookupQuery.isPending && (
            <p className="text-sm text-muted-foreground">
              No listing search yet for this location.
            </p>
          )
        )}

        {lookupError ? (
          <p role="alert" className="text-sm text-destructive">
            {lookupError}
          </p>
        ) : null}
        {bindMutation.isSuccess ? (
          <p role="status" className="text-sm text-muted-foreground">
            Listing bound. The accepted coordinates are unchanged.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={lookupMutation.isPending}
            onClick={() => lookupMutation.mutate()}
          >
            <SearchIcon
              aria-hidden="true"
              className="size-4"
              data-icon="inline-start"
            />
            {lookupMutation.isPending
              ? "Searching…"
              : `Find Google listing · ${LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS} credit`}
          </Button>
          {candidates.length > 0 ? (
            <Button
              disabled={
                selectedPlaceId === null ||
                latest === null ||
                latest.status !== "completed" ||
                bindMutation.isPending
              }
              onClick={() => {
                if (selectedPlaceId) bindMutation.mutate(selectedPlaceId)
              }}
            >
              {bindMutation.isPending
                ? "Binding…"
                : "Bind selected listing · Free"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            render={
              <Link
                to={`/app/projects/${projectId}/locations/${location.id}/grid`}
              >
                Open grid
              </Link>
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProjectLocationsRoute() {
  const params = useParams()
  const projectId = params.projectID ?? params.projectId ?? ""
  const queryClient = useQueryClient()
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  )
  const [createdId, setCreatedId] = useState<string | null>(null)

  const locationsQuery = useQuery({
    queryKey: localSeoLocationsQueryKey(projectId),
    queryFn: () => fetchLocalSeoLocations(projectId),
    enabled: projectId !== "",
  })

  const deleteMutation = useMutation({
    mutationFn: (locationId: string) =>
      deleteLocalSeoLocation(projectId, locationId),
    onSuccess: (_, locationId) => {
      setConfirmingDeleteId(null)
      if (resolveId === locationId) setResolveId(null)
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
    },
  })

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

  const locations = locationsQuery.data ?? []
  const resolveLocation =
    locations.find((location) => location.id === resolveId) ?? null

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb">
        <Button
          size="sm"
          variant="ghost"
          render={<Link to="/app">Back to workspace</Link>}
        />
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-balance">
            <MapPinIcon aria-hidden="true" className="size-6" />
            Locations
          </h1>
          <p className="text-sm text-muted-foreground">
            Physical locations for grid sampling. Unbound locations can be
            listed and edited, but ranking stays disabled until a real Google
            listing is bound.
          </p>
        </div>
      </header>

      {createdId ? (
        <p role="status" className="text-sm text-muted-foreground">
          Location created unbound. Find its Google listing below, or open its
          grid.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Saved locations</CardTitle>
          <CardDescription>
            {locationsQuery.isPending
              ? "Loading…"
              : `${locations.length} location${locations.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {locationsQuery.isPending ? (
            <div className="flex flex-col gap-2" aria-label="Loading locations">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : locationsQuery.isError ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-destructive">
                {errorMessageOf(
                  locationsQuery.error,
                  "Could not load locations",
                )}
              </p>
              <div>
                <Button
                  variant="outline"
                  onClick={() => void locationsQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : locations.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No locations yet</EmptyTitle>
                <EmptyDescription>
                  Add the first physical location below.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {locations.map((location) => {
                const bound = isLocalSeoLocationBound(location)
                const confirming = confirmingDeleteId === location.id
                return (
                  <li
                    key={location.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {location.name}
                      </span>
                      <Badge variant={bound ? "default" : "outline"}>
                        {bound ? "Bound" : "Unbound"}
                      </Badge>
                      <Badge variant="outline">
                        {location.queries.length}{" "}
                        {location.queries.length === 1 ? "query" : "queries"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[location.address, location.locality]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      <span className="tabular-nums">
                        {location.latitude.toFixed(5)},{" "}
                        {location.longitude.toFixed(5)}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to={`/app/projects/${projectId}/locations/${location.id}/grid`}
                          >
                            Open grid
                          </Link>
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setResolveId(
                            resolveId === location.id ? null : location.id,
                          )
                        }
                      >
                        {resolveId === location.id
                          ? "Hide listing search"
                          : "Find Google listing"}
                      </Button>
                      {confirming ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() =>
                              deleteMutation.mutate(location.id)
                            }
                          >
                            <Trash2Icon
                              aria-hidden="true"
                              className="size-4"
                              data-icon="inline-start"
                            />
                            Confirm delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            Keep
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingDeleteId(location.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    {deleteMutation.isError &&
                    confirmingDeleteId === location.id ? (
                      <p role="alert" className="text-sm text-destructive">
                        {errorMessageOf(
                          deleteMutation.error,
                          "Could not delete location",
                        )}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {resolveLocation ? (
        <>
          <ResolveListingCard projectId={projectId} location={resolveLocation} />
          <Separator />
        </>
      ) : null}

      <CreateLocationCard
        projectId={projectId}
        onCreated={(location) => {
          setCreatedId(location.id)
          setResolveId(location.id)
        }}
      />
    </main>
  )
}
