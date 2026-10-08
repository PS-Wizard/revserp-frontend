import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Textarea } from "~/components/ui/textarea"

/** Edits the location's own services copy; saved only with the local profile. */
export function LocationProfileServicesField({
  services,
  disabled,
  onChange,
}: {
  services: string[]
  disabled?: boolean
  onChange: (services: string[]) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor="location-profile-services">
        Location services
      </FieldLabel>
      <Textarea
        className="min-h-24 resize-none"
        disabled={disabled}
        id="location-profile-services"
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line !== "")
          )
        }
        placeholder={"Coffee\nPastries"}
        value={services.join("\n")}
      />
      <FieldDescription>
        This location&apos;s own copy. Saved with the profile; the project
        catalog and live inherited services stay untouched.
      </FieldDescription>
    </Field>
  )
}
