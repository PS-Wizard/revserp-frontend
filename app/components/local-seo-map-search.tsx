import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "~/lib/api";
import {
  LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS,
  bindLocalSeoListing,
  createLocalSeoListingLookup,
  createLocalSeoLocation,
  fetchLocalSeoLatestListingLookup,
  isLocalSeoLocationBound,
  localSeoLatestListingLookupQueryKey,
  localSeoLocationQueryKey,
  localSeoLocationsQueryKey,
  validateLocalSeoCoordinates,
  type LocalSeoCreateLocationInput,
  type LocalSeoListingLookup,
  type LocalSeoListingLookupStatus,
  type LocalSeoLocation,
} from "~/lib/local-seo-api";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

/** Finding businesses is a free Places lookup; the label states that. */
export const LOCAL_SEO_FIND_BUSINESSES_LABEL =
  LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS > 0
    ? `Find Google businesses · ${LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS} credits`
    : "Find Google businesses · Free";

/**
 * A stored lookup attempt: normalized search term plus exact search-area
 * centre. The centre is only where the provider looked, never business coords.
 */
export type LocalSeoSourceCandidate = {
  display_name: string;
  latitude: number;
  longitude: number;
};

/** Collapse whitespace and ignore case, mirroring the backend cache key. */
export function normalizeLocalSeoCandidateName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed.split(/\s+/).join(" ").toLowerCase();
}

/** True when both rows name the same search in the exact same search area. */
export function isSameLocalSeoSourceCandidate(
  a: LocalSeoSourceCandidate | null | undefined,
  b: LocalSeoSourceCandidate | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    normalizeLocalSeoCandidateName(a.display_name) ===
      normalizeLocalSeoCandidateName(b.display_name) &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}

/**
 * Build the lookup body from the explicit search term plus the actual
 * search-area centre. No cached geocoder candidate is ever sent.
 */
export function buildLocalSeoListingLookupInput(
  searchQuery: string,
  latitude: number,
  longitude: number,
): { search_query: string; latitude: number; longitude: number } {
  return { search_query: searchQuery.trim(), latitude, longitude };
}

/**
 * Build one unbound draft from the explicit search term. The search-area
 * centre is stored as the draft viewport only; address and locality stay
 * empty for later setup. Never a verified identity.
 */
export function buildLocalSeoUnboundDraftInput(
  searchTerm: string,
  viewport: { latitude: number; longitude: number },
): LocalSeoCreateLocationInput {
  return {
    name: searchTerm.trim(),
    address: "",
    locality: "",
    latitude: viewport.latitude,
    longitude: viewport.longitude,
  };
}

export type LocalSeoSearchArea = {
  latitude: number;
  longitude: number;
  source: "live" | "stored";
};

function viewportOfLive(searchCenter: [number, number] | null | undefined): {
  latitude: number;
  longitude: number;
} | null {
  if (!searchCenter || searchCenter.length !== 2) return null;
  const longitude = searchCenter[0];
  const latitude = searchCenter[1];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (validateLocalSeoCoordinates(latitude, longitude) !== null) return null;
  return { latitude, longitude };
}

/**
 * Resolve the search area for one lookup attempt. The live map viewport wins;
 * a saved draft falls back to its stored viewport, clearly labeled as a
 * search area. Null means no lookup action is allowed.
 */
export function resolveLocalSeoSearchArea(
  searchCenter: [number, number] | null | undefined,
  fallback: { latitude: number; longitude: number } | null | undefined,
): LocalSeoSearchArea | null {
  const live = viewportOfLive(searchCenter);
  if (live) return { ...live, source: "live" };
  if (fallback && Number.isFinite(fallback.latitude) && Number.isFinite(fallback.longitude)) {
    if (validateLocalSeoCoordinates(fallback.latitude, fallback.longitude) === null) {
      return { latitude: fallback.latitude, longitude: fallback.longitude, source: "stored" };
    }
  }
  return null;
}

/** Inputs the resolve gate reads: bound identity plus the stored lookup. */
export type LocalSeoResolveGate = {
  bound: boolean;
  lookupStatus: LocalSeoListingLookupStatus | null;
  lookupBusy: boolean;
  bindBusy: boolean;
  candidateCount: number;
  selectedPlaceId: string | null;
  selectedSearch?: LocalSeoSourceCandidate | null;
  lastSourceCandidate?: LocalSeoSourceCandidate | null;
  creditKnown?: boolean | null;
  reservedCredits?: number | null;
  hasQuery?: boolean;
  hasViewport?: boolean;
};

