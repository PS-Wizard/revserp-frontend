"use client"

import { memo, useCallback, useContext, useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  Loader2Icon,
  PlusIcon,
  SwordsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Progress } from "~/components/ui/progress"
import { Skeleton } from "~/components/ui/skeleton"
import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import type {
  CompetitorCrawlResponse,
  CompetitorResponse,
  CrawlResponse,
  EnqueueCompetitorCrawlsResponse,
  ProjectCompetitorsResponse,
  ProjectResponse,
} from "~/lib/api.types"

import { SetInsightsNavbarLabel } from "~/components/workspace-shell-preview"
import { format } from "date-fns"

import { CompetitorInsightsView } from "./competitor-insights"

type Props = {
  activeProject: ProjectResponse | null
  currentCrawl: CrawlResponse | null
  maxCompetitors: number
  trackCrawl: (id: string) => void
}

function competitorsQueryKey(projectId: string, crawlId: string | null) {
  return ["project-competitors", projectId, crawlId] as const
}

function competitorNeedsCrawl(competitor: CompetitorResponse) {
  const status = competitor.crawl?.status
  return !competitor.crawl || status === "failed" || status === "cancelled"
}

function crawlProgressLabel(crawl: CompetitorCrawlResponse) {
  if (crawl.status === "queued") {
    return "Waiting to start"
  }
  if (crawl.phase === "analyzing") {
    return "Analyzing crawled pages…"
  }
  if (crawl.urls_discovered === 0) {
    return "Discovering pages…"
  }
  const remaining = Math.max(0, crawl.urls_discovered - crawl.urls_crawled)
  const counts = `${crawl.urls_crawled} / ${crawl.urls_discovered} crawled`
  if (remaining > 0) {
    return `${counts} · ${remaining} left`
  }
  return counts
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const COVER_GRADIENTS = [
  {
    background:
      "linear-gradient(145deg, rgb(225 29 72 / 0.24) 0%, rgb(127 29 29 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(225 29 72 / 0.3)",
  },
  {
    background:
      "linear-gradient(145deg, rgb(20 184 166 / 0.24) 0%, rgb(15 118 110 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(20 184 166 / 0.3)",
  },
  {
    background:
      "linear-gradient(145deg, rgb(99 102 241 / 0.24) 0%, rgb(67 56 202 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(99 102 241 / 0.3)",
  },
] as const

function coverGradient(index: number) {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length]
}

const cardActionClass =
  "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition-colors"

type CrawlTone = "muted" | "active" | "ok" | "bad"

function competitorCrawlTone(
  crawl: CompetitorCrawlResponse | null | undefined,
  parentCrawl: CrawlResponse | null
): { label: string; tone: CrawlTone } {
  if (!parentCrawl || parentCrawl.status !== "completed" || !crawl) {
    return { label: "Not crawled", tone: "muted" }
  }
  switch (crawl.status) {
    case "queued":
      return { label: "Queued", tone: "active" }
    case "running":
      return {
        label: crawl.phase === "analyzing" ? "Analyzing" : "Crawling",
        tone: "active",
      }
    case "completed":
      return { label: "Crawled", tone: "ok" }
    case "failed":
      return { label: "Failed", tone: "bad" }
    case "cancelled":
      return { label: "Cancelled", tone: "muted" }
    default:
      return { label: crawl.status, tone: "muted" }
  }
}

function badgeVariant(
  tone: CrawlTone
): "outline" | "secondary" | "destructive" {
  switch (tone) {
    case "ok":
      return "secondary"
    case "bad":
      return "destructive"
    default:
      return "outline"
  }
}

