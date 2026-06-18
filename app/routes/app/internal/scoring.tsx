"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LoaderFunctionArgs } from "react-router"
import { useLoaderData } from "react-router"

import { CompileLoader } from "~/components/compile-loader"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
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
      <div className="mx-auto w-full max-w-[104rem] space-y-6 px-4 py-10 sm:px-6 lg:px-4">
        {/* Header */}
        <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
          <CardContent className="flex flex-col gap-6 p-6 sm:p-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
                Tune scoring
              </h1>
              <p className="max-w-2xl pt-3 text-sm text-muted-foreground sm:text-[15px]">
                Edit the global scoring model, preview it against the selected crawl, then save
                it for future crawls.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {isPreviewing && (
                <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <CompileLoader size={15} /> Previewing
                </span>
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
            </div>
          </CardContent>
        </Card>

        {/* Error / save messages */}
        {loadError && (
          <div className="rounded-md border border-red-300/15 bg-red-400/[0.045] px-4 py-3 text-sm text-red-100">
            {loadError}
          </div>
        )}
        {saveMessage && (
          <div className="rounded-md border border-border/50 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {saveMessage}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
          {/* Sidebar */}
          <aside className="space-y-4 xl:sticky xl:top-4">
            {/* Global math */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Global math</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

            {/* Severity multipliers */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Severity multipliers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

            {/* Overall weights */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Overall weights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>
          </aside>

          {/* Main area */}
          <div className="min-w-0 space-y-6">
            {!crawlId && (
              <div className="rounded-md border border-border/50 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Select a crawl to preview score changes. Controls still edit the global draft
                config.
              </div>
            )}

            {/* Score tiles */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>

            {/* Pillar breakdowns */}
            <div className="space-y-6">
              {configuredPillarIds.map((pillarId) => {
                const pillarConfig = draftConfig.pillars[pillarId]
                const pillarBreakdown = findPillar(pillarId)
                const delta = scoreDelta(pillarId)
                const bucketEntries = sortedEntries(pillarConfig.bucket_weights)
                const issueEntries = sortedEntries(pillarConfig.issue_penalty_by_type)

                return (
                  <Card key={pillarId} className="border-border/50">
                    <CardContent className="p-5 sm:p-6">
                      {/* Pillar header */}
                      <div className="flex flex-col gap-6 border-b border-border/50 pb-6 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-end gap-3">
                            <h2 className="text-3xl font-medium tracking-[-0.05em] sm:text-4xl">
                              {pillarConfig.label}
                            </h2>
                            {delta != null && (
                              <span
                                className={`pb-1 text-sm ${
                                  delta > 0
                                    ? "text-emerald-200"
                                    : delta < 0
                                      ? "text-red-200"
                                      : "text-muted-foreground/40"
                                }`}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </span>
                            )}
                          </div>
                          <p className="pt-2 text-sm text-muted-foreground">
                            Score {fmtNum(pillarBreakdown?.score, 0)} · penalty{" "}
                            {fmtNum(pillarBreakdown?.total_penalty)}
                          </p>
                        </div>
                        <div className="min-w-[18rem] max-w-[24rem]">
                          <SliderRow
                            label="Overall weight"
                            value={draftConfig.overall_weights[pillarId] ?? 0}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => updateOverallWeight(pillarId, v)}
                          />
                        </div>
                      </div>

                      {/* Buckets + issue penalties */}
                      <div className="grid gap-6 pt-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                        {/* Buckets */}
                        <section className="space-y-4">
                          <h3 className="text-lg font-medium tracking-[-0.03em]">Buckets</h3>
                          <div className="space-y-2">
                            {bucketEntries.map(([bucketId, weight]) => {
                              const bucket = pillarBreakdown?.buckets.find(
                                (b) => b.id === bucketId
                              )
                              return (
                                <div
                                  key={bucketId}
                                  className="rounded-md border border-border/50 bg-muted/30 px-4 py-4"
                                >
                                  <div className="grid gap-4 lg:grid-cols-[minmax(11rem,0.62fr)_minmax(12rem,1fr)_5rem] lg:items-center">
                                    <div>
                                      <p className="text-sm font-medium">
                                        {bucket?.label ?? humanize(bucketId)}
                                      </p>
                                      <p className="pt-1 text-xs text-muted-foreground">
                                        {bucket
                                          ? `${bucket.issue_type_count} active issues · ${bucket.affected_url_count} URLs`
                                          : "No active issues in selected crawl"}
                                      </p>
                                    </div>
                                    <InlineSlider
                                      value={weight}
                                      min={0}
                                      max={1}
                                      step={0.01}
                                      onChange={(v) =>
                                        updateBucketWeight(pillarId, bucketId, v)
                                      }
                                    />
                                    <div className="text-sm tabular-nums text-muted-foreground lg:text-right">
                                      {fmtNum(bucket?.score, 0)}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </section>

                        {/* Issue penalties */}
                        <section className="space-y-4">
                          <h3 className="text-lg font-medium tracking-[-0.03em]">
                            Issue penalties
                          </h3>
                          <ScrollArea className="h-[30rem] rounded-md border border-border/50 bg-muted/30">
                            <div className="space-y-2 p-2.5">
                              {issueEntries.map(([issueTypeId, penalty]) => {
                                const issue = findIssue(
                                  pillarBreakdown,
                                  issueTypeId
                                )
                                return (
                                  <div
                                    key={issueTypeId}
                                    className="rounded-[calc(var(--radius)-0.15rem)] border border-border/50 bg-card px-4 py-4"
                                  >
                                    <div className="grid gap-4 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(12rem,1fr)_6rem] lg:items-center">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                          {issue?.label ?? humanize(issueTypeId)}
                                        </p>
                                        <p className="pt-1 text-xs text-muted-foreground">
                                          {issue
                                            ? `${issue.severity} · ${issue.affected_url_count} URLs · final ${fmtNum(issue.final_penalty)}`
                                            : "Not present in selected crawl"}
                                        </p>
                                      </div>
                                      <InlineSlider
                                        value={penalty}
                                        min={0}
                                        max={30}
                                        step={0.5}
                                        onChange={(v) =>
                                          updateIssuePenalty(pillarId, issueTypeId, v)
                                        }
                                      />
                                      <div className="text-sm tabular-nums text-muted-foreground lg:text-right">
                                        {fmtNum(issue?.base_penalty ?? penalty)}
                                      </div>
                                    </div>
                                  </div>
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
            </div>
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
    <div className="rounded-md border border-border/50 bg-muted/30 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor={id} className="text-muted-foreground">
          {label}
        </label>
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {fmtNum(value, 2)}
        </span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        className="mt-3"
      />
      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground/30">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </div>
    </div>
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
    <div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground/24">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </div>
    </div>
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
      ? "border-border/50 bg-muted/30"
      : delta > 0
        ? "border-emerald-300/16 bg-emerald-400/[0.045]"
        : "border-red-300/14 bg-red-400/[0.04]"
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground/40"
      : delta > 0
        ? "text-emerald-200"
        : "text-red-200"

  return (
    <Card className={`border ${surfaceTone}`}>
      <CardContent className="p-4 sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/40">
          {label}
        </p>
        <div className="flex items-end gap-3 pt-3">
          <p className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
            {fmtNum(value, 0)}
          </p>
          {delta != null && (
            <p className={`pb-1 text-sm ${deltaTone}`}>
              {delta > 0 ? "+" : ""}
              {delta}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
