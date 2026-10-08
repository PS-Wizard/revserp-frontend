"use client"

import { FieldDescription, FieldError } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

import {
  normalizeLocationWebsiteScopeUrl,
  validateLocationWebsiteScopeInput,
  type LocationWebsiteScopeMatch,
} from "./location-website-scope"

export const LOCATION_WEBSITE_SCOPE_MATCH_OPTIONS: ReadonlyArray<{
  value: LocationWebsiteScopeMatch
  title: string
  hint: string
}> = [
  {
    value: "exact",
    title: "Exact page",
    hint: "One page only, e.g. the location landing page.",
  },
  {
    value: "subtree",
    title: "Page subtree",
    hint: "The page and its descendants, e.g. /locations/springfield/.",
  },
  {
    value: "none",
    title: "No branch scope",
    hint: "Removes the branch audit; keeps history readable.",
  },
]

export type LocationWebsiteScopeFieldsValue = {
  match: LocationWebsiteScopeMatch
  url: string
}

/**
 * Client-side origin warning. It mirrors the server rule so a foreign page is
 * caught before the save round trip: pages outside the parent website can never
 * match, so they are never silently stored. Returns null when unknown.
 */
export function locationWebsiteScopeOriginError(
  value: LocationWebsiteScopeFieldsValue,
  parentUrl?: string | null
): string | null {
  if (value.match === "none") return null
  if (parentUrl == null || parentUrl.trim() === "") return null
  const scope = normalizeLocationWebsiteScopeUrl(value.url)
  const parent = normalizeLocationWebsiteScopeUrl(parentUrl)
  if (scope === null || parent === null) return null
  if (new URL(scope).origin !== new URL(parent).origin) {
    return "This page is outside the parent website and will never match."
  }
  return null
}

/**
 * Shared branch scope input used by both the scope settings dialog and the
 * location creation wizard, so creation and later editing cannot drift.
 * Controlled: callers own value and validate with the same helper before
 * saving. Long titles and URLs wrap instead of widening the dialog.
 */
export function LocationWebsiteScopeFields({
  value,
  onChange,
  parentUrl,
  idPrefix = "location-website-scope",
  urlDescription = "Must live on the parent website. Query and fragment are ignored when matching stored pages.",
}: {
  value: LocationWebsiteScopeFieldsValue
  onChange: (value: LocationWebsiteScopeFieldsValue) => void
  parentUrl?: string | null
  idPrefix?: string
  urlDescription?: string
}) {
  const validationError = validateLocationWebsiteScopeInput(
    value.url,
    value.match
  )
  const error =
    validationError ?? locationWebsiteScopeOriginError(value, parentUrl)
  const urlId = `${idPrefix}-url`
  const groupName = `${idPrefix}-match`

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        aria-label="Scope type"
        className="flex min-w-0 flex-col gap-2"
        role="radiogroup"
      >
        {LOCATION_WEBSITE_SCOPE_MATCH_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-checked:border-primary/60"
          >
            <input
              checked={value.match === option.value}
              className="mt-1 shrink-0 accent-primary"
              name={groupName}
              type="radio"
              value={option.value}
              onChange={() => onChange({ ...value, match: option.value })}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium break-words">
                {option.title}
              </span>
              <span className="block text-xs break-words text-muted-foreground">
                {option.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {value.match !== "none" ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={urlId}>Page URL</Label>
          <Input
            aria-invalid={error !== null}
            autoComplete="off"
            className="min-w-0"
            id={urlId}
            inputMode="url"
            placeholder="https://example.com/locations/springfield/"
            spellCheck={false}
            value={value.url}
            onChange={(event) =>
              onChange({ ...value, url: event.target.value })
            }
          />
          <FieldDescription>{urlDescription}</FieldDescription>
          {validationError ? <FieldError>{validationError}</FieldError> : null}
        </div>
      ) : null}
      {validationError === null && error ? (
        <FieldError>{error}</FieldError>
      ) : null}
    </div>
  )
}
