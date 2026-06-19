"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LoaderFunctionArgs } from "react-router"
import { useLoaderData } from "react-router"

import { CompileLoader } from "~/components/compile-loader"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "~/components/ui/field"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { Slider } from "~/components/ui/slider"
import { clientApiFetch, clientApiPut, serverApiFetch } from "~/lib/api"
import { ApiError } from "~/lib/api"
import type {
  PillarScoringConfig,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
  ScoringConfig,
  ScoringConfigResponse,
  ScoringPreviewResponse,
} from "~/lib/api.types"
import { requireAuthenticatedUser } from "~/lib/auth.server"
import { cn } from "~/lib/utils"

export async function loader({ request }: LoaderFunctionArgs) {
  const me = await requireAuthenticatedUser(request)
  const requestUrl = new URL(request.url)
  const crawlId = requestUrl.searchParams.get("crawl")

  const scoringConfigResponse = await serverApiFetch<ScoringConfigResponse>(
    "/internal/scoring-config",
    request
  )

  let baselineBreakdown: ScoreBreakdownResponse | null = null
  if (crawlId) {
    try {
      baselineBreakdown = await serverApiFetch<ScoreBreakdownResponse>(
        `/crawls/${crawlId}/score-breakdown`,
        request
      )
    } catch {
      baselineBreakdown = null
    }
  }

  return {
    me,
    config: scoringConfigResponse.config,
    defaultConfig: scoringConfigResponse.default,
    baselineBreakdown,
  }
}

