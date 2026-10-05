import {
  LOCAL_SEO_MAX_RADIUS_M,
  LOCAL_SEO_MIN_RADIUS_M,
  LOCAL_SEO_QUERY_COUNT,
  validateEditableLocalSeoQueries,
  validateLocalSeoRadiusM,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field"
import { Slider } from "~/components/ui/slider"

export function LocalSeoMapSetupContent({
  radiusM,
  onRadiusChange,
  serviceText,
  onServiceTextChange,
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
}: {
  radiusM: number
  onRadiusChange: (radiusM: number) => void
  serviceText: string
  onServiceTextChange: (value: string) => void
  localityText: string
  onLocalityTextChange: (value: string) => void
  queryDrafts: string[]
  onQueryDraftsChange: (next: string[]) => void
  onGenerate: () => void
  generating: boolean
  generateError: string | null
  onSave: () => void
  saving: boolean
  saveError: string | null
}) {
  const radiusError = validateLocalSeoRadiusM(radiusM)
  const draftsError = validateEditableLocalSeoQueries(queryDrafts)

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

      <Field className="gap-2">
        <FieldLabel htmlFor="map-setup-service">Service text</FieldLabel>
        <Input
          id="map-setup-service"
          value={serviceText}
          autoComplete="off"
          onChange={(event) => onServiceTextChange(event.target.value)}
        />
      </Field>

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
          disabled={
            serviceText.trim() === "" ||
            localityText.trim() === "" ||
            generating
          }
          onClick={onGenerate}
        >
          {generating ? "Generating…" : "Generate queries · Free"}
        </Button>
      </div>
      {generateError ? <FieldError>{generateError}</FieldError> : null}

      <div className="flex flex-col gap-2">
        {queryDrafts.length === 0 ? (
          <FieldDescription>
            No queries. An empty list stays empty; a run needs between one and{" "}
            {LOCAL_SEO_QUERY_COUNT}.
          </FieldDescription>
        ) : null}
        {queryDrafts.map((draft, index) => (
          <Field key={index} className="gap-2">
            <FieldLabel htmlFor={`map-setup-query-${index}`}>
              Query {index + 1}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id={`map-setup-query-${index}`}
                value={draft}
                autoComplete="off"
                aria-invalid={draftsError !== null}
                onChange={(event) => {
                  const next = [...queryDrafts]
                  next[index] = event.target.value
                  onQueryDraftsChange(next)
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onQueryDraftsChange(queryDrafts.filter((_, i) => i !== index))
                }
                aria-label={`Remove query ${index + 1}`}
              >
                Remove
              </Button>
            </div>
          </Field>
        ))}
        {queryDrafts.length < LOCAL_SEO_QUERY_COUNT ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onQueryDraftsChange([...queryDrafts, ""])}
            >
              Add query
            </Button>
          </div>
        ) : null}
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
