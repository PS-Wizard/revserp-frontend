import { ThinkingOrb } from "thinking-orbs"
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
import type { ProjectAIQuestionsResponse, ProjectResponse } from "~/lib/api.types"

type BusinessProfileDrawerProps = {
  aiQuestions: ProjectAIQuestionsResponse | null
  brandName: string
  businessDescription: string
  businessProfileError: string
  businessProfileProject: ProjectResponse | null
  canManageBusinessProfile: boolean
  hasUnsavedChanges: boolean
  isLoadingAIQuestions: boolean
  isLoadingBusinessProfile: boolean
  isRegeneratingAIQuestions: boolean
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
  aiQuestions,
  brandName,
  businessDescription,
  businessProfileError,
  businessProfileProject,
  canManageBusinessProfile,
  hasUnsavedChanges,
  isLoadingAIQuestions,
  isLoadingBusinessProfile,
  isRegeneratingAIQuestions,
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
                <ThinkingOrb
                  aria-label="Loading business profile"
                  className="shrink-0"
                  size={20}
                  state="searching"
                  style={{ width: 24, height: 24 }}
                />
              </div>
            ) : (
              <>
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

                <AIGeneratedQuestions
                  aiQuestions={aiQuestions}
                  isLoading={isLoadingAIQuestions}
                  isRegenerating={isRegeneratingAIQuestions}
                />
              </>
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
                !hasUnsavedChanges ||
                isLoadingBusinessProfile ||
                isSavingBusinessProfile
              }
              type="submit"
            >
              {isSavingBusinessProfile ? (
                <ThinkingOrb
                  aria-hidden="true"
                  className="shrink-0"
                  size={20}
                  state="working"
                  style={{ width: 18, height: 18 }}
                />
              ) : null}
              {isSavingBusinessProfile ? "Saving..." : "Save profile"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}

type AIGeneratedQuestionsProps = {
  aiQuestions: ProjectAIQuestionsResponse | null
  isLoading: boolean
  isRegenerating: boolean
}

function AIGeneratedQuestions({
  aiQuestions,
  isLoading,
  isRegenerating,
}: AIGeneratedQuestionsProps) {
  return (
    <div className="mt-6 border-t border-border/50 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <div>
          <p className="text-sm font-medium">AI generated questions</p>
          <p className="text-xs text-muted-foreground">
            Generated from your seed prompts and business context. Used to check
            your visibility across AI models.
          </p>
        </div>
        {isRegenerating ? (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            Regenerating…
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <ThinkingOrb
            aria-label="Loading generated questions"
            className="shrink-0"
            size={20}
            state="searching"
          />
        </div>
      ) : isRegenerating && !aiQuestions ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">Generating questions…</p>
        </div>
      ) : !aiQuestions || aiQuestions.questions.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Save your profile with seed prompts to generate questions.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {aiQuestions.questions.map((question, index) => (
            <li
              className="flex gap-3 rounded-lg bg-muted/50 px-3 py-2.5"
              key={index}
            >
              <span className="mt-px shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <span className="text-sm leading-relaxed">{question}</span>
            </li>
          ))}
        </ol>
      )}

      {aiQuestions && !isRegenerating ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Generated {new Date(aiQuestions.generated_at).toLocaleString()}
        </p>
      ) : null}
    </div>
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