/**
 * Explicit resolution gate. A repeat of the same stored zero-credit Places
 * search plus exact viewport is blocked with plain feedback; a different term
 * or viewport is a new free attempt. Active, running, uncertain, held, or
 * unconfirmed states block every new attempt, as do loading or failed
 * latest-lookup reads, a bound listing, a missing term, and a missing search
 * area. Nothing here ever retries automatically.
 */
export function describeLocalSeoResolveAction(gate: LocalSeoResolveGate): {
  canResolve: boolean;
  resolveLabel: string;
  canBind: boolean;
  reason: string | null;
} {
  if (gate.bound) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason: "This location is already bound. Unbind it (free) before searching again.",
    };
  }
  if (gate.lookupStatus === "running" || gate.lookupStatus === "uncertain") {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason:
        "A running or uncertain reservation holds this search. Retry is blocked and nothing retries automatically.",
    };
  }
  if (gate.creditKnown === false) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason:
        "An unconfirmed charge holds this search. Retry is blocked and nothing retries automatically.",
    };
  }
  if ((gate.reservedCredits ?? 0) > 0) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason:
        "A held reservation blocks new attempts. Unknown holds are never recovered automatically.",
    };
  }
  if (gate.lookupBusy) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason: "Loading the saved Google search. New attempts wait until it finishes.",
    };
  }
  if (gate.hasQuery === false) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason: "Enter a business search term first.",
    };
  }
  if (gate.hasViewport === false) {
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason:
        "Move the map to set a search area before searching. Saved drafts fall back to their stored search area.",
    };
  }
  if (
    isSameLocalSeoSourceCandidate(
      gate.selectedSearch ?? null,
      gate.lastSourceCandidate ?? null,
    )
  ) {
    if (gate.lookupStatus === "completed" && gate.candidateCount > 0) {
      return {
        canResolve: false,
        resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
        canBind: gate.selectedPlaceId !== null && !gate.bindBusy,
        reason:
          "This search was already resolved. Choose a stored Google listing to bind. No new charge.",
      };
    }
    if (gate.lookupStatus === "completed") {
      return {
        canResolve: false,
        resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
        canBind: false,
        reason:
          "No business matching that name was found near this search area. Nothing more was charged.",
      };
    }
    // Failed or unknown evidence keeps its real state; never a false no-match.
    return {
      canResolve: false,
      resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
      canBind: false,
      reason: null,
    };
  }
  return {
    canResolve: true,
    resolveLabel: LOCAL_SEO_FIND_BUSINESSES_LABEL,
    canBind:
      gate.lookupStatus === "completed" &&
      gate.selectedPlaceId !== null &&
      !gate.bindBusy,
    reason: null,
  };
}

/**
 * Binding card for one Google listing. One business search field plus the
 * live map viewport drives a single explicit free search; the viewport is
 * only the search area, never the business identity. Candidates with a real
 * place id plus coords are chosen by the user and bound explicitly for free.
 */
