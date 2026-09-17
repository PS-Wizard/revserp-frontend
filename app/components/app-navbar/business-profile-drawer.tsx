import {
  Building2,
  ChevronRight,
  ListChecks,
  MapPin,
  Package,
  RefreshCw,
  Sparkles,
  Swords,
  Tags,
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
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import type { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import type { ProjectAIQuestionsResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

// Full width on small screens, half on larger. The same data attribute the
// drawer primitive uses keeps these in one tailwind-merge group, so they replace
// the built-in w-3/4 and sm:max-w-sm instead of fighting them.
const SIDE_DRAWER_WIDTH =
  "data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:w-1/2 data-[vaul-drawer-direction=right]:sm:max-w-none"

// The Revbot island is z-[100] and its menus are z-[110]/z-[120], so a plain
// z-50 drawer opens underneath them.
const SIDE_DRAWER_LAYER = "z-[130]"

const selectableTextClass = "select-text [user-select:text] [touch-action:auto]"

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
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    productDescription,
    targetAudience,
    businessCompetitors,
    brandedKeywords,
    nonBrandedKeywords,
    targetKeywords,
    seedPrompts,
    duplicateKeywords,
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
    setBrandedKeywords,
    setNonBrandedKeywords,
    setTargetKeywords,
  } = businessProfile

  const [keywordsOpen, setKeywordsOpen] = useState(false)
  const [competitorsOpen, setCompetitorsOpen] = useState(false)
  const [seedPromptsOpen, setSeedPromptsOpen] = useState(false)

  const fieldsDisabled =
    isLoadingBusinessProfile ||
    isSavingBusinessProfile ||
    !canManageBusinessProfile

  const hasDuplicateKeywords = duplicateKeywords.length > 0
  const questionCount = aiQuestions?.questions.length ?? 0

  function closeNestedDrawers() {
    setKeywordsOpen(false)
    setCompetitorsOpen(false)
    setSeedPromptsOpen(false)
  }

  function closeAllDrawers() {
    closeNestedDrawers()
    closeBusinessProfileDrawer()
  }

  return (
    <Drawer
      direction="right"
      open={businessProfileProject !== null}
      onOpenChange={(open) => {
        if (open) return
        closeAllDrawers()
      }}
    >
      <DrawerContent
        className={cn(SIDE_DRAWER_WIDTH, SIDE_DRAWER_LAYER)}
        overlayClassName={SIDE_DRAWER_LAYER}
      >
        {businessProfileProject ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSaveBusinessProfile}
          >
            <DrawerHeader className="pb-2">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <DrawerTitle>Business profile</DrawerTitle>
                  <DrawerDescription className="mt-0.5 truncate">
                    Context that grounds AI audits and generated questions for{" "}
                    {businessProfileProject.name}.
                  </DrawerDescription>
                </div>
              </div>
            </DrawerHeader>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6">
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
                <div className="flex flex-col gap-6">
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
                          onChange={(event) => setBrandName(event.target.value)}
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

                  <Separator />

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
                        <FieldDescription>
                          City, district, region, or country.
                        </FieldDescription>
                        <Input
                          disabled={fieldsDisabled}
                          id="business-primary-location"
                          onChange={(event) =>
                            setPrimaryLocation(event.target.value)
                          }
                          placeholder="Kathmandu, Bagmati, Nepal"
                          value={primaryLocation}
                        />
                      </Field>
                    </div>
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-4">
                    <SectionHeading
                      description="What the business sells, and to whom."
                      icon={Package}
                      title="Offer and audience"
                    />
                    <Tabs defaultValue="business">
                      <TabsList className="w-full">
                        <TabsTrigger value="business">Business</TabsTrigger>
                        <TabsTrigger value="product">Products</TabsTrigger>
                        <TabsTrigger value="audience">Audience</TabsTrigger>
                      </TabsList>
                      <TabsContent className="pt-2" value="business">
                        <Field>
                          <FieldDescription>
                            What the business is, its services, and its
                            positioning.
                          </FieldDescription>
                          <Textarea
                            aria-label="Business description"
                            className="min-h-40 resize-none"
                            disabled={fieldsDisabled}
                            id="business-description"
                            onChange={(event) =>
                              setBusinessDescription(event.target.value)
                            }
                            placeholder="We help lean SaaS teams find and fix the SEO problems that cost them traffic..."
                            value={businessDescription}
                          />
                        </Field>
                      </TabsContent>
                      <TabsContent className="pt-2" value="product">
                        <Field>
                          <FieldDescription>
                            The specific things you sell, in plain terms.
                          </FieldDescription>
                          <Textarea
                            aria-label="Product description"
                            className="min-h-40 resize-none"
                            disabled={fieldsDisabled}
                            id="business-product-description"
                            onChange={(event) =>
                              setProductDescription(event.target.value)
                            }
                            placeholder="Technical site audits, keyword coverage tracking, AI visibility checks..."
                            value={productDescription}
                          />
                        </Field>
                      </TabsContent>
                      <TabsContent className="pt-2" value="audience">
                        <Field>
                          <FieldDescription>
                            Who buys this. Segment, industry, budget, or team
                            size.
                          </FieldDescription>
                          <Textarea
                            aria-label="Target audience"
                            className="min-h-40 resize-none"
                            disabled={fieldsDisabled}
                            id="business-target-audience"
                            onChange={(event) =>
                              setTargetAudience(event.target.value)
                            }
                            placeholder="Lean B2B SaaS marketing teams in the US and EU, 5 to 50 people..."
                            value={targetAudience}
                          />
                        </Field>
                      </TabsContent>
                    </Tabs>
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-3">
                    <SectionHeading
                      description="Lists that seed keywords, comparisons, and question generation."
                      icon={Tags}
                      title="Keywords and context"
                    />
                    <SectionRow
                      description="Branded, non-branded, and target keywords."
                      icon={Tags}
                      label="Keywords"
                      meta={
                        hasDuplicateKeywords
                          ? "Duplicate terms"
                          : `${countList(brandedKeywords)} branded · ${countList(nonBrandedKeywords)} non-branded`
                      }
                      onOpen={() => setKeywordsOpen(true)}
                      warn={hasDuplicateKeywords}
                    />
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
                  </section>

                  <Separator />

                  <AIGeneratedQuestions
                    aiQuestions={aiQuestions}
                    canManage={canManageBusinessProfile}
                    isLoading={isLoadingAIQuestions}
                    isRegenerating={isRegeneratingAIQuestions}
                    onRegenerate={regenerateAIQuestions}
                    questionCount={questionCount}
                  />

                  {!canManageBusinessProfile ? (
                    <p className="text-sm text-muted-foreground">
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

            <DrawerFooter className="flex-row items-center justify-end gap-2 border-t border-border/50">
              <Button onClick={closeAllDrawers} type="button" variant="outline">
                Close
              </Button>
              <Button
                disabled={
                  !canManageBusinessProfile ||
                  !hasUnsavedChanges ||
                  hasDuplicateKeywords ||
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
        ) : null}

        <DrawerNested
          direction="right"
          onOpenChange={setKeywordsOpen}
          open={keywordsOpen}
        >
          <DrawerContent
            className={cn(SIDE_DRAWER_WIDTH, SIDE_DRAWER_LAYER)}
            overlayClassName={SIDE_DRAWER_LAYER}
          >
            <DrawerHeader>
              <DrawerTitle>Keywords</DrawerTitle>
              <DrawerDescription>
                Branded and non-branded terms seed the target list. The same
                term cannot appear in both.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <Field data-invalid={hasDuplicateKeywords}>
                  <FieldLabel htmlFor="business-branded-keywords">
                    Branded keywords
                  </FieldLabel>
                  <FieldDescription>
                    Terms that include your brand name.
                  </FieldDescription>
                  <Textarea
                    className="min-h-24 resize-none"
                    disabled={fieldsDisabled}
                    id="business-branded-keywords"
                    onChange={(event) => setBrandedKeywords(event.target.value)}
                    placeholder={"revserp\nrevserp ai audit"}
                    value={brandedKeywords}
                  />
                </Field>
                <Field data-invalid={hasDuplicateKeywords}>
                  <FieldLabel htmlFor="business-non-branded-keywords">
                    Non-branded keywords
                  </FieldLabel>
                  <FieldDescription>
                    Terms customers search for without your brand.
                  </FieldDescription>
                  <Textarea
                    className="min-h-24 resize-none"
                    disabled={fieldsDisabled}
                    id="business-non-branded-keywords"
                    onChange={(event) =>
                      setNonBrandedKeywords(event.target.value)
                    }
                    placeholder={"seo audit\nsite crawler\nai visibility"}
                    value={nonBrandedKeywords}
                  />
                </Field>
                {hasDuplicateKeywords ? (
                  <FieldDescription className="text-destructive">
                    In both lists: {duplicateKeywords.join(", ")}. Remove these
                    from one list before saving.
                  </FieldDescription>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="business-target-keywords">
                    Target keywords
                  </FieldLabel>
                  <FieldDescription>
                    Normally written by Revbot from the Keywords tab, with Find
                    keywords. You can still edit the list here.
                  </FieldDescription>
                  <Textarea
                    className="min-h-24 resize-none"
                    defaultValue={targetKeywords}
                    disabled={fieldsDisabled}
                    id="business-target-keywords"
                    key={targetKeywords}
                    onChange={(event) => setTargetKeywords(event.target.value)}
                    placeholder={"seo audit\nsite crawler\nai visibility"}
                  />
                </Field>
              </FieldGroup>
            </div>
            <DrawerFooter className="flex-row justify-end">
              <Button
                onClick={() => setKeywordsOpen(false)}
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
                <FieldDescription>
                  One per line, or separated by commas.
                </FieldDescription>
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
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/50">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
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
        "flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
        warn && "border-destructive/50"
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
}: {
  aiQuestions: ProjectAIQuestionsResponse | null
  canManage: boolean
  isLoading: boolean
  isRegenerating: boolean
  onRegenerate: () => void
  questionCount: number
}) {
  const locationQuestion = aiQuestions?.location_questions?.[0] ?? ""
  const hasQuestions = questionCount > 0

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              AI generated questions
              {hasQuestions ? (
                <Badge className="px-1.5 text-[10px]" variant="secondary">
                  {questionCount}
                </Badge>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used to check your visibility across AI models.
            </p>
          </div>
        </div>
        <Button
          disabled={!canManage || isLoading || isRegenerating}
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

      {isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-border/60">
          <ThinkingOrb
            aria-label="Loading generated questions"
            className="shrink-0"
            size={20}
            state="searching"
          />
        </div>
      ) : isRegenerating && !hasQuestions ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">Generating questions…</p>
        </div>
      ) : !hasQuestions ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">
            Save your profile to generate questions.
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
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
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
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No Maps query yet. Add a primary location, then regenerate.
            </p>
          )}

          {aiQuestions && !isRegenerating ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Generated {new Date(aiQuestions.generated_at).toLocaleString()}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
