"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
  useReducer,
  type ReactNode,
} from "react"

import { CompileLoader } from "~/components/compile-loader"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { clientApiFetch } from "~/lib/api"
import { ApiError } from "~/lib/api"
import type {
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
  ScoringConfig,
  ScoringPreviewResponse,
} from "~/lib/api.types"
import {
  deepClone,
  deepEqual,
  humanize,
  fmtNum,
  sortedEntries,
  buildIssueMap,
} from "./helpers"
import {
  StatusCard,
  SidebarSection,
  SectionHeading,
  ConfigRow,
  SliderRow,
  InlineSlider,
  DeltaBadge,
  ScoreTile,
} from "./components"

/* ------------------------------------------------------------------ */
/*  Types & reducers                                                   */
/* ------------------------------------------------------------------ */

type TopLevelNumericKey =
  | "minimum_overall_score"
  | "coverage_scale"
  | "soft_sum_decay"

type ConfigAction =
  | { type: "SET_TOP_LEVEL"; key: TopLevelNumericKey; value: number }
  | { type: "SET_SEVERITY"; severity: string; value: number }
  | { type: "SET_OVERALL_WEIGHT"; pillarId: string; value: number }
  | {
      type: "SET_BUCKET_WEIGHT"
      pillarId: string
      bucketId: string
      value: number
    }
  | {
      type: "SET_ISSUE_PENALTY"
      pillarId: string
      issueType: string
      value: number
    }
  | { type: "REPLACE"; config: ScoringConfig }

function configReducer(
  state: ScoringConfig,
  action: ConfigAction
): ScoringConfig {
  switch (action.type) {
    case "SET_TOP_LEVEL":
      return { ...state, [action.key]: action.value }
    case "SET_SEVERITY":
      return {
        ...state,
        severity_multipliers: {
          ...state.severity_multipliers,
          [action.severity]: action.value,
        },
      }
    case "SET_OVERALL_WEIGHT":
      return {
        ...state,
        overall_weights: {
          ...state.overall_weights,
          [action.pillarId]: action.value,
        },
      }
    case "SET_BUCKET_WEIGHT":
      return {
        ...state,
        pillars: {
          ...state.pillars,
          [action.pillarId]: {
            ...state.pillars[action.pillarId],
            bucket_weights: {
              ...state.pillars[action.pillarId].bucket_weights,
              [action.bucketId]: action.value,
            },
          },
        },
      }
    case "SET_ISSUE_PENALTY":
      return {
        ...state,
        pillars: {
          ...state.pillars,
          [action.pillarId]: {
            ...state.pillars[action.pillarId],
            issue_penalty_by_type: {
              ...state.pillars[action.pillarId].issue_penalty_by_type,
              [action.issueType]: action.value,
            },
          },
        },
      }
    case "REPLACE":
      return action.config
  }
}

type UIAction =
  | { type: "PREVIEW_START" }
  | { type: "PREVIEW_DONE" }
  | { type: "PREVIEW_ERROR"; message: string }
  | { type: "SAVING_START" }
  | { type: "SAVING_DONE" }
  | { type: "SAVING_ERROR"; message: string }

type UIState = {
  isSaving: boolean
  isPreviewing: boolean
  loadError: string
}

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "PREVIEW_START":
      return { ...state, isPreviewing: true, loadError: "" }
    case "PREVIEW_DONE":
      return { ...state, isPreviewing: false, loadError: "" }
    case "PREVIEW_ERROR":
      return { ...state, isPreviewing: false, loadError: action.message }
    case "SAVING_START":
      return { ...state, isSaving: true, loadError: "" }
    case "SAVING_DONE":
      return { ...state, isSaving: false, loadError: "" }
    case "SAVING_ERROR":
      return { ...state, isSaving: false, loadError: action.message }
  }
}

/* ------------------------------------------------------------------ */
/*  ScoringHeader                                                      */
/* ------------------------------------------------------------------ */

