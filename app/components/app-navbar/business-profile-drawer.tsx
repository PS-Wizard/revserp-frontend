import {
  Building2,
  ChevronRight,
  ListChecks,
  MapPin,
  Package,
  RefreshCw,
  Sparkles,
  Swords,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { ThinkingOrb } from "thinking-orbs"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNested,
  DrawerTitle,
} from "~/components/ui/drawer"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { BusinessProfileServicesEditor } from "~/components/business-profile-services-editor"
import { LocationProfileServicesField } from "~/components/app-navbar/location-profile-services-field"
import type { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import type { ProjectAIQuestionsResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

// Nested drawers (Keywords, Competitors, Seed prompts) keep the right-side
// width: full width on small screens, half on larger. The same data attribute
// the drawer primitive uses keeps these in one tailwind-merge group, so they
// replace the built-in w-3/4 and sm:max-w-sm instead of fighting them.
const SIDE_DRAWER_WIDTH =
  "data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:w-1/2 data-[vaul-drawer-direction=right]:sm:max-w-none"

// The business profile panel is a fullscreen bottom sheet that covers the
// sidebar and top navbar, so it needs its own sizing rather than
// SIDE_DRAWER_WIDTH. It overrides the primitive's bottom-sheet cap
// (max-h-[80vh]), top margin and rounded top edge. dvh keeps it flush to the
// viewport on mobile, where the browser chrome would otherwise clip it.
const FULLSCREEN_SHEET =
  "overflow-hidden data-[vaul-drawer-direction=bottom]:h-[100dvh] data-[vaul-drawer-direction=bottom]:max-h-none data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:rounded-none data-[vaul-drawer-direction=bottom]:rounded-t-none"

// The Revbot island is z-[100] and its menus are z-[110]/z-[120], so a plain
// z-50 drawer opens underneath them.
const SIDE_DRAWER_LAYER = "z-[130]"

const selectableTextClass = "select-text [user-select:text] [touch-action:auto]"

// One type scale. Section title > section description > field label (the Label
// primitive default: text-sm font-medium) > hint. One vertical rhythm too:
// gap-8 between sections, gap-4 inside a field grid or stack.
const SECTION_TITLE_CLASS = "text-base font-semibold tracking-tight"
const SECTION_DESCRIPTION_CLASS = "text-sm text-muted-foreground"
const HINT_CLASS = "text-xs text-muted-foreground"

type BusinessProfileState = ReturnType<typeof useBusinessProfile>

function countList(value: string) {
  return value.split(/[\n,]+/).filter((part) => part.trim()).length
}

export function BusinessProfileDrawer({
  businessProfile,
}: {
  businessProfile: BusinessProfileState
}) {
  const {
    businessProfileProject,
    businessProfileLocationId,
    businessProfileLocationName,
    isLocationScoped,
    profileServices,
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    productDescription,
    targetAudience,
    businessCompetitors,
    seedPrompts,
    businessProfileError,
    isLoadingBusinessProfile,
    isSavingBusinessProfile,
    canManageBusinessProfile,
    aiQuestions,
    isLoadingAIQuestions,
    isRegeneratingAIQuestions,
    hasUnsavedChanges,
    closeBusinessProfileDrawer,
    regenerateAIQuestions,
    saveAIQuestions,
    handleSaveBusinessProfile,
    updateSeedPrompt,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
    setProductDescription,
    setTargetAudience,
    setBusinessCompetitors,
    setProfileServices,
  } = businessProfile

  const [competitorsOpen, setCompetitorsOpen] = useState(false)
  const [seedPromptsOpen, setSeedPromptsOpen] = useState(false)

  const fieldsDisabled =
    isLoadingBusinessProfile ||
    isSavingBusinessProfile ||
    !canManageBusinessProfile

  const questionCount = aiQuestions?.questions.length ?? 0

  function closeNestedDrawers() {
    setCompetitorsOpen(false)
    setSeedPromptsOpen(false)
  }

  function closeAllDrawers() {
    closeNestedDrawers()
    closeBusinessProfileDrawer()
  }

  return (
    <Drawer
      direction="bottom"
      open={businessProfileProject !== null}
      repositionInputs={false}
      onOpenChange={(open) => {
        if (open) return
        closeAllDrawers()
      }}
    >
      <DrawerContent
        className={cn(FULLSCREEN_SHEET, SIDE_DRAWER_LAYER)}
        overlayClassName={SIDE_DRAWER_LAYER}
      >
        {businessProfileProject ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSaveBusinessProfile}
          >
            <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-3 sm:px-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DrawerTitle>Business profile</DrawerTitle>
                  {isLocationScoped ? (
                    <Badge className="px-1.5" variant="secondary">
                      Location
                    </Badge>
                  ) : null}
                </div>
                <DrawerDescription className="truncate">
                  {businessProfileLocationName
                    ? `${businessProfileLocationName} · ${businessProfileProject.name}`
                    : businessProfileProject.name}
                </DrawerDescription>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  onClick={closeAllDrawers}
                  type="button"
                  variant="outline"
                >
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
              </div>
            </header>

            <div
              className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
              data-vaul-no-drag
            >
              <div
                className="min-w-0 px-4 py-6 sm:px-6 lg:flex-1 lg:overflow-y-auto"
                data-vaul-no-drag
              >
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
                  <div className="flex flex-col gap-8">
                    <section className="flex flex-col gap-4">
                      <SectionHeading
                        description="How customers and AI models identify the business."
                        icon={Building2}
                        title="Identity"
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="business-brand-name">
                            Brand name
                          </FieldLabel>
                          <Input
                            disabled={fieldsDisabled}
                            id="business-brand-name"
                            onChange={(event) =>
                              setBrandName(event.target.value)
                            }
                            placeholder="Revserp.ai"
                            value={brandName}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="business-website-url">
                            Website URL
                          </FieldLabel>
                          <Input
                            disabled={fieldsDisabled}
                            id="business-website-url"
                            onChange={(event) =>
                              setWebsiteUrl(event.target.value)
                            }
                            placeholder="https://revserp.ai"
                            value={websiteUrl}
                          />
                        </Field>
                      </div>
                    </section>

                    <section className="flex flex-col gap-4">
                      <SectionHeading
                        description="Used for the Maps visibility test and location questions."
                        icon={MapPin}
                        title="Category and location"
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="business-primary-category">
                            Primary category
                          </FieldLabel>
                          <Input
                            disabled={fieldsDisabled}
                            id="business-primary-category"
                            onChange={(event) =>
                              setPrimaryCategory(event.target.value)
                            }
                            placeholder="SEO software"
                            value={primaryCategory}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="business-primary-location">
                            Primary location
                          </FieldLabel>
                          <Input
                            disabled={fieldsDisabled}
                            id="business-primary-location"
                            onChange={(event) =>
                              setPrimaryLocation(event.target.value)
                            }
                            placeholder="Kathmandu, Bagmati, Nepal"
                            value={primaryLocation}
                          />
                          <FieldDescription className={HINT_CLASS}>
                            City, district, region, or country.
                          </FieldDescription>
                        </Field>
                      </div>
                    </section>

                    <section className="flex flex-col gap-4">
                      <SectionHeading
                        description="What the business sells, and to whom."
                        icon={Package}
                        title="Offer and audience"
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="business-description">
                            Business description
                          </FieldLabel>
                          <Textarea
                            className="field-sizing-content min-h-24 resize-none"
                            disabled={fieldsDisabled}
                            id="business-description"
                            onChange={(event) =>
                              setBusinessDescription(event.target.value)
                            }
                            placeholder="We help lean SaaS teams find and fix the SEO problems that cost them traffic..."
                            value={businessDescription}
                          />
                          <FieldDescription className={HINT_CLASS}>
                            What the business is, its services, and its
                            positioning.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="business-product-description">
                            Products the business sells
                          </FieldLabel>
                          <Textarea
                            className="field-sizing-content min-h-24 resize-none"
                            disabled={fieldsDisabled}
                            id="business-product-description"
                            onChange={(event) =>
                              setProductDescription(event.target.value)
                            }
                            placeholder="Technical site audits, keyword coverage tracking, AI visibility checks..."
                            value={productDescription}
                          />
                          <FieldDescription className={HINT_CLASS}>
                            The products you sell, in plain terms. Services are
                            managed separately in Services the business sells
                            below.
                          </FieldDescription>
                        </Field>
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor="business-target-audience">
                            Target audience
                          </FieldLabel>
                          <Textarea
                            className="field-sizing-content min-h-24 resize-none"
                            disabled={fieldsDisabled}
                            id="business-target-audience"
                            onChange={(event) =>
                              setTargetAudience(event.target.value)
                            }
                            placeholder="Lean B2B SaaS marketing teams in the US and EU, 5 to 50 people..."
                            value={targetAudience}
                          />
                          <FieldDescription className={HINT_CLASS}>
                            Who buys this. Segment, industry, budget, or team
                            size.
                          </FieldDescription>
                        </Field>
                      </div>
                      {businessProfileProject ? (
                        isLocationScoped && businessProfileLocationId ? (
                          <LocationProfileServicesField
                            key={`${businessProfileProject.id}:${businessProfileLocationId}`}
                            services={profileServices}
                            disabled={fieldsDisabled}
                            onChange={setProfileServices}
                          />
                        ) : (
                          <BusinessProfileServicesEditor
                            key={businessProfileProject.id}
                            projectId={businessProfileProject.id}
                            canManage={canManageBusinessProfile}
                            disabled={fieldsDisabled}
                          />
                        )
                      ) : null}
                    </section>

                    <section className="flex flex-col gap-4">
                      <SectionHeading
                        description="Businesses you compare against and starting questions for AI audits."
                        icon={Swords}
                        title="Competitors and seed prompts"
                      />
                      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                        <SectionRow
                          description="Businesses you compete with."
                          icon={Swords}
                          label="Competitors"
                          meta={`${countList(businessCompetitors)}`}
                          onOpen={() => setCompetitorsOpen(true)}
                        />
                        <SectionRow
                          description="Up to 5 starting questions for AI audits."
                          icon={ListChecks}
                          label="Seed prompts"
                          meta={`${seedPrompts.filter((prompt) => prompt.trim()).length} of 5`}
                          onOpen={() => setSeedPromptsOpen(true)}
                        />
                      </div>
                      <p className={HINT_CLASS}>
                        Brand and non-brand keywords now live in the Keywords
                        view, managed separately from this profile.
                      </p>
                    </section>

                    {!canManageBusinessProfile ? (
                      <p className={SECTION_DESCRIPTION_CLASS}>
                        View-only access. Workspace owners can update this
                        profile.
                      </p>
                    ) : null}

                    {businessProfileError ? (
                      <p className="text-sm text-destructive">
                        {businessProfileError}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <aside
                className="shrink-0 border-t border-border/60 px-4 py-6 sm:px-6 lg:w-96 lg:overflow-y-auto lg:border-t-0 lg:border-l xl:w-[28rem]"
                data-vaul-no-drag
              >
                <AIGeneratedQuestions
                  aiQuestions={aiQuestions}
                  canManage={canManageBusinessProfile}
                  editable={isLocationScoped}
                  isLoading={isLoadingAIQuestions}
                  isRegenerating={isRegeneratingAIQuestions}
                  onRegenerate={regenerateAIQuestions}
                  onSaveQuestions={saveAIQuestions}
                  questionCount={questionCount}
                />
              </aside>
            </div>
          </form>
        ) : null}

        <DrawerNested
          direction="right"
          onOpenChange={setCompetitorsOpen}
          open={competitorsOpen}
        >
          <DrawerContent
            className={cn(SIDE_DRAWER_WIDTH, SIDE_DRAWER_LAYER)}
            overlayClassName={SIDE_DRAWER_LAYER}
          >
            <DrawerHeader>
              <DrawerTitle>Competitors</DrawerTitle>
              <DrawerDescription>
                Names used to ground comparison questions.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <Field>
                <FieldLabel htmlFor="business-competitors">
                  Business competitors
                </FieldLabel>
                <Textarea
                  className="min-h-40 resize-none"
                  disabled={fieldsDisabled}
                  id="business-competitors"
                  onChange={(event) =>
                    setBusinessCompetitors(event.target.value)
                  }
                  placeholder={"Ahrefs\nSemrush\nSurfer SEO"}
                  value={businessCompetitors}
                />
                <FieldDescription className={HINT_CLASS}>
                  One per line, or separated by commas.
                </FieldDescription>
              </Field>
            </div>
            <DrawerFooter className="flex-row justify-end">
              <Button
                onClick={() => setCompetitorsOpen(false)}
                type="button"
                variant="outline"
              >
                Done
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </DrawerNested>

        <DrawerNested
          direction="right"
          onOpenChange={setSeedPromptsOpen}
          open={seedPromptsOpen}
        >
          <DrawerContent
            className={cn(SIDE_DRAWER_WIDTH, SIDE_DRAWER_LAYER)}
            overlayClassName={SIDE_DRAWER_LAYER}
          >
            <DrawerHeader>
              <DrawerTitle>Seed prompts</DrawerTitle>
              <DrawerDescription>
                Starting prompts used for AI audits. Fill up to 5.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
              {seedPrompts.map((prompt, index) => (
                <Input
                  disabled={fieldsDisabled}
                  key={`seed-prompt-${index + 1}`}
                  onChange={(event) =>
                    updateSeedPrompt(index, event.target.value)
                  }
                  placeholder={`Enter prompt ${index + 1}...`}
                  value={prompt}
                />
              ))}
            </div>
            <DrawerFooter className="flex-row justify-end">
              <Button
                onClick={() => setSeedPromptsOpen(false)}
                type="button"
                variant="outline"
              >
                Done
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </DrawerNested>
      </DrawerContent>
    </Drawer>
  )
}

function SectionHeading({
  description,
  icon: Icon,
  title,
}: {
  description?: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/50">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <h2 className={SECTION_TITLE_CLASS}>{title}</h2>
        {description ? (
          <p className={cn("mt-1", SECTION_DESCRIPTION_CLASS)}>{description}</p>
        ) : null}
      </div>
    </div>
  )
}

function SectionRow({
  description,
  icon: Icon,
  label,
  meta,
  onOpen,
  warn,
}: {
  description: string
  icon: LucideIcon
  label: string
  meta?: string
  onOpen: () => void
  warn?: boolean
}) {
  return (
    <button
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        warn && "bg-destructive/5"
      )}
      onClick={onOpen}
      type="button"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/50">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {meta ? (
        <span
          className={cn(
            "shrink-0 text-xs whitespace-nowrap text-muted-foreground",
            warn && "font-medium text-destructive"
          )}
        >
          {meta}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function AIGeneratedQuestions({
  aiQuestions,
  canManage,
  isLoading,
  isRegenerating,
  onRegenerate,
  questionCount,
  editable,
  onSaveQuestions,
}: {
  aiQuestions: ProjectAIQuestionsResponse | null
  canManage: boolean
  isLoading: boolean
  isRegenerating: boolean
  onRegenerate: () => void
  questionCount: number
  editable?: boolean
  onSaveQuestions?: (questions: string[]) => Promise<boolean>
}) {
  const locationQuestion = aiQuestions?.location_questions?.[0] ?? ""
  const hasQuestions = questionCount > 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setDraft(aiQuestions?.questions?.length ? [...aiQuestions.questions] : [""])
    setEditing(true)
  }

  async function saveQuestions() {
    if (!onSaveQuestions) return
    setSaving(true)
    const saved = await onSaveQuestions(
      draft.map((question) => question.trim()).filter(Boolean)
    )
    setSaving(false)
    if (saved) setEditing(false)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className={cn("flex items-center gap-2", SECTION_TITLE_CLASS)}>
              AI generated questions
              {hasQuestions ? (
                <Badge className="px-1.5 text-micro" variant="secondary">
                  {questionCount}
                </Badge>
              ) : null}
            </p>
            <p className={cn("mt-1", SECTION_DESCRIPTION_CLASS)}>
              Used to check your visibility across AI models.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editable && hasQuestions && canManage && !editing ? (
            <Button
              disabled={isLoading || isRegenerating}
              onClick={startEditing}
              size="sm"
              type="button"
              variant="ghost"
            >
              Edit
            </Button>
          ) : null}
          <Button
            disabled={!canManage || isLoading || isRegenerating || editing}
            onClick={onRegenerate}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={cn("size-3.5", isRegenerating && "animate-spin")}
            />
            {isRegenerating ? "Regenerating" : "Regenerate"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-border/60">
          <ThinkingOrb
            aria-label="Loading generated questions"
            className="shrink-0"
            size={20}
            state="searching"
          />
        </div>
      ) : editing ? (
        <div className="flex flex-col gap-2" data-vaul-no-drag>
          {draft.map((question, index) => (
            <Textarea
              aria-label={`Question ${index + 1}`}
              className="min-h-16 text-sm"
              key={index}
              onChange={(event) =>
                setDraft((current) =>
                  current.map((value, i) =>
                    i === index ? event.target.value : value
                  )
                )
              }
              value={question}
            />
          ))}
          <div className="flex items-center gap-2">
            <Button
              disabled={saving}
              onClick={saveQuestions}
              size="sm"
              type="button"
            >
              {saving ? "Saving" : "Save questions"}
            </Button>
            <Button
              disabled={saving}
              onClick={() => setDraft((current) => [...current, ""])}
              size="sm"
              type="button"
              variant="ghost"
            >
              Add
            </Button>
            <Button
              disabled={saving}
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : isRegenerating && !hasQuestions ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">Generating questions…</p>
        </div>
      ) : !hasQuestions ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">
            {editable
              ? "Generate or add questions for this location."
              : "Save your profile to generate questions."}
          </p>
        </div>
      ) : (
        <div className={selectableTextClass} data-vaul-no-drag>
          <ol className="flex flex-col gap-2">
            {aiQuestions?.questions.map((question, index) => (
              <li
                className="flex cursor-text gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5"
                key={index}
              >
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-micro font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed">{question}</span>
              </li>
            ))}
          </ol>

          {locationQuestion ? (
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Maps query
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {locationQuestion}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used for the Maps visibility test, not LLM audits.
                </p>
              </div>
            </div>
          ) : !editable ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No Maps query yet. Add a primary location, then regenerate.
            </p>
          ) : null}

          {aiQuestions?.generated_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Generated {new Date(aiQuestions.generated_at).toLocaleString()}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
