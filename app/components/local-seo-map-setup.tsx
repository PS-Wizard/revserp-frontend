import {
  LOCAL_SEO_MAX_RADIUS_M,
  LOCAL_SEO_MIN_RADIUS_M,
  LOCAL_SEO_QUERY_COUNT,
  validateEditableLocalSeoQueries,
  validateLocalSeoRadiusM,
  type LocalSeoLandmark,
  type LocalSeoLocationQueryDraft,
  type LocalSeoLocationQueryRecord,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field"
import { Slider } from "~/components/ui/slider"

/** Enabled map-query drafts sharing the run's combined one-to-five slots. */
export function countEnabledLocalSeoMapDrafts(
  drafts: LocalSeoLocationQueryDraft[]
): number {
  return drafts.filter((draft) => draft.enabled && draft.kind === "map").length
}

/**
 * Add query never truncates the candidate list. At five enabled map queries the
 * new row starts disabled, so a run is never over the shared one-to-five cap.
 */
export function addLocalSeoQueryDraft(
  drafts: LocalSeoLocationQueryDraft[]
): LocalSeoLocationQueryDraft[] {
  return [
    ...drafts,
    {
      text: "",
      enabled: countEnabledLocalSeoMapDrafts(drafts) < LOCAL_SEO_QUERY_COUNT,
      kind: "map",
      source: "manual",
    },
  ]
}

export function LocalSeoMapSetupContent({
  radiusM,
  onRadiusChange,
  serviceText = "",
  onServiceTextChange = () => {},
  localityText,
  onLocalityTextChange,
  queryDrafts,
  onQueryDraftsChange,
  onGenerate,
  generating,
  generateError,
  onSave,
  saving,
  saveError,
  effectiveServices = null,
  queryRecords = [],
  landmarks = null,
  landmarksError = null,
  onRefreshLandmarks = () => {},
  refreshingLandmarks = false,
  refreshLandmarksError = null,
}: {
  radiusM: number
  onRadiusChange: (radiusM: number) => void
  /** Standalone fallback service text, used only when effectiveServices is null. */
  serviceText?: string
  onServiceTextChange?: (value: string) => void
  localityText: string
  onLocalityTextChange: (value: string) => void
  queryDrafts: LocalSeoLocationQueryDraft[]
  onQueryDraftsChange: (next: LocalSeoLocationQueryDraft[]) => void
  onGenerate: () => void
  generating: boolean
  generateError: string | null
  onSave: () => void
  saving: boolean
  saveError: string | null
  /** Null means no saved-services mode; an array is the loaded server-effective list. */
  effectiveServices?: string[] | null
  /** Ordered server records, so a generated row can name its landmark source. */
  queryRecords?: LocalSeoLocationQueryRecord[]
  /** Saved landmarks for this location, or null while the free read is loading. */
  landmarks?: LocalSeoLandmark[] | null
  landmarksError?: string | null
  onRefreshLandmarks?: () => void
  refreshingLandmarks?: boolean
  refreshLandmarksError?: string | null
}) {
  const radiusError = validateLocalSeoRadiusM(radiusM)
  const draftsError = validateEditableLocalSeoQueries(
    queryDrafts.map((draft) => draft.text)
  )
  const savedServicesLoaded = effectiveServices !== null
  const hasSavedServices = (effectiveServices?.length ?? 0) > 0
  const servicesBlocked = savedServicesLoaded && !hasSavedServices
  const serviceTextRequired = !savedServicesLoaded && serviceText.trim() === ""
  const localityMissing = localityText.trim() === ""
  const generateDisabledReason = servicesBlocked
    ? "No saved services for this location yet. Add or select services in Business profile before generating queries."
    : serviceTextRequired && localityMissing
      ? "Enter a service and a locality to generate queries."
      : serviceTextRequired
        ? "Enter a service to generate queries."
        : localityMissing
          ? "Enter a locality to generate queries."
          : null
  const generateDisabled =
    servicesBlocked || serviceTextRequired || localityMissing || generating

  const enabledMapCount = countEnabledLocalSeoMapDrafts(queryDrafts)
  const slotsFull = enabledMapCount >= LOCAL_SEO_QUERY_COUNT
  const recordsById = new Map(queryRecords.map((record) => [record.id, record]))
  const landmarkNamesById = new Map(
    (landmarks ?? []).map((landmark) => [landmark.id, landmark.name])
  )
  const landmarkCount = landmarks?.length ?? null

  function updateDraft(
    index: number,
    patch: Partial<LocalSeoLocationQueryDraft>
  ) {
    const next = [...queryDrafts]
    next[index] = { ...queryDrafts[index], ...patch }
    onQueryDraftsChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field className="gap-2">
        <FieldLabel htmlFor="map-setup-radius">
          Sampling radius in metres
        </FieldLabel>
        <Input
          id="map-setup-radius"
          inputMode="numeric"
          value={String(radiusM)}
          aria-invalid={radiusError !== null}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
        />
        <Slider
          aria-label="Sampling radius slider"
          min={LOCAL_SEO_MIN_RADIUS_M}
          max={LOCAL_SEO_MAX_RADIUS_M}
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
            if (next !== undefined) onRadiusChange(next)
          }}
        />
        <FieldDescription>
          Grid size is fixed at 3x3. Between {LOCAL_SEO_MIN_RADIUS_M} and{" "}
          {LOCAL_SEO_MAX_RADIUS_M} metres.
        </FieldDescription>
        {radiusError ? <FieldError>{radiusError}</FieldError> : null}
      </Field>

      {savedServicesLoaded ? (
        <Field className="gap-2">
          <FieldLabel>Saved services</FieldLabel>
          {hasSavedServices ? (
            <FieldDescription>
              Generation uses the saved services:{" "}
              {(effectiveServices ?? []).join(" · ")}.
            </FieldDescription>
          ) : (
            <FieldDescription>
              No saved services for this location yet. Add or select services in
              Business profile before generating queries.
            </FieldDescription>
          )}
        </Field>
      ) : (
        <Field className="gap-2">
          <FieldLabel htmlFor="map-setup-service">Service text</FieldLabel>
          <Input
            id="map-setup-service"
            value={serviceText}
            autoComplete="off"
            onChange={(event) => onServiceTextChange(event.target.value)}
          />
        </Field>
      )}

      <Field className="gap-2">
        <FieldLabel htmlFor="map-setup-locality">Locality</FieldLabel>
        <Input
          id="map-setup-locality"
          value={localityText}
          autoComplete="off"
          onChange={(event) => onLocalityTextChange(event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          id="map-setup-generate"
          aria-describedby={
            generateDisabledReason ? "map-setup-generate-guidance" : undefined
          }
          disabled={generateDisabled}
          onClick={onGenerate}
        >
          {generating ? "Generating…" : "Generate queries · Free"}
        </Button>
      </div>
      {generateDisabledReason ? (
        <FieldDescription id="map-setup-generate-guidance">
          {generateDisabledReason}
        </FieldDescription>
      ) : null}
      {generateError ? <FieldError>{generateError}</FieldError> : null}

      <div className="flex flex-col gap-2">
        <FieldLabel>Landmarks</FieldLabel>
        <FieldDescription>
          Google Places Nearby discovery costs 0 application credits; Google
          bills the Places call separately. Saved landmarks add one{" "}
          {"{service} near {landmark}"} candidate per saved service.
        </FieldDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            id="map-setup-refresh-landmarks"
            disabled={refreshingLandmarks}
            onClick={onRefreshLandmarks}
          >
            {refreshingLandmarks ? "Refreshing…" : "Refresh landmarks · 0 credits"}
          </Button>
          {landmarksError ? null : (
            <span
              className="text-xs text-muted-foreground tabular-nums"
              data-slot="landmark-count"
            >
              {landmarkCount === null
                ? "Loading saved landmarks…"
                : `${landmarkCount} saved landmark${landmarkCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        {landmarksError ? <FieldError>{landmarksError}</FieldError> : null}
        {refreshLandmarksError ? (
          <FieldError>{refreshLandmarksError}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <FieldDescription
          id="map-setup-enabled-count"
          role="status"
          className="tabular-nums"
        >
          {enabledMapCount} of {LOCAL_SEO_QUERY_COUNT} map queries enabled. A
          run prices 1 to 5.
        </FieldDescription>
        {queryDrafts.length === 0 ? (
          <FieldDescription>
            No queries yet. Add or select services, then press Generate queries,
            or use Add query to write one by hand.
          </FieldDescription>
        ) : null}
        {queryDrafts.map((draft, index) => {
          const record = draft.id ? recordsById.get(draft.id) : undefined
          const landmarkName = record?.landmark_id
            ? landmarkNamesById.get(record.landmark_id)
            : undefined
          const originLabel =
            record?.origin === "landmark"
              ? landmarkName
                ? `Landmark: ${landmarkName}`
                : "Landmark"
              : draft.source === "generated"
                ? "Generated"
                : "Manual"
          const enableBlocked = !draft.enabled && slotsFull
          return (
            <Field
              key={draft.id ?? `new-${index}`}
              className="gap-2"
              data-query-record-id={draft.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={draft.enabled}
                  disabled={enableBlocked}
                  aria-label={`Enable query ${index + 1}`}
                  onCheckedChange={(checked) =>
                    updateDraft(index, { enabled: checked })
                  }
                />
                <FieldLabel htmlFor={`map-setup-query-${index}`}>
                  Query {index + 1}
                </FieldLabel>
                <span
                  className="ml-auto text-xs text-muted-foreground"
                  data-query-origin={record?.origin ?? draft.source}
                >
                  {originLabel}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  id={`map-setup-query-${index}`}
                  value={draft.text}
                  autoComplete="off"
                  aria-invalid={draftsError !== null}
                  onChange={(event) =>
                    updateDraft(index, { text: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onQueryDraftsChange(
                      queryDrafts.filter((_, i) => i !== index)
                    )
                  }
                  aria-label={`Remove query ${index + 1}`}
                >
                  Remove
                </Button>
              </div>
            </Field>
          )
        })}
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onQueryDraftsChange(addLocalSeoQueryDraft(queryDrafts))
            }
          >
            Add query
          </Button>
        </div>
      </div>
      {draftsError ? <FieldError>{draftsError}</FieldError> : null}
      {saveError ? <FieldError>{saveError}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={draftsError !== null || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save queries"}
        </Button>
      </div>
    </div>
  )
}
