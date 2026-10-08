"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { CheckIcon, Loader2Icon, SearchIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Slider } from "~/components/ui/slider"
import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_DEFAULT_RADIUS_M,
  LOCAL_SEO_MAX_RADIUS_M,
  LOCAL_SEO_MIN_RADIUS_M,
  createBoundLocation,
  searchLocationListings,
  validateLocalSeoRadiusM,
  type LocalSeoListingCandidate,
  type LocalSeoLocation,
} from "~/lib/local-seo-api"
import { cn } from "~/lib/utils"

import { validateLocationWebsiteScopeInput } from "./location-website-scope"
import {
  LocationWebsiteScopeFields,
  locationWebsiteScopeOriginError,
  type LocationWebsiteScopeFieldsValue,
} from "./location-website-scope-fields"

const WIZARD_STEPS = ["search", "listing", "radius", "scope"] as const
type WizardStep = (typeof WIZARD_STEPS)[number]

const STEP_LABELS: Record<WizardStep, string> = {
  search: "Search",
  listing: "Choose listing",
  radius: "Radius",
  scope: "Website scope",
}

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function LocationWizardSteps({ current }: { current: WizardStep }) {
  return (
    <ol
      aria-label="New location steps"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {WIZARD_STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={step === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5",
            step === current && "text-foreground"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
              step === current
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            )}
          >
            {index + 1}
          </span>
          {STEP_LABELS[step]}
        </li>
      ))}
    </ol>
  )
}

type WizardProps = {
  projectId: string
  /** Parent project origin, if the route can supply it, for scope validation. */
  parentWebsiteUrl?: string | null
  onCancel: () => void
  onCreated: (location: LocalSeoLocation) => void
  /** Lets the modal wrapper block dismissal while the atomic save is in flight. */
  onBusyChange?: (busy: boolean) => void
}

/**
 * Four explicit steps: search, choose a verified listing, radius, then the
 * initial branch website scope. Nothing is persisted before Create, so a
 * cancelled search never leaves a draft location behind.
 */