export function LocalSeoMapSearchCard({
  projectId,
  initialLocation,
  searchCenter,
  onCreated,
  onBound,
  onClose,
}: {
  projectId: string;
  initialLocation?: LocalSeoLocation;
  searchCenter?: [number, number];
  onCreated?: (location: LocalSeoLocation) => void;
  onBound?: (location: LocalSeoLocation) => void;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialLocation?.name ?? "");
  const [created, setCreated] = useState<LocalSeoLocation | null>(
    initialLocation ?? null,
  );
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);

  const searchArea = resolveLocalSeoSearchArea(searchCenter, created);
  const trimmedQuery = query.trim();
  const selectedSearch: LocalSeoSourceCandidate | null =
    trimmedQuery !== "" && searchArea
      ? {
          display_name: trimmedQuery,
          latitude: searchArea.latitude,
          longitude: searchArea.longitude,
        }
      : null;

  const createMutation = useMutation({
    mutationFn: (input: LocalSeoCreateLocationInput) =>
      createLocalSeoLocation(projectId, input),
    onSuccess: (location) => {
      setCreated(location);
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, location.id),
        location,
      );
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      });
      onCreated?.(location);
    },
  });
  const latestLookupQuery = useQuery({
    queryKey: created
      ? localSeoLatestListingLookupQueryKey(projectId, created.id)
      : ["local-seo-listing-lookup-latest", "none"],
    queryFn: () => fetchLocalSeoLatestListingLookup(projectId, created!.id),
    enabled: created !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 4000 : false,
  });
  const lookupMutation = useMutation({
    mutationFn: (input: {
      locationId: string;
      search_query: string;
      latitude: number;
      longitude: number;
    }) =>
      createLocalSeoListingLookup(projectId, input.locationId, {
        search_query: input.search_query,
        latitude: input.latitude,
        longitude: input.longitude,
      }),
    onSuccess: (lookup) => {
      setGooglePlaceId(null);
      if (created) {
        queryClient.setQueryData(
          localSeoLatestListingLookupQueryKey(projectId, created.id),
          lookup,
        );
      }
    },
  });
  const bindMutation = useMutation({
    mutationFn: (placeId: string) =>
      bindLocalSeoListing(projectId, created!.id, {
        lookup_id: latestLookupQuery.data!.id,
        place_id: placeId,
      }),
    onSuccess: (updated) => {
      setCreated(updated);
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, updated.id),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      });
      onBound?.(updated);
    },
  });

  const latest: LocalSeoListingLookup | null =
    latestLookupQuery.data ?? null;
  const lastSource: LocalSeoSourceCandidate | null =
    latest?.source_candidate ?? null;
  // Only zero-credit Places evidence deduplicates; a historical cache row
  // stays visible but must not block a new Places lookup for the same search.
  const dedupSource: LocalSeoSourceCandidate | null =
    latest && latest.expected_credits === 0 ? lastSource : null;
  const bound = created ? isLocalSeoLocationBound(created) : false;
  const latestPending = created ? latestLookupQuery.isPending : false;
  const latestFailed = created ? latestLookupQuery.isError : false;
  const lookupBusy =
    lookupMutation.isPending || latestPending || latestFailed;
  const gate = describeLocalSeoResolveAction({
    bound,
    lookupStatus: latest?.status ?? null,
    lookupBusy,
    bindBusy: bindMutation.isPending,
    candidateCount: latest?.candidates.length ?? 0,
    selectedPlaceId: googlePlaceId,
    selectedSearch,
    lastSourceCandidate: dedupSource,
    creditKnown: latest ? latest.credit_known : null,
    reservedCredits: latest?.reserved_credits ?? 0,
    hasQuery: trimmedQuery !== "",
    hasViewport: searchArea !== null,
  });
  const findBusy = createMutation.isPending || lookupMutation.isPending;
  const canFind = gate.canResolve && !findBusy;

  async function handleFindBusinesses() {
    const term = query.trim();
    if (term === "" || findBusy) return;
    if (!created) {
      const live = viewportOfLive(searchCenter);
      if (!live) return;
      try {
        const location = await createMutation.mutateAsync(
          buildLocalSeoUnboundDraftInput(term, live),
        );
        const lookupInput = buildLocalSeoListingLookupInput(
          term,
          live.latitude,
          live.longitude,
        );
        const lookup = await lookupMutation.mutateAsync({
          locationId: location.id,
          ...lookupInput,
        });
        queryClient.setQueryData(
          localSeoLatestListingLookupQueryKey(projectId, location.id),
          lookup,
        );
      } catch {
        return;
      }
      return;
    }
    if (!searchArea) return;
    try {
      const lookupInput = buildLocalSeoListingLookupInput(
        term,
        searchArea.latitude,
        searchArea.longitude,
      );
      const lookup = await lookupMutation.mutateAsync({
        locationId: created.id,
        ...lookupInput,
      });
      queryClient.setQueryData(
        localSeoLatestListingLookupQueryKey(projectId, created.id),
        lookup,
      );
    } catch {
      return;
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Add a location</CardTitle>
        <CardDescription>
          One search field and the current map view define the search area.
          Finding businesses is deliberate and free; binding your choice is
          explicit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="map-search-query">Business name search</FieldLabel>
          <Input
            id="map-search-query"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          {searchArea ? (
            <FieldDescription>
              Search area{searchArea.source === "stored" ? " from saved draft" : ""}{" "}
              (not business identity):{" "}
              <span className="tabular-nums">
                {searchArea.latitude.toFixed(5)}, {searchArea.longitude.toFixed(5)}
              </span>{" "}
              · {searchArea.source === "stored" ? "Saved draft fallback" : "Current map view"}
            </FieldDescription>
          ) : (
            <FieldDescription>
              Move the map to set a search area before searching.
            </FieldDescription>
          )}
        </Field>

        {createMutation.isError ? (
          <FieldError>
            {errorMessageOf(createMutation.error, "Could not create location")}
          </FieldError>
        ) : null}
        {!created ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canFind}
              onClick={() => void handleFindBusinesses()}
            >
              {findBusy ? "Searching…" : gate.resolveLabel}
            </Button>
            {onClose ? (
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </div>
        ) : null}
        {gate.reason && !created ? (
          <FieldDescription role="status">{gate.reason}</FieldDescription>
        ) : null}

        {created ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium">
              Google listing for {created.name}
            </h3>
            {bound ? (
              <p className="text-sm">
                Bound to <span className="font-medium">{created.place_id}</span>{" "}
                at{" "}
                <span className="tabular-nums">
                  {created.latitude.toFixed(5)}, {created.longitude.toFixed(5)}
                </span>
                .
              </p>
            ) : (
              <FieldDescription>
                Saved unbound search for {created.name}. These coordinates are
                the search area only, not verified business coordinates.
                Resolution is explicit and never automatic.
              </FieldDescription>
            )}
            {latestLookupQuery.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : null}
            {latestLookupQuery.isError ? (
              <FieldError>
                {errorMessageOf(
                  latestLookupQuery.error,
                  "Could not load the saved Google search",
                )}
              </FieldError>
            ) : null}
            {lastSource ? (
              <FieldDescription>
                Last attempted search: {lastSource.display_name} in search area{" "}
                <span className="tabular-nums">
                  {lastSource.latitude.toFixed(5)},{" "}
                  {lastSource.longitude.toFixed(5)}
                </span>
                .
              </FieldDescription>
            ) : null}
            {latest ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="text-muted-foreground">
                  {latest.status}
                  {latest.expected_credits > 0
                    ? ` · expected ${latest.expected_credits} credit`
                    : " · Free"}
                  {latest.credit_known
                    ? ` · confirmed ${latest.credits_used}`
                    : ""}
                  {latest.deduplicated ? " · reused stored evidence" : ""}
                </p>
                {latest.error && latest.status !== "completed" ? (
                  <FieldError>{latest.error}</FieldError>
                ) : null}
                {!latest.credit_known ? (
                  <FieldError>
                    Charge unconfirmed. Nothing was retried automatically.
                  </FieldError>
                ) : null}
                {latest.candidates.length > 0 ? (
                  <FieldSet className="gap-2">
                    <FieldLegend variant="label">Choose your listing</FieldLegend>
                    {latest.candidates.map((candidate) => (
                      <label
                        key={candidate.place_id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 has-checked:border-primary/50 has-checked:bg-muted/60"
                      >
                        <input
                          type="radio"
                          name={`map-google-candidate-${latest.id}`}
                          value={candidate.place_id}
                          checked={googlePlaceId === candidate.place_id}
                          onChange={() =>
                            setGooglePlaceId(candidate.place_id)
                          }
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
                  </FieldSet>
                ) : null}
              </div>
            ) : (
              !latestLookupQuery.isPending && (
                <FieldDescription>No Google search yet for this location.</FieldDescription>
              )
            )}
            {lookupMutation.isError || bindMutation.isError ? (
              <FieldError>
                {errorMessageOf(
                  lookupMutation.error ?? bindMutation.error,
                  "Request failed",
                )}
              </FieldError>
            ) : null}
            {gate.reason ? (
              <FieldDescription role="status">{gate.reason}</FieldDescription>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canFind}
                onClick={() => void handleFindBusinesses()}
              >
                {findBusy ? "Searching…" : gate.resolveLabel}
              </Button>
              {latest && latest.candidates.length > 0 ? (
                <Button
                  type="button"
                  disabled={!gate.canBind}
                  onClick={() => {
                    if (googlePlaceId) bindMutation.mutate(googlePlaceId);
                  }}
                >
                  {bindMutation.isPending
                    ? "Binding…"
                    : "Bind selected listing · Free"}
                </Button>
              ) : null}
              {onClose ? (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