function ScoringHeader({
  draftConfig,
  hasDraftChanges,
  isSaving,
  onResetDefaults,
  onResetSaved,
  onSave,
  children,
  extraActions,
}: {
  draftConfig: ScoringConfig
  hasDraftChanges: boolean
  isSaving: boolean
  onResetDefaults: () => void
  onResetSaved: () => void
  onSave: () => void
  children?: ReactNode
  extraActions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        {children}
        <p className="text-xs text-muted-foreground">
          {Object.keys(draftConfig.pillars).length} pillars configured
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        <Button
          type="button"
          variant="outline"
          onClick={onResetSaved}
          disabled={!hasDraftChanges || isSaving}
        >
          Reset to saved
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onResetDefaults}
          disabled={isSaving}
        >
          Reset to defaults
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={!hasDraftChanges || isSaving}
        >
          {isSaving ? (
            <CompileLoader size={16} className="text-primary-foreground" />
          ) : null}
          Save
        </Button>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/*  ScoringSidebar                                                     */
/* ------------------------------------------------------------------ */

function ScoringSidebar({
  draftConfig,
  updateSeverity,
  updateTopLevel,
}: {
  draftConfig: ScoringConfig
  updateSeverity: (severity: string, value: number) => void
  updateTopLevel: (key: TopLevelNumericKey, value: number) => void
}) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Global controls</CardTitle>
        <CardDescription>
          These settings affect all pillars and issue calculations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SidebarSection title="Global weights">
          <SliderRow
            label="Minimum overall score"
            value={draftConfig.minimum_overall_score}
            min={0}
            max={100}
            step={1}
            onChange={(value) => updateTopLevel("minimum_overall_score", value)}
          />
          <SliderRow
            label="Coverage scale"
            value={draftConfig.coverage_scale}
            min={0}
            max={5}
            step={0.05}
            onChange={(value) => updateTopLevel("coverage_scale", value)}
          />
          <SliderRow
            label="Soft-sum decay"
            value={draftConfig.soft_sum_decay}
            min={0.1}
            max={0.9}
            step={0.05}
            hint="How coexisting issue types in a bucket combine: the worst counts in full, each lower one is scaled by this factor. Higher = harsher stacking; lower = only the worst issue matters."
            onChange={(value) => updateTopLevel("soft_sum_decay", value)}
          />
        </SidebarSection>
        <SidebarSection title="Severity multipliers">
          {sortedEntries(draftConfig.severity_multipliers).map(
            ([severity, value]) => (
              <SliderRow
                key={severity}
                label={humanize(severity)}
                value={value}
                min={0}
                max={5}
                step={0.05}
                onChange={(nextValue) => updateSeverity(severity, nextValue)}
              />
            )
          )}
        </SidebarSection>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  PillarCard                                                         */
/* ------------------------------------------------------------------ */

type PillarCardProps = {
  pillarId: string
  pillarConfig: { label: string }
  pillarBreakdown: ScoreBreakdownPillarResponse | undefined
  delta: number | null
  bucketEntries: [string, number][]
  issueEntries: [string, number][]
  issueMap: Map<string, ScoreBreakdownIssueTypeResponse>
  overallWeight: number
  onUpdateOverallWeight: (pillarId: string, value: number) => void
  onUpdateBucketWeight: (
    pillarId: string,
    bucketId: string,
    value: number
  ) => void
  onUpdateIssuePenalty: (
    pillarId: string,
    issueType: string,
    value: number
  ) => void
}

function PillarCard({
  pillarId,
  pillarConfig,
  pillarBreakdown,
  delta,
  bucketEntries,
  issueEntries,
  issueMap,
  overallWeight,
  onUpdateOverallWeight,
  onUpdateBucketWeight,
  onUpdateIssuePenalty,
}: PillarCardProps) {
  return (
    <Card className="border-border/50">
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
            value={overallWeight}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onUpdateOverallWeight(pillarId, v)}
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
                const bucket = pillarBreakdown?.buckets.find(
                  (b) => b.id === bucketId
                )
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
                      onChange={(v) =>
                        onUpdateBucketWeight(pillarId, bucketId, v)
                      }
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
                  const issue = issueMap.get(issueTypeId)
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
                        onChange={(v) =>
                          onUpdateIssuePenalty(pillarId, issueTypeId, v)
                        }
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
}

/* ------------------------------------------------------------------ */
/*  ScoringEditor — public reusable component                          */
/* ------------------------------------------------------------------ */

export type ScoringEditorProps = {
  /** Current config to edit (from server or initial load) */
  config: ScoringConfig
  /** Factory defaults — used when user clicks "Reset to defaults" */
  defaultConfig: ScoringConfig
  /** Optional baseline breakdown for initial score display (no preview yet) */
  baselineBreakdown?: ScoreBreakdownResponse | null
  /** Crawl ID from query param, for live preview support */
  crawlId?: string | null
  /** Endpoint for preview POST requests */
  previewEndpoint?: string
  /** Save handler. Returns the saved config to adopt (or void to keep draft). */
  onSave: (config: ScoringConfig) => Promise<ScoringConfig | void>
  /** Optional callback fired before draft is replaced with defaults */
  onResetToDefaults?: () => void
  /** Toolbar row rendered above the header (mode tabs, org picker, etc.) */
  toolbar?: ReactNode
  /** Rendered inside the header in place of the default title/description block */
  headerChildren?: ReactNode
  /** Rendered alongside the standard action buttons (reset/save) */
  headerExtraActions?: ReactNode
  /** Whether the save button should be force-disabled */
  disableSave?: boolean
  /** Whether a loading placeholder should be shown instead of the editor */
  loading?: boolean
  /** Whether to show the "Select a crawl to preview" message */
  showCrawlMessage?: boolean
}

export function ScoringEditor({
  config: initialConfig,
  defaultConfig: initialDefaultConfig,
  baselineBreakdown: initialBaselineBreakdown,
  crawlId,
  previewEndpoint = "/internal/scoring-config/preview",
  onSave,
  onResetToDefaults,
  headerChildren,
  toolbar,
  disableSave = false,
  loading = false,
  showCrawlMessage = true,
  headerExtraActions,
}: ScoringEditorProps) {
  const [savedConfig, setSavedConfig] = useState(() => deepClone(initialConfig))
  const [draftConfig, dispatchConfig] = useReducer(
    configReducer,
    initialConfig,
    deepClone
  )
  const [previewBreakdown, setPreviewBreakdown] =
    useState<ScoreBreakdownResponse | null>(initialBaselineBreakdown ?? null)
  const [ui, dispatchUi] = useReducer(uiReducer, {
    isSaving: false,
    isPreviewing: false,
    loadError: "",
  })
  const previewSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayedBreakdown =
    previewBreakdown ?? initialBaselineBreakdown ?? null

  const configuredPillarIds = useMemo(
    () => Object.keys(draftConfig.pillars),
    [draftConfig.pillars]
  )

  const hasDraftChanges = useMemo(
    () => !deepEqual(savedConfig, draftConfig),
    [savedConfig, draftConfig]
  )

  /* ---- preview ---- */

  const previewScoringConfig = useEffectEvent(async () => {
    if (!draftConfig || !crawlId) return
    abortRef.current?.abort()
    const seq = ++previewSeqRef.current
    const controller = new AbortController()
    abortRef.current = controller
    dispatchUi({ type: "PREVIEW_START" })

    try {
      const response = await clientApiFetch<ScoringPreviewResponse>(
        previewEndpoint,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crawl_id: crawlId, config: draftConfig }),
        }
      )
      if (seq === previewSeqRef.current) {
        setPreviewBreakdown(response.breakdown)
        dispatchUi({ type: "PREVIEW_DONE" })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (seq === previewSeqRef.current) {
        dispatchUi({
          type: "PREVIEW_ERROR",
          message: error instanceof ApiError ? error.message : "Preview failed",
        })
      }
    }
  })

  useEffect(() => {
    if (!draftConfig || !crawlId) return
    // Until the admin actually edits the config, show the crawl's stored scores
    // exactly as-is. Don't recompute a preview for the unchanged saved config —
    // that would silently replace the real scores with a live re-score.
    if (!hasDraftChanges) {
      setPreviewBreakdown(initialBaselineBreakdown ?? null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      previewScoringConfig()
    }, 260)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draftConfig, crawlId, hasDraftChanges, initialBaselineBreakdown])

  const onCrawlChange = useEffectEvent(() => {
    setPreviewBreakdown(initialBaselineBreakdown ?? null)
  })
  useEffect(() => {
    onCrawlChange()
  }, [crawlId])

  /* ---- actions ---- */

  const handleSave = async () => {
    if (!draftConfig) return
    dispatchUi({ type: "SAVING_START" })
    try {
      const result = await onSave(draftConfig)
      if (result && typeof result === "object" && "version" in result) {
        dispatchConfig({ type: "REPLACE", config: deepClone(result) })
        setSavedConfig(deepClone(result))
      } else {
        setSavedConfig(deepClone(draftConfig))
      }
      dispatchUi({ type: "SAVING_DONE" })
    } catch (error) {
      dispatchUi({
        type: "SAVING_ERROR",
        message:
          error instanceof ApiError
            ? error.message
            : "Unable to save scoring config.",
      })
    }
  }

  const resetToSaved = () =>
    dispatchConfig({ type: "REPLACE", config: deepClone(savedConfig) })

  const resetToDefaults = () => {
    onResetToDefaults?.()
    dispatchConfig({ type: "REPLACE", config: deepClone(initialDefaultConfig) })
  }

  const updateTopLevel = (key: TopLevelNumericKey, value: number) => {
    dispatchConfig({ type: "SET_TOP_LEVEL", key, value })
  }
  const updateSeverity = (severity: string, value: number) => {
    dispatchConfig({ type: "SET_SEVERITY", severity, value })
  }
  const updateOverallWeight = (pillarId: string, value: number) => {
    dispatchConfig({ type: "SET_OVERALL_WEIGHT", pillarId, value })
  }
  const updateBucketWeight = (
    pillarId: string,
    bucketId: string,
    value: number
  ) => {
    dispatchConfig({ type: "SET_BUCKET_WEIGHT", pillarId, bucketId, value })
  }
  const updateIssuePenalty = (
    pillarId: string,
    issueType: string,
    value: number
  ) => {
    dispatchConfig({ type: "SET_ISSUE_PENALTY", pillarId, issueType, value })
  }

  const findPillar = (
    pillarId: string
  ): ScoreBreakdownPillarResponse | undefined =>
    displayedBreakdown?.pillars.find((p) => p.id === pillarId)

  const scoreDelta = (pillarId: string): number | null => {
    const current = findPillar(pillarId)?.score
    const baseline = initialBaselineBreakdown?.pillars.find(
      (p) => p.id === pillarId
    )?.score
    return current != null && baseline != null ? current - baseline : null
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  if (!draftConfig) {
    return <p className="text-sm text-muted-foreground">No config loaded</p>
  }

  return (
    <>
      {toolbar && (
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          {toolbar}
        </div>
      )}
      <ScoringHeader
        draftConfig={draftConfig}
        hasDraftChanges={hasDraftChanges && !disableSave}
        isSaving={ui.isSaving}
        onResetSaved={resetToSaved}
        onResetDefaults={resetToDefaults}
        onSave={handleSave}
        extraActions={headerExtraActions}
      >
        {headerChildren ? (
          headerChildren
        ) : (
          <>
            <h1 className="text-3xl font-medium tracking-[-0.06em] sm:text-4xl">
              Scoring config
            </h1>
            <p className="text-sm text-muted-foreground">
              Tune global scoring weights, severity multipliers, and issue
              penalties.
            </p>
          </>
        )}
        {ui.isPreviewing ? (
          <Badge variant="outline" className="gap-1.5">
            <CompileLoader size={14} className="text-foreground" />
            Previewing
          </Badge>
        ) : null}
      </ScoringHeader>

      {ui.loadError && (
        <StatusCard tone="destructive">{ui.loadError}</StatusCard>
      )}

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start">
        <aside className="xl:sticky xl:top-4">
          <ScoringSidebar
            draftConfig={draftConfig}
            updateTopLevel={updateTopLevel}
            updateSeverity={updateSeverity}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {!crawlId && showCrawlMessage && (
            <StatusCard>
              Select a crawl to preview score changes. Controls still edit the
              global draft config.
            </StatusCard>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ScoreTile
              label="Overall"
              value={displayedBreakdown?.overall_score ?? null}
              baseline={initialBaselineBreakdown?.overall_score}
            />
            {configuredPillarIds.map((pillarId) => {
              const pillarConfig = draftConfig.pillars[pillarId]
              return (
                <ScoreTile
                  key={pillarId}
                  label={pillarConfig.label}
                  value={findPillar(pillarId)?.score ?? null}
                  baseline={
                    initialBaselineBreakdown?.pillars.find(
                      (p) => p.id === pillarId
                    )?.score
                  }
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
              const issueEntries = sortedEntries(
                pillarConfig.issue_penalty_by_type
              )
              const issueMap = pillarBreakdown
                ? buildIssueMap(pillarBreakdown)
                : new Map()

              return (
                <PillarCard
                  key={pillarId}
                  pillarId={pillarId}
                  pillarConfig={pillarConfig}
                  pillarBreakdown={pillarBreakdown}
                  delta={delta}
                  bucketEntries={bucketEntries}
                  issueEntries={issueEntries}
                  issueMap={issueMap}
                  overallWeight={draftConfig.overall_weights[pillarId] ?? 0}
                  onUpdateOverallWeight={updateOverallWeight}
                  onUpdateBucketWeight={updateBucketWeight}
                  onUpdateIssuePenalty={updateIssuePenalty}
                />
              )
            })}
          </section>
        </div>
      </div>
    </>
  )
}