export function LocationCreateWizard({
  projectId,
  parentWebsiteUrl,
  onCancel,
  onCreated,
  onBusyChange,
}: WizardProps) {
  const [step, setStep] = useState<WizardStep>("search")
  const [query, setQuery] = useState("")
  const [searchId, setSearchId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<LocalSeoListingCandidate[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [radiusM, setRadiusM] = useState(LOCAL_SEO_DEFAULT_RADIUS_M)
  const [scope, setScope] = useState<LocationWebsiteScopeFieldsValue>({
    match: "none",
    url: "",
  })
  const [createError, setCreateError] = useState<string | null>(null)

  const searchMutation = useMutation({
    mutationFn: (term: string) => searchLocationListings(projectId, term),
    onSuccess: (result) => {
      setSearchId(result.id)
      setCandidates(result.candidates)
      setSelectedPlaceId(null)
      if (result.candidates.length > 0) setStep("listing")
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createBoundLocation(projectId, {
        search_id: searchId ?? "",
        place_id: selectedPlaceId ?? "",
        radius_m: radiusM,
        website_scope: {
          match: scope.match,
          url: scope.match === "none" ? null : scope.url.trim(),
        },
      }),
    onMutate: () => onBusyChange?.(true),
    onSettled: () => onBusyChange?.(false),
    onSuccess: (location) => onCreated(location),
    onError: (error) => {
      setCreateError(
        errorMessageOf(
          error,
          "Unable to create this location. Nothing was saved."
        )
      )
    },
  })

  const radiusError =
    step === "radius" ? validateLocalSeoRadiusM(radiusM) : null
  const scopeInputError = validateLocationWebsiteScopeInput(
    scope.url,
    scope.match
  )
  const scopeOriginError = locationWebsiteScopeOriginError(
    scope,
    parentWebsiteUrl
  )
  const scopeError =
    step === "scope" ? (scopeInputError ?? scopeOriginError) : null
  const selectedCandidate =
    candidates.find((candidate) => candidate.place_id === selectedPlaceId) ??
    null

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    if (!term || searchMutation.isPending) return
    setCreateError(null)
    searchMutation.mutate(term)
  }

  function handleSave() {
    if (
      !searchId ||
      !selectedPlaceId ||
      validateLocalSeoRadiusM(radiusM) !== null ||
      (scopeInputError ?? scopeOriginError) !== null ||
      createMutation.isPending
    ) {
      return
    }
    createMutation.mutate()
  }

  const searchedWithoutMatch =
    step === "search" &&
    searchId !== null &&
    candidates.length === 0 &&
    !searchMutation.isPending

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <LocationWizardSteps current={step} />

      {step === "search" ? (
        <form className="flex min-w-0 flex-col gap-4" onSubmit={handleSearch}>
          <Field className="gap-2">
            <FieldLabel htmlFor="location-search-query">
              Business name
            </FieldLabel>
            <Input
              autoComplete="off"
              className="min-w-0"
              id="location-search-query"
              placeholder="Business name and city"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <FieldDescription>
              Search is free of application credits and never creates a location
              on its own.
            </FieldDescription>
          </Field>

          {searchMutation.isError ? (
            <FieldError>
              {errorMessageOf(
                searchMutation.error,
                "The listing search failed. Nothing was charged."
              )}
            </FieldError>
          ) : null}

          {searchedWithoutMatch ? (
            <p className="text-sm text-muted-foreground">
              No Google Maps listing matched that search. Try a different name.
            </p>
          ) : null}

          <DialogFooter className="flex-wrap">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={!query.trim() || searchMutation.isPending}
              type="submit"
            >
              {searchMutation.isPending ? (
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                  Searching…
                </>
              ) : (
                <>
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  Search Google Maps
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      ) : null}

      {step === "listing" ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div
            aria-label="Verified Google Maps listings"
            className="flex max-h-72 min-h-0 min-w-0 flex-col gap-2 overflow-y-auto"
            role="radiogroup"
          >
            {candidates.map((candidate) => {
              const selected = candidate.place_id === selectedPlaceId
              return (
                <label
                  key={candidate.place_id}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    checked={selected}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    name="location-listing"
                    type="radio"
                    value={candidate.place_id}
                    onChange={() => setSelectedPlaceId(candidate.place_id)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="min-w-0 font-medium break-words">
                      {candidate.title}
                    </span>
                    <span className="min-w-0 break-words text-muted-foreground">
                      {candidate.address}
                    </span>
                  </span>
                  {selected ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                  ) : null}
                </label>
              )
            })}
          </div>

          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("search")}
            >
              Back
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={selectedPlaceId === null}
              type="button"
              onClick={() => setStep("radius")}
            >
              Next
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {step === "radius" ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span className="min-w-0 font-medium break-words">
              {selectedCandidate?.title ?? "Selected listing"}
            </span>
            {selectedCandidate ? (
              <span className="min-w-0 break-words text-muted-foreground">
                {selectedCandidate.address}
              </span>
            ) : null}
          </div>

          <Field className="gap-2">
            <FieldLabel htmlFor="location-create-radius">
              Sampling radius in metres
            </FieldLabel>
            <Input
              aria-invalid={radiusError !== null}
              className="min-w-0"
              id="location-create-radius"
              inputMode="numeric"
              value={String(radiusM)}
              onChange={(event) => setRadiusM(Number(event.target.value))}
            />
            <Slider
              aria-label="Sampling radius slider"
              max={LOCAL_SEO_MAX_RADIUS_M}
              min={LOCAL_SEO_MIN_RADIUS_M}
              step={500}
              value={[
                Number.isFinite(radiusM)
                  ? Math.min(
                      LOCAL_SEO_MAX_RADIUS_M,
                      Math.max(LOCAL_SEO_MIN_RADIUS_M, radiusM)
                    )
                  : LOCAL_SEO_MIN_RADIUS_M,
              ]}
              onValueChange={(values) => {
                const next = Array.isArray(values) ? values[0] : values
                if (next !== undefined) setRadiusM(next)
              }}
            />
            <FieldDescription>
              Between {LOCAL_SEO_MIN_RADIUS_M} and {LOCAL_SEO_MAX_RADIUS_M}{" "}
              metres.
            </FieldDescription>
            {radiusError ? <FieldError>{radiusError}</FieldError> : null}
          </Field>

          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("listing")}
            >
              Back
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={radiusError !== null}
              type="button"
              onClick={() => setStep("scope")}
            >
              Next
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {step === "scope" ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <span className="min-w-0 font-medium break-words">
              {selectedCandidate?.title ?? "Selected listing"}
            </span>
            <span className="min-w-0 break-words text-muted-foreground">
              {radiusM} m sampling radius
            </span>
          </div>

          <LocationWebsiteScopeFields
            idPrefix="location-create-scope"
            parentUrl={parentWebsiteUrl}
            value={scope}
            onChange={setScope}
          />

          {createError ? <FieldError>{createError}</FieldError> : null}

          <DialogFooter className="flex-wrap">
            <Button
              disabled={createMutation.isPending}
              type="button"
              variant="outline"
              onClick={() => setStep("radius")}
            >
              Back
            </Button>
            <Button
              disabled={createMutation.isPending}
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              disabled={
                scopeError !== null ||
                selectedPlaceId === null ||
                createMutation.isPending
              }
              type="button"
              onClick={handleSave}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                  Saving…
                </>
              ) : (
                "Create location"
              )}
            </Button>
          </DialogFooter>
        </div>
      ) : null}
    </div>
  )
}

type Props = {
  projectId: string
  parentWebsiteUrl?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (location: LocalSeoLocation) => void
}

/** Modal shell around the wizard; unmounting on close resets every step. */
export function LocationCreateDialog({
  projectId,
  parentWebsiteUrl,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New location</DialogTitle>
          <DialogDescription>
            Find the verified Google Maps listing for this location, set its
            sampling radius, then choose its website scope.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <LocationCreateWizard
            onBusyChange={setBusy}
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
            parentWebsiteUrl={parentWebsiteUrl}
            projectId={projectId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