export default function ScoringPage() {
  const { config, defaultConfig, baselineBreakdown } = useLoaderData() as {
    config: ScoringConfig
    defaultConfig: ScoringConfig
    baselineBreakdown: ScoreBreakdownResponse | null
  }

  const [savedConfig] = useState(() => deepClone(config))
  const [draftConfig, setDraftConfig] = useState(() => deepClone(config))
  const [previewBreakdown, setPreviewBreakdown] = useState<ScoreBreakdownResponse | null>(
    baselineBreakdown
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [loadError, setLoadError] = useState("")
  const previewSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const crawlId = useMemo(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("crawl")
  }, [])

  const displayedBreakdown = previewBreakdown ?? baselineBreakdown

  const configuredPillarIds = useMemo(
    () => Object.keys(draftConfig.pillars),
    [draftConfig.pillars]
  )

  const hasDraftChanges = useMemo(
    () => JSON.stringify(savedConfig) !== JSON.stringify(draftConfig),
    [savedConfig, draftConfig]
  )

  const previewScoringConfig = useCallback(async () => {
    if (!draftConfig || !crawlId) return
    abortRef.current?.abort()
    const seq = ++previewSeqRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setIsPreviewing(true)

    try {
      const response = await clientApiFetch<ScoringPreviewResponse>(
        "/internal/scoring-config/preview",
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crawl_id: crawlId, config: draftConfig }),
        }
      )
      if (seq === previewSeqRef.current) {
        setPreviewBreakdown(response.breakdown)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (seq === previewSeqRef.current) {
        setLoadError(error instanceof ApiError ? error.message : "Preview failed")
      }
    } finally {
      if (seq === previewSeqRef.current) {
        setIsPreviewing(false)
      }
    }
  }, [draftConfig, crawlId])

  useEffect(() => {
    if (!draftConfig || !crawlId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      previewScoringConfig()
    }, 260)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draftConfig, crawlId, previewScoringConfig])

  // Reset preview when crawl changes
  const prevCrawlRef = useRef(crawlId)
  if (prevCrawlRef.current !== crawlId) {
    prevCrawlRef.current = crawlId
    setPreviewBreakdown(baselineBreakdown)
  }

  const handleSave = async () => {
    if (!draftConfig) return
    setIsSaving(true)
    setSaveMessage("")
    try {
      const response = await clientApiPut<ScoringConfigResponse>(
        "/internal/scoring-config",
        { config: draftConfig }
      )
      // savedConfig is a state set on load; update draft to match saved
      setDraftConfig(deepClone(response.config))
      setSaveMessage("Saved globally for future crawls.")
    } catch (error) {
      setSaveMessage(error instanceof ApiError ? error.message : "Unable to save scoring config.")
    } finally {
      setIsSaving(false)
    }
  }

  const resetToSaved = () => setDraftConfig(deepClone(savedConfig))
  const resetToDefaults = () => setDraftConfig(deepClone(defaultConfig))

  const updateTopLevel = (key: keyof ScoringConfig, value: number) => {
    setDraftConfig((prev) => ({ ...prev, [key]: value }))
  }
  const updateSeverity = (severity: string, value: number) => {
    setDraftConfig((prev) => ({
      ...prev,
      severity_multipliers: { ...prev.severity_multipliers, [severity]: value },
    }))
  }
  const updateOverallWeight = (pillarId: string, value: number) => {
    setDraftConfig((prev) => ({
      ...prev,
      overall_weights: { ...prev.overall_weights, [pillarId]: value },
    }))
  }
  const updateBucketWeight = (pillarId: string, bucketId: string, value: number) => {
    setDraftConfig((prev) => ({
      ...prev,
      pillars: {
        ...prev.pillars,
        [pillarId]: {
          ...prev.pillars[pillarId],
          bucket_weights: { ...prev.pillars[pillarId].bucket_weights, [bucketId]: value },
        },
      },
    }))
  }
  const updateIssuePenalty = (pillarId: string, issueType: string, value: number) => {
    setDraftConfig((prev) => ({
      ...prev,
      pillars: {
        ...prev.pillars,
        [pillarId]: {
          ...prev.pillars[pillarId],
          issue_penalty_by_type: {
            ...prev.pillars[pillarId].issue_penalty_by_type,
            [issueType]: value,
          },
        },
      },
    }))
  }

  const findPillar = (pillarId: string): ScoreBreakdownPillarResponse | undefined =>
    displayedBreakdown?.pillars.find((p) => p.id === pillarId)

  const scoreDelta = (pillarId: string): number | null => {
    const current = findPillar(pillarId)?.score
    const baseline = baselineBreakdown?.pillars.find((p) => p.id === pillarId)?.score
    return current != null && baseline != null ? current - baseline : null
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[104rem] flex-col gap-6 px-4 py-10 sm:px-6 lg:px-4">
        <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
          <CardHeader className="gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <CardTitle className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
              Tune scoring
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm sm:text-[15px]">
              Edit the global scoring model, preview it against the selected crawl, then save it
              for future crawls.
            </CardDescription>
            <CardAction className="col-start-1 row-start-3 flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
              {isPreviewing && (
                <Badge variant="outline" className="h-8 gap-2 px-3">
                  <CompileLoader size={15} /> Previewing
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={resetToSaved} disabled={!savedConfig}>
                Reset saved
              </Button>
              <Button variant="outline" size="sm" onClick={resetToDefaults}>
                Use defaults
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!draftConfig || isSaving || !hasDraftChanges}
              >
                {isSaving ? "Saving..." : "Save global"}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        {loadError && <StatusCard tone="destructive">{loadError}</StatusCard>}
        {saveMessage && <StatusCard>{saveMessage}</StatusCard>}

        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start">
          <aside className="xl:sticky xl:top-4">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Parameters</CardTitle>
                <CardDescription>Global scoring controls used for preview and future crawls.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-5">
                  <SidebarSection title="Global math">
                    <SliderRow
                      label="Coverage scale"
                      value={draftConfig.coverage_scale}
                      min={0.5}
                      max={16}
                      step={0.1}
                      onChange={(v) => updateTopLevel("coverage_scale", v)}
                    />
                    <SliderRow
                      label="Volume pressure"
                      value={draftConfig.volume_pressure_scale}
                      min={0}
                      max={4}
                      step={0.05}
                      onChange={(v) => updateTopLevel("volume_pressure_scale", v)}
                    />
                    <SliderRow
                      label="Max volume pressure"
                      value={draftConfig.maximum_volume_pressure}
                      min={0}
                      max={8}
                      step={0.1}
                      onChange={(v) => updateTopLevel("maximum_volume_pressure", v)}
                    />
                  </SidebarSection>

                  <Separator />

                  <SidebarSection title="Severity multipliers">
                    {Object.entries(draftConfig.severity_multipliers).map(([severity, multiplier]) => (
                      <SliderRow
                        key={severity}
                        label={humanize(severity)}
                        value={multiplier}
                        min={0}
                        max={2}
                        step={0.05}
                        onChange={(v) => updateSeverity(severity, v)}
                      />
                    ))}
                  </SidebarSection>

                  <Separator />

                  <SidebarSection title="Overall weights">
                    {Object.entries(draftConfig.overall_weights).map(([pillarId, weight]) => (
                      <SliderRow
                        key={pillarId}
                        label={humanize(pillarId)}
                        value={weight}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => updateOverallWeight(pillarId, v)}
                      />
                    ))}
                  </SidebarSection>
                </FieldGroup>
              </CardContent>
            </Card>
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            {!crawlId && (
              <StatusCard>
                Select a crawl to preview score changes. Controls still edit the global draft config.
              </StatusCard>
            )}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ScoreTile
                label="Overall"
                value={displayedBreakdown?.overall_score ?? null}
                baseline={baselineBreakdown?.overall_score}
              />
              {configuredPillarIds.map((pillarId) => {
                const pillarConfig = draftConfig.pillars[pillarId]
                return (
                  <ScoreTile
                    key={pillarId}
                    label={pillarConfig.label}
                    value={findPillar(pillarId)?.score ?? null}
                    baseline={baselineBreakdown?.pillars.find((p) => p.id === pillarId)?.score}
                  />
                )
              })}
            </section>

            <section className="flex flex-col gap-6">
              {configuredPillarIds.map((pillarId) => {
                const pillarConfig = draftConfig.pillars[pillarId]
                const pillarBreakdown = findPillar(pillarId)
                const delta = scoreDelta(pillarId)
                const bucketEntries = sortedEntries(pillarConfig.bucket_weights)
                const issueEntries = sortedEntries(pillarConfig.issue_penalty_by_type)

                return (
                  <Card key={pillarId} className="border-border/50">
                    <CardHeader className="border-b border-border/50">
                      <CardTitle className="text-3xl font-medium tracking-[-0.05em] sm:text-4xl">
                        {pillarConfig.label}
                      </CardTitle>
                      <CardDescription>
                        Score {fmtNum(pillarBreakdown?.score, 0)} · penalty{" "}
                        {fmtNum(pillarBreakdown?.total_penalty)}
                      </CardDescription>
                      {delta != null && (
                        <CardAction>
                          <DeltaBadge delta={delta} />
                        </CardAction>
                      )}
                    </CardHeader>

                    <CardContent className="flex flex-col gap-6">
                      <div className="max-w-md">
                        <SliderRow
                          label="Overall weight"
                          value={draftConfig.overall_weights[pillarId] ?? 0}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(v) => updateOverallWeight(pillarId, v)}
                        />
                      </div>

                      <Separator />

                      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                        <section className="flex flex-col gap-3">
                          <SectionHeading
                            title="Buckets"
                            description="Weights for each scoring bucket in this pillar."
                          />
                          <div className="flex flex-col gap-2">
                            {bucketEntries.map(([bucketId, weight]) => {
                              const bucket = pillarBreakdown?.buckets.find((b) => b.id === bucketId)
                              return (
                                <ConfigRow
                                  key={bucketId}
                                  title={bucket?.label ?? humanize(bucketId)}
                                  description={
                                    bucket
                                      ? `${bucket.issue_type_count} active issues · ${bucket.affected_url_count} URLs`
                                      : "No active issues in selected crawl"
                                  }
                                  value={fmtNum(bucket?.score, 0)}
                                >
                                  <InlineSlider
                                    value={weight}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onChange={(v) => updateBucketWeight(pillarId, bucketId, v)}
                                  />
                                </ConfigRow>
                              )
                            })}
                          </div>
                        </section>

                        <section className="flex flex-col gap-3">
                          <SectionHeading
                            title="Issue penalties"
                            description="Base penalties used before severity and coverage are applied."
                          />
                          <ScrollArea className="h-[30rem] rounded-xl border border-border/50 bg-muted/20">
                            <div className="flex flex-col gap-2 p-2.5">
                              {issueEntries.map(([issueTypeId, penalty]) => {
                                const issue = findIssue(pillarBreakdown, issueTypeId)
                                return (
                                  <ConfigRow
                                    key={issueTypeId}
                                    title={issue?.label ?? humanize(issueTypeId)}
                                    description={
                                      issue
                                        ? `${issue.severity} · ${issue.affected_url_count} URLs · final ${fmtNum(issue.final_penalty)}`
                                        : "Not present in selected crawl"
                                    }
                                    value={fmtNum(issue?.base_penalty ?? penalty)}
                                  >
                                    <InlineSlider
                                      value={penalty}
                                      min={0}
                                      max={30}
                                      step={0.5}
                                      onChange={(v) => updateIssuePenalty(pillarId, issueTypeId, v)}
                                    />
                                  </ConfigRow>
                                )
                              })}
                            </div>
                          </ScrollArea>
                        </section>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) =>
      ["seo", "aeo", "og", "h1", "h2", "h3"].includes(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ")
}

function fmtNum(value: number | undefined | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toFixed(digits).replace(/\.00$/, "")
}

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort(([a], [b]) =>
    humanize(a).localeCompare(humanize(b))
  )
}

function findIssue(
  pillar: ScoreBreakdownPillarResponse | undefined,
  issueTypeId: string
) {
  if (!pillar) return undefined
  for (const bucket of pillar.buckets) {
    const issue = bucket.issues.find((c) => c.id === issueTypeId)
    if (issue) return issue
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusCard({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "muted" | "destructive"
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "border-border/50 shadow-none",
        tone === "destructive" && "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <CardContent
        className={cn("py-3 text-sm", tone === "destructive" ? "text-destructive" : "text-muted-foreground")}
      >
        {children}
      </CardContent>
    </Card>
  )
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{title}</FieldLegend>
      <FieldGroup className="gap-3">{children}</FieldGroup>
    </FieldSet>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  )
}

function ConfigRow({
  title,
  description,
  value,
  children,
}: {
  title: string
  description: string
  value: string
  children: ReactNode
}) {
  return (
    <Card size="sm" className="bg-muted/20 shadow-none">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(13rem,1fr)_auto] lg:items-center">
        <FieldContent className="min-w-0">
          <FieldLabel className="truncate">{title}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        {children}
        <Badge variant="outline" className="justify-self-start tabular-nums lg:justify-self-end">
          {value}
        </Badge>
      </CardContent>
    </Card>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const id = `slider-${label.replace(/\s+/g, "-").toLowerCase()}`
  return (
    <Field className="rounded-lg border border-border/50 bg-muted/20 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Badge variant="outline" className="tabular-nums">
          {fmtNum(value, 2)}
        </Badge>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <FieldDescription className="flex items-center justify-between text-xs">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </FieldDescription>
    </Field>
  )
}

function InlineSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <Field className="gap-2">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <FieldDescription className="flex items-center justify-between text-xs">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </FieldDescription>
    </Field>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  const variant = delta < 0 ? "destructive" : "outline"
  return (
    <Badge variant={variant} className="tabular-nums">
      {delta > 0 ? "+" : ""}
      {delta}
    </Badge>
  )
}

function ScoreTile({
  label,
  value,
  baseline,
}: {
  label: string
  value: number | null
  baseline: number | undefined
}) {
  const delta = value != null && baseline != null ? value - baseline : null
  const surfaceTone =
    delta == null || delta === 0
      ? "border-border/50 bg-muted/20"
      : delta > 0
        ? "border-emerald-300/16 bg-emerald-400/[0.045]"
        : "border-red-300/14 bg-red-400/[0.04]"

  return (
    <Card size="sm" className={cn("border", surfaceTone)}>
      <CardHeader>
        <CardDescription className="text-sm">{label}</CardDescription>
        {delta != null && (
          <CardAction>
            <DeltaBadge delta={delta} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
          {fmtNum(value, 0)}
        </p>
      </CardContent>
    </Card>
  )
}