function CompetitorCard({
  competitor,
  index,
  parentCrawl,
  isRemoving,
  onOpenInsights,
  onRemove,
}: {
  competitor: CompetitorResponse
  index: number
  parentCrawl: CrawlResponse | null
  isRemoving: boolean
  onOpenInsights: (crawlId: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const host = hostLabel(competitor.seed_url)
  const customTitle = competitor.name.trim()
  const cardTitle = customTitle || host
  const displayName = cardTitle
  const crawl = competitor.crawl
  const state = competitorCrawlTone(crawl, parentCrawl)
  const isActive = state.tone === "active"
  const isCompleted = crawl?.status === "completed"
  const isFailed = crawl?.status === "failed"
  const isProgressing =
    crawl?.status === "queued" || crawl?.status === "running"
  const progressValue =
    isProgressing && crawl.urls_discovered > 0
      ? Math.round((crawl.urls_crawled / crawl.urls_discovered) * 100)
      : isProgressing
        ? 0
        : null
  const cover = coverGradient(index)
  const monogram = cardTitle.charAt(0).toUpperCase()
  const isCancelled = crawl?.status === "cancelled"
  const crawlDate = crawl?.completed_at ? new Date(crawl.completed_at) : null
  const crawlDateLabel =
    crawlDate && !Number.isNaN(crawlDate.getTime())
      ? format(crawlDate, "MMM d")
      : null

  const openInsights = () => {
    if (!isCompleted || !crawl) return
    onOpenInsights(crawl.id, displayName)
  }

  return (
    <Card
      className={cn(
        "relative flex min-h-44 w-full flex-col gap-0 self-start overflow-hidden bg-card py-0",
        isCompleted &&
          "cursor-pointer transition-colors hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
      )}
      onClick={isCompleted ? openInsights : undefined}
      onKeyDown={
        isCompleted
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                openInsights()
              }
            }
          : undefined
      }
      role={isCompleted ? "button" : undefined}
      tabIndex={isCompleted ? 0 : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: cover.background }}
      />
      <div className="relative flex items-start justify-between gap-3 px-4 pt-4">
        <span className="min-w-0 truncate pr-2 text-sm font-medium">
          {cardTitle}
        </span>
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/50 text-[10px] font-semibold uppercase"
          style={{ backgroundColor: cover.monogram }}
        >
          {monogram}
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-5 text-center">
        {isCompleted ? (
          <p className="text-sm text-foreground">
            {crawl.urls_crawled.toLocaleString()} pages
            {crawlDateLabel ? ` · crawled ${crawlDateLabel}` : ""}
          </p>
        ) : isProgressing ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Progress value={progressValue ?? 0} />
            <p className="text-sm text-muted-foreground">
              {crawlProgressLabel(crawl)}
            </p>
          </div>
        ) : isFailed ? (
          <p className="text-sm text-muted-foreground">
            Crawl failed — crawl this audit to retry.
          </p>
        ) : isCancelled ? (
          <p className="text-sm text-muted-foreground">
            Crawl cancelled — crawl this audit to retry.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not crawled for this audit yet.
          </p>
        )}
      </div>

      <div className="relative flex items-center justify-between gap-2 px-4 pb-4">
        <Badge variant={badgeVariant(state.tone)}>
          {isActive ? (
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : null}
          {state.tone === "ok" ? (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-current"
            />
          ) : null}
          {state.label}
        </Badge>
        <div className="flex items-center gap-1.5">
          <button
            aria-label={`Remove ${displayName}`}
            className={cn(
              cardActionClass,
              "hover:bg-foreground/5 hover:text-foreground disabled:opacity-50 dark:hover:bg-white/10"
            )}
            disabled={isRemoving}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(competitor.id)
            }}
            type="button"
          >
            {isRemoving ? (
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Trash2Icon aria-hidden="true" className="size-4" />
            )}
          </button>
          {isCompleted ? (
            <span aria-hidden="true" className={cardActionClass}>
              <ArrowRightIcon className="size-4" />
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function CompetitorCardSkeleton() {
  return (
    <Card className="flex min-h-44 flex-col gap-0 py-0">
      <div className="flex items-start justify-between px-4 pt-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-6 rounded-md" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-5">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-center justify-between px-4 pb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </Card>
  )
}

export const CompetitorsView = memo(function CompetitorsView({
  activeProject,
  currentCrawl,
  maxCompetitors,
  trackCrawl,
}: Props) {
  const queryClient = useQueryClient()
  const setInsightsNavbarLabel = useContext(SetInsightsNavbarLabel)
  const projectId = activeProject?.id ?? null
  const selectedCrawlId = currentCrawl?.id ?? null
  const parentCrawlId =
    currentCrawl?.status === "completed" ? currentCrawl.id : null
  const hasCompletedParentCrawl = parentCrawlId !== null

  const [dialogOpen, setDialogOpen] = useState(false)
  const [seedUrl, setSeedUrl] = useState("")
  const [name, setName] = useState("")
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [insightsTarget, setInsightsTarget] = useState<{
    crawlId: string
    name: string
  } | null>(null)

  const youLabel = activeProject?.name.trim() || "You"

  useEffect(() => {
    if (!insightsTarget) {
      setInsightsNavbarLabel(null)
      return
    }
    setInsightsNavbarLabel({
      them: insightsTarget.name.trim() || "Competitor",
      you: youLabel,
    })
    return () => setInsightsNavbarLabel(null)
  }, [insightsTarget, setInsightsNavbarLabel, youLabel])

  const invalidateCompetitors = useCallback(() => {
    if (!projectId) return
    void queryClient.invalidateQueries({
      queryKey: ["project-competitors", projectId],
    })
  }, [projectId, queryClient])

  const { data, isLoading } = useQuery({
    queryKey: projectId
      ? competitorsQueryKey(projectId, selectedCrawlId)
      : ["project-competitors-disabled"],
    queryFn: () => {
      const crawlQuery = parentCrawlId ? `?crawl=${parentCrawlId}` : ""
      return clientApiFetch<ProjectCompetitorsResponse>(
        `/projects/${projectId!}/competitors${crawlQuery}`
      )
    },
    enabled: Boolean(projectId),
  })

  const competitors = data?.competitors ?? []
  const cap = data?.max_competitors ?? maxCompetitors
  const atCap = competitors.length >= cap

  const addMutation = useMutation({
    mutationFn: async (body: { seed_url: string; name?: string }) =>
      clientApiPost<CompetitorResponse>(
        `/projects/${projectId!}/competitors`,
        body
      ),
    onSuccess: () => {
      setSeedUrl("")
      setName("")
      setDialogOpen(false)
      toast.success("Competitor added")
      invalidateCompetitors()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to add competitor."
      )
    },
  })

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (addMutation.isPending) return
      setDialogOpen(open)
      if (!open) {
        setSeedUrl("")
        setName("")
      }
    },
    [addMutation.isPending]
  )

  const handleAdd = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmedUrl = seedUrl.trim()
      if (!projectId || !trimmedUrl || atCap || addMutation.isPending) return
      const trimmedName = name.trim()
      await addMutation.mutateAsync({
        seed_url: trimmedUrl,
        ...(trimmedName ? { name: trimmedName } : {}),
      })
    },
    [addMutation, atCap, name, projectId, seedUrl]
  )

  const handleRemove = useCallback(
    async (competitorId: string) => {
      if (!projectId || removingId) return
      setRemovingId(competitorId)
      try {
        await clientApiDelete(
          `/projects/${projectId}/competitors/${competitorId}`
        )
        toast.success("Competitor removed")
        invalidateCompetitors()
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Unable to remove competitor."
        )
      } finally {
        setRemovingId(null)
      }
    },
    [invalidateCompetitors, projectId, removingId]
  )

  const crawlMutation = useMutation({
    mutationFn: () =>
      clientApiPost<EnqueueCompetitorCrawlsResponse>(
        `/projects/${projectId!}/competitors/crawls${
          parentCrawlId ? `?crawl=${parentCrawlId}` : ""
        }`,
        {}
      ),
    onSuccess: (response) => {
      if (response.crawls.length === 0) {
        toast.message("Nothing to crawl for this audit")
        return
      }
      for (const crawl of response.crawls) {
        trackCrawl(crawl.id)
      }
      invalidateCompetitors()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Unable to start competitor crawls."
      )
    },
  })

  const remainingToCrawl = competitors.filter(competitorNeedsCrawl).length
  const alreadyCrawledForAudit = competitors.filter(
    (competitor) => competitor.crawl?.status === "completed"
  ).length

  const canStartCrawl =
    hasCompletedParentCrawl && remainingToCrawl > 0 && !crawlMutation.isPending

  if (!projectId || !activeProject) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
        <div className="flex flex-1 flex-col px-4 lg:px-6">
          <Empty className="min-h-64 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SwordsIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Select a project</EmptyTitle>
              <EmptyDescription>
                Choose a project to manage competitors.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    )
  }

  if (insightsTarget) {
    return (
      <CompetitorInsightsView
        competitorCrawlId={insightsTarget.crawlId}
        competitorName={insightsTarget.name}
        onClose={() => setInsightsTarget(null)}
        projectName={activeProject.name}
      />
    )
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          Competitors
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={atCap}
            onClick={() => setDialogOpen(true)}
            type="button"
            variant="outline"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            New competitor
          </Button>
          <Button
            disabled={!canStartCrawl}
            onClick={() => crawlMutation.mutate()}
            title={
              !hasCompletedParentCrawl
                ? "Select a completed project crawl first"
                : remainingToCrawl === 0
                  ? "Every competitor already has a crawl for this audit"
                  : alreadyCrawledForAudit > 0
                    ? "Already-crawled competitors for this audit are skipped"
                    : undefined
            }
            type="button"
          >
            {crawlMutation.isPending ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
                Starting…
              </>
            ) : remainingToCrawl > 0 && alreadyCrawledForAudit > 0 ? (
              `Crawl ${remainingToCrawl} remaining`
            ) : (
              "Crawl this audit"
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 px-4 lg:px-6">
          {[0, 1, 2].map((index) => (
            <CompetitorCardSkeleton key={index} />
          ))}
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-1 flex-col px-4 lg:px-6">
          <Empty className="min-h-64 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SwordsIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No competitors</EmptyTitle>
              <EmptyDescription>
                Add a site, then crawl it against the selected audit.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                disabled={atCap}
                onClick={() => setDialogOpen(true)}
                type="button"
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                New competitor
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 px-4 lg:px-6">
          {competitors.map((competitor, index) => (
            <CompetitorCard
              key={competitor.id}
              competitor={competitor}
              index={index}
              parentCrawl={currentCrawl}
              isRemoving={removingId === competitor.id}
              onOpenInsights={(crawlId, name) =>
                setInsightsTarget({ crawlId, name })
              }
              onRemove={(id) => void handleRemove(id)}
            />
          ))}
        </div>
      )}

      <Dialog onOpenChange={handleDialogOpenChange} open={dialogOpen}>
        <DialogContent>
          <form onSubmit={(event) => void handleAdd(event)}>
            <DialogHeader>
              <DialogTitle>New competitor</DialogTitle>
              <DialogDescription>
                Added to {activeProject.name}. Crawl them from this page when
                you are ready.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="mt-6 gap-4">
              <Field>
                <FieldLabel htmlFor="competitor-name">Name</FieldLabel>
                <Input
                  id="competitor-name"
                  placeholder="Competitor name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="competitor-url">Site URL</FieldLabel>
                <Input
                  id="competitor-url"
                  placeholder="https://competitor.example"
                  required
                  type="url"
                  value={seedUrl}
                  onChange={(event) => setSeedUrl(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-6">
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                disabled={!seedUrl.trim() || atCap || addMutation.isPending}
                type="submit"
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                    Adding…
                  </>
                ) : (
                  "Add competitor"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
})
