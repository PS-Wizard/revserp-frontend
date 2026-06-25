import { CompileLoader } from "~/components/compile-loader"
import { Button } from "~/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import type { ProjectResponse } from "~/lib/api.types"

type BusinessProfileDrawerProps = {
  brandName: string
  businessDescription: string
  businessProfileError: string
  businessProfileProject: ProjectResponse | null
  canManageBusinessProfile: boolean
  isLoadingBusinessProfile: boolean
  isSavingBusinessProfile: boolean
  primaryCategory: string
  primaryLocation: string
  seedPrompts: string[]
  websiteUrl: string
  onBrandNameChange: (value: string) => void
  onBusinessDescriptionChange: (value: string) => void
  onClose: () => void
  onPrimaryCategoryChange: (value: string) => void
  onPrimaryLocationChange: (value: string) => void
  onSeedPromptChange: (index: number, value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onWebsiteUrlChange: (value: string) => void
}

export function BusinessProfileDrawer({
  brandName,
  businessDescription,
  businessProfileError,
  businessProfileProject,
  canManageBusinessProfile,
  isLoadingBusinessProfile,
  isSavingBusinessProfile,
  primaryCategory,
  primaryLocation,
  seedPrompts,
  websiteUrl,
  onBrandNameChange,
  onBusinessDescriptionChange,
  onClose,
  onPrimaryCategoryChange,
  onPrimaryLocationChange,
  onSeedPromptChange,
  onSubmit,
  onWebsiteUrlChange,
}: BusinessProfileDrawerProps) {
  const fieldsDisabled =
    isLoadingBusinessProfile ||
    isSavingBusinessProfile ||
    !canManageBusinessProfile

  return (
    <Drawer
      direction="bottom"
      onOpenChange={(open) => !open && onClose()}
      open={businessProfileProject !== null}
    >
      <DrawerContent className="max-h-[88vh]">
        <form
          className="mx-auto flex min-h-0 w-full max-w-5xl flex-col"
          onSubmit={onSubmit}
        >
          <DrawerHeader>
            <DrawerTitle>Business profile</DrawerTitle>
            <DrawerDescription>
              {getDrawerDescription(businessProfileProject)}
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {isLoadingBusinessProfile ? (
              <div className="flex min-h-72 items-center justify-center">
                <CompileLoader className="text-foreground" size={24} />
              </div>
            ) : (
              <BusinessProfileFields
                brandName={brandName}
                businessDescription={businessDescription}
                canManageBusinessProfile={canManageBusinessProfile}
                disabled={fieldsDisabled}
                primaryCategory={primaryCategory}
                primaryLocation={primaryLocation}
                seedPrompts={seedPrompts}
                websiteUrl={websiteUrl}
                onBrandNameChange={onBrandNameChange}
                onBusinessDescriptionChange={onBusinessDescriptionChange}
                onPrimaryCategoryChange={onPrimaryCategoryChange}
                onPrimaryLocationChange={onPrimaryLocationChange}
                onSeedPromptChange={onSeedPromptChange}
                onWebsiteUrlChange={onWebsiteUrlChange}
              />
            )}

            {businessProfileError ? (
              <p className="pt-4 text-sm text-destructive">
                {businessProfileError}
              </p>
            ) : null}
          </div>

          <DrawerFooter className="mx-auto w-full max-w-5xl flex-row justify-end border-t border-border/50">
            <Button onClick={onClose} type="button" variant="outline">
              Close
            </Button>
            <Button
              disabled={
                !canManageBusinessProfile ||
                isLoadingBusinessProfile ||
                isSavingBusinessProfile
              }
              type="submit"
            >
              {isSavingBusinessProfile ? (
                <CompileLoader className="text-primary-foreground" size={18} />
              ) : null}
              {isSavingBusinessProfile ? "Saving..." : "Save profile"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

type BusinessProfileFieldsProps = {
  brandName: string
  businessDescription: string
  canManageBusinessProfile: boolean
  disabled: boolean
  primaryCategory: string
  primaryLocation: string
  seedPrompts: string[]
  websiteUrl: string
  onBrandNameChange: (value: string) => void
  onBusinessDescriptionChange: (value: string) => void
  onPrimaryCategoryChange: (value: string) => void
  onPrimaryLocationChange: (value: string) => void
  onSeedPromptChange: (index: number, value: string) => void
  onWebsiteUrlChange: (value: string) => void
}

function BusinessProfileFields({
  brandName,
  businessDescription,
  canManageBusinessProfile,
  disabled,
  primaryCategory,
  primaryLocation,
  seedPrompts,
  websiteUrl,
  onBrandNameChange,
  onBusinessDescriptionChange,
  onPrimaryCategoryChange,
  onPrimaryLocationChange,
  onSeedPromptChange,
  onWebsiteUrlChange,
}: BusinessProfileFieldsProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="business-brand-name">Brand name</FieldLabel>
        <Input
          disabled={disabled}
          id="business-brand-name"
          onChange={(event) => onBrandNameChange(event.target.value)}
          placeholder="Revserp.ai"
          value={brandName}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="business-website-url">Website URL</FieldLabel>
        <Input
          disabled={disabled}
          id="business-website-url"
          onChange={(event) => onWebsiteUrlChange(event.target.value)}
          placeholder="https://revserp.ai"
          value={websiteUrl}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="business-primary-category">
            Primary category
          </FieldLabel>
          <Input
            disabled={disabled}
            id="business-primary-category"
            onChange={(event) => onPrimaryCategoryChange(event.target.value)}
            placeholder="SEO software"
            value={primaryCategory}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="business-primary-location">
            Primary location
          </FieldLabel>
          <Input
            disabled={disabled}
            id="business-primary-location"
            onChange={(event) => onPrimaryLocationChange(event.target.value)}
            placeholder="United States"
            value={primaryLocation}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="business-description">
          Business description
        </FieldLabel>
        <Textarea
          className="min-h-32 resize-none"
          disabled={disabled}
          id="business-description"
          onChange={(event) => onBusinessDescriptionChange(event.target.value)}
          placeholder="Describe the business, audience, products, services, and positioning..."
          value={businessDescription}
        />
      </Field>

      <Field>
        <FieldLabel>Seed prompts</FieldLabel>
        <FieldDescription>
          Starting prompts used for AI audits. Fill up to 5 prompts.
        </FieldDescription>
        <div className="grid gap-3">
          {seedPrompts.map((prompt, index) => (
            <Input
              disabled={disabled}
              key={`seed-prompt-${index + 1}`}
              onChange={(event) =>
                onSeedPromptChange(index, event.target.value)
              }
              placeholder={`Enter prompt ${index + 1}...`}
              value={prompt}
            />
          ))}
        </div>
      </Field>

      {!canManageBusinessProfile ? (
        <p className="text-sm text-muted-foreground">
          View-only access. Workspace owners can update this profile.
        </p>
      ) : null}
    </FieldGroup>
  )
}

function getDrawerDescription(project: ProjectResponse | null) {
  if (!project) {
    return "Project business context for AI audits."
  }

  return `${project.name} business context for AI audits.`
}
