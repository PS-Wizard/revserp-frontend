"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { Loader2, MapPinIcon, RefreshCwIcon, StarIcon } from "lucide-react"
import { toast } from "sonner"

import { Linkify } from "~/components/linkify"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Skeleton } from "~/components/ui/skeleton"
import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  MapsReview,
  MapsReviewsResponse,
  MapsVisibilityItem,
  MapsVisibilityListing,
  MapsVisibilityResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

const cardClass =
  "flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0"

export function mapsVisibilityQueryKey(projectId: string) {
  return ["maps-visibility", projectId] as const
}

function mapsReviewsQueryKey(projectId: string, placeId: string) {
  return ["maps-reviews", projectId, placeId] as const
}

async function fetchMapsReviews(projectId: string, placeId: string) {
  try {
    return await clientApiFetch<MapsReviewsResponse>(
      `/projects/${projectId}/maps-visibility/reviews?place_id=${encodeURIComponent(placeId)}`
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

function isReviewsRefetchAllowed(
  refetchAvailableAfter: string | null | undefined
) {
  if (!refetchAvailableAfter) return true
  return new Date(refetchAvailableAfter).getTime() <= Date.now()
}

async function fetchMapsVisibility(projectId: string) {
  try {
    return await clientApiFetch<MapsVisibilityResponse>(
      `/projects/${projectId}/maps-visibility`
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

function sameHost(left: string, right: string) {
  const normalize = (value: string) => {
    try {
      const url = value.includes("://") ? value : `https://${value}`
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
    } catch {
      return ""
    }
  }
  const a = normalize(left)
  const b = normalize(right)
  return Boolean(a && b && a === b)
}

function isItemMatched(
  item: MapsVisibilityItem,
  listing: MapsVisibilityListing,
  ourRank: number | null | undefined
) {
  if (ourRank != null && item.position === ourRank) return true
  if (item.matched) return true
  if (!listing.resolved) return false
  if (listing.cid && item.cid === listing.cid) return true
  if (listing.place_id && item.placeId === listing.place_id) return true
  if (
    listing.website &&
    item.website &&
    sameHost(item.website, listing.website)
  ) {
    return true
  }
  if (
    listing.title &&
    item.title &&
    listing.title.toLowerCase() === item.title.toLowerCase()
  ) {
    return true
  }
  return false
}

function isMapsTestOnCooldown(testAvailableAfter: string | null | undefined) {
  if (!testAvailableAfter) return false
  return new Date(testAvailableAfter).getTime() > Date.now()
}

function formatCooldownTime(testAvailableAfter: string) {
  return new Date(testAvailableAfter).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function MapsEmptyState({
  isStarting,
  onStart,
}: {
  isStarting: boolean
  onStart: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <MapPinIcon aria-hidden="true" className="size-5 text-sky-400" />
      </div>
      <p className="text-base font-medium text-foreground">Maps visibility</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        See where your business ranks in Google&apos;s local pack for a location
        query.
      </p>
      <Button
        className="mt-5"
        disabled={isStarting}
        onClick={onStart}
        size="sm"
        type="button"
      >
        {isStarting ? (
          <>
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Starting…
          </>
        ) : (
          "Test your rankings"
        )}
      </Button>
    </div>
  )
}

function RankingsListHeader() {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/60 pr-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      <span className="w-6 shrink-0 text-center">#</span>
      <span className="min-w-0 flex-1">Business</span>
    </div>
  )
}

function MapsRankingRow({
  item,
  isLast,
  isMatched,
  onSelect,
}: {
  item: MapsVisibilityItem
  isLast: boolean
  isMatched: boolean
  onSelect: () => void
}) {
  const secondary = item.address.trim() || item.category.trim()

  return (
    <button
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-md py-4 text-left transition-colors hover:bg-foreground/[0.03]",
        !isLast && "border-b border-border/40",
        isMatched && "bg-emerald-500/10 ring-1 ring-emerald-500/30 ring-inset"
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        className={cn(
          "w-6 shrink-0 text-center text-[13px] tabular-nums",
          isMatched ? "font-semibold text-emerald-500" : "text-muted-foreground"
        )}
      >
        {item.position}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] leading-snug font-medium",
            isMatched ? "text-foreground" : "text-foreground/90"
          )}
          title={item.title}
        >
          {item.title}
          {isMatched ? (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-500 uppercase">
              You
            </span>
          ) : null}
        </p>
        {secondary ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {secondary}
          </p>
        ) : null}
      </div>
    </button>
  )
}

function MapsRankingsList({
  items,
  listing,
  ourRank,
  onSelect,
}: {
  items: MapsVisibilityItem[]
  listing: MapsVisibilityListing
  ourRank: number | null
  onSelect: (item: MapsVisibilityItem) => void
}) {
  const sorted = useMemo(
    () => [...items].sort((left, right) => left.position - right.position),
    [items]
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
        No local pack results returned.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RankingsListHeader />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col pr-3">
          {sorted.map((item, index) => (
            <MapsRankingRow
              isLast={index === sorted.length - 1}
              isMatched={isItemMatched(item, listing, ourRank)}
              item={item}
              key={`${item.position}-${item.cid || item.placeId || item.title}`}
              onSelect={() => onSelect(item)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div
      aria-label={`${rating} out of 5 stars`}
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon
          aria-hidden="true"
          className={cn(
            "size-3.5",
            index < rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          )}
          key={index}
        />
      ))}
    </div>
  )
}

function ReviewsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}

function ReviewCard({ review }: { review: MapsReview }) {
  const media = review.media ?? []

  return (
    <article className="space-y-2.5 border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        {review.user.thumbnail ? (
          <img
            alt=""
            className="size-9 shrink-0 rounded-full object-cover"
            src={review.user.thumbnail}
          />
        ) : (
          <div className="size-9 shrink-0 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium">{review.user.name}</p>
          <p className="text-xs text-muted-foreground">
            {review.user.reviews.toLocaleString()} reviews ·{" "}
            {review.user.photos.toLocaleString()} photos
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ReviewStars rating={review.rating} />
        <span className="text-xs text-muted-foreground">{review.date}</span>
      </div>

      {review.snippet ? (
        <p className="text-sm leading-relaxed text-foreground/90">
          {review.snippet}
        </p>
      ) : null}

      {media.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {media.map((entry, index) => (
            <img
              alt=""
              className="aspect-square w-full rounded-md object-cover"
              key={`${entry.imageUrl}-${index}`}
              src={entry.imageUrl}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {review.likes > 0 ? (
          <span>{review.likes.toLocaleString()} likes</span>
        ) : (
          <span />
        )}
        {review.link ? (
          <a
            className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
            href={review.link}
            rel="noopener noreferrer"
            target="_blank"
          >
            View on Google
          </a>
        ) : null}
      </div>
    </article>
  )
}

function MapsReviewsSection({
  item,
  placeId,
  projectId,
}: {
  item: MapsVisibilityItem
  placeId: string
  projectId: string
}) {
  const queryClient = useQueryClient()

  const reviewsQuery = useQuery({
    queryKey: mapsReviewsQueryKey(projectId, placeId),
    queryFn: () => fetchMapsReviews(projectId, placeId),
    enabled: Boolean(projectId && placeId),
    staleTime: 0,
  })

  const fetchReviews = useMutation({
    mutationFn: () =>
      clientApiFetch<MapsReviewsResponse>(
        `/projects/${projectId}/maps-visibility/reviews`,
        {
          body: JSON.stringify({ place_id: placeId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(mapsReviewsQueryKey(projectId, placeId), data)
      if (data.cached) {
        toast.message("Reviews are up to date")
      }
    },
  })

  const reviewsData = reviewsQuery.data
  const sortedReviews = useMemo(() => {
    if (!reviewsData?.reviews.length) return []
    return [...reviewsData.reviews].sort(
      (left, right) =>
        new Date(right.isoDate).getTime() - new Date(left.isoDate).getTime()
    )
  }, [reviewsData?.reviews])

  const canRefresh = isReviewsRefetchAllowed(
    reviewsData?.refetch_available_after
  )
  const isFetching = fetchReviews.isPending

  if (reviewsQuery.isLoading) {
    return (
      <div className="border-t border-border/50 pt-5">
        <ReviewsSkeleton />
      </div>
    )
  }

  if (reviewsQuery.isError) {
    const message =
      reviewsQuery.error instanceof ApiError
        ? reviewsQuery.error.message
        : "Could not load reviews."
    return (
      <div className="border-t border-border/50 pt-5">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    )
  }

  if (!reviewsData) {
    return (
      <div className="border-t border-border/50 pt-5">
        <Button
          disabled={isFetching}
          onClick={() => fetchReviews.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isFetching ? (
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          Load reviews
          <span className="text-muted-foreground">(1 credit)</span>
        </Button>
        {fetchReviews.isError ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-destructive">
              {fetchReviews.error instanceof ApiError
                ? fetchReviews.error.message
                : "Could not load reviews right now."}
            </p>
            <Button
              onClick={() => fetchReviews.mutate()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-border/50 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <StarIcon
              aria-hidden="true"
              className="size-4 fill-amber-400 text-amber-400"
            />
            <span className="font-medium tabular-nums">
              {item.rating > 0 ? item.rating.toFixed(1) : "—"}
            </span>
            {item.ratingCount > 0 ? (
              <span className="text-muted-foreground tabular-nums">
                ({item.ratingCount.toLocaleString()} reviews)
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Most relevant reviews
          </p>
        </div>
        {canRefresh ? (
          <Button
            disabled={isFetching}
            onClick={() => fetchReviews.mutate()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isFetching ? (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : null}
            Refresh reviews
          </Button>
        ) : reviewsData.fetched_at ? (
          <p className="shrink-0 text-xs text-muted-foreground">
            Updated{" "}
            {formatDistanceToNow(new Date(reviewsData.fetched_at), {
              addSuffix: true,
            })}
          </p>
        ) : null}
      </div>

      {isFetching ? (
        <ReviewsSkeleton />
      ) : fetchReviews.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {fetchReviews.error instanceof ApiError
              ? fetchReviews.error.message
              : "Could not load reviews right now."}
          </p>
          <Button
            onClick={() => fetchReviews.mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : sortedReviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews returned.</p>
      ) : (
        <div className="space-y-4">
          {sortedReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Google serves the most relevant reviews, so this is a sample, not the
        full history.
      </p>
    </div>
  )
}

function MapsListingDrawer({
  item,
  onClose,
  open,
  projectId,
}: {
  item: MapsVisibilityItem | null
  onClose: () => void
  open: boolean
  projectId: string | null
}) {
  const hours = useMemo(() => {
    if (!item) return []
    return Object.entries(item.opening_hours ?? {}).filter(
      ([day, value]) => day.trim() && value.trim()
    )
  }, [item])

  return (
    <Drawer
      direction="bottom"
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      open={open}
    >
      <DrawerContent className="flex max-h-[88vh] min-h-0 flex-col overflow-hidden">
        {item ? (
          <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
            <DrawerHeader className="shrink-0">
              <DrawerTitle>{item.title}</DrawerTitle>
              <DrawerDescription>
                {item.category || item.types[0] || "Local listing"}
              </DrawerDescription>
            </DrawerHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
              {item.thumbnail_url ? (
                <img
                  alt=""
                  className="h-40 w-full rounded-lg object-cover"
                  src={item.thumbnail_url}
                />
              ) : null}

              <div className="space-y-2 text-sm">
                {item.address ? (
                  <p className="text-muted-foreground">{item.address}</p>
                ) : null}
                {item.phone_number ? (
                  <p className="text-muted-foreground">{item.phone_number}</p>
                ) : null}
                {item.website ? (
                  <p className="min-w-0 truncate">
                    <Linkify text={item.website} />
                  </p>
                ) : null}
              </div>

              {item.rating > 0 ? (
                <div className="flex items-center gap-2 text-sm">
                  <StarIcon
                    aria-hidden="true"
                    className="size-4 fill-amber-400 text-amber-400"
                  />
                  <span className="font-medium tabular-nums">
                    {item.rating.toFixed(1)}
                  </span>
                  {item.ratingCount > 0 ? (
                    <span className="text-muted-foreground tabular-nums">
                      ({item.ratingCount.toLocaleString()} reviews)
                    </span>
                  ) : null}
                </div>
              ) : null}

              {item.types.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.types.map((type) => (
                    <Badge key={type} variant="outline">
                      {type}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {hours.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Opening hours</p>
                  <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 gap-y-1.5 text-sm">
                    {hours.map(([day, value]) => (
                      <div className="contents" key={day}>
                        <dt className="text-muted-foreground">{day}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {item.cid || item.placeId ? (
                <div className="space-y-1 font-mono text-xs text-muted-foreground">
                  {item.cid ? <p>cid: {item.cid}</p> : null}
                  {item.placeId ? <p>placeId: {item.placeId}</p> : null}
                </div>
              ) : null}

              {projectId && item.placeId ? (
                <MapsReviewsSection
                  item={item}
                  placeId={item.placeId}
                  projectId={projectId}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function RunningState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <Loader2
          aria-hidden="true"
          className="size-5 animate-spin text-sky-400 motion-reduce:animate-none"
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Checking Google Maps rankings…
      </p>
    </div>
  )
}

export function OverviewMapsVisibilityCard({
  projectId,
}: {
  projectId: string | null
}) {
  const queryClient = useQueryClient()
  const [selectedItem, setSelectedItem] = useState<MapsVisibilityItem | null>(
    null
  )
  const query = useQuery({
    queryKey: projectId
      ? mapsVisibilityQueryKey(projectId)
      : ["maps-visibility-disabled"],
    queryFn: () => fetchMapsVisibility(projectId!),
    enabled: Boolean(projectId),
    staleTime: 0,
    placeholderData: (previous) => previous,
  })

  const startRun = useMutation({
    mutationFn: () =>
      clientApiFetch<MapsVisibilityResponse>(
        `/projects/${projectId!}/maps-visibility/runs`,
        { method: "POST" }
      ),
    onSuccess: (data) => {
      if (projectId) {
        queryClient.setQueryData(mapsVisibilityQueryKey(projectId), data)
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 400 || error.status === 429) {
          toast.error(error.message)
          return
        }
        toast.error(error.message || "Could not start maps visibility check.")
        return
      }
      toast.error("Could not start maps visibility check.")
    },
  })

  const data = query.data
  const isRunning = data?.status === "queued" || data?.status === "running"
  const isCompleted = data?.status === "completed"
  const isFailed = data?.status === "failed"
  const onCooldown = isMapsTestOnCooldown(data?.test_available_after)
  const canStart = Boolean(projectId) && !isRunning && !startRun.isPending
  const canRetestCompleted = canStart && !onCooldown

  const handleStart = () => {
    if (!projectId || !canStart) return
    startRun.mutate()
  }

  let body: ReactNode

  if (!projectId) {
    body = (
      <div className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
        Select a project to see maps visibility.
      </div>
    )
  } else if (query.isLoading && data === undefined) {
    body = (
      <div className="space-y-3 px-5 py-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  } else if (query.isError) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {query.error instanceof ApiError
            ? query.error.message
            : "Could not load maps visibility."}
        </p>
        <Button onClick={() => void query.refetch()} size="sm" type="button">
          Try again
        </Button>
      </div>
    )
  } else if (!data) {
    body = (
      <MapsEmptyState isStarting={startRun.isPending} onStart={handleStart} />
    )
  } else if (isRunning) {
    body = <RunningState />
  } else if (isFailed) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-destructive">
          {data.error || "Maps visibility check failed."}
        </p>
        <Button
          disabled={!canStart}
          onClick={handleStart}
          size="sm"
          type="button"
          variant="outline"
        >
          {startRun.isPending ? (
            <>
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Retrying…
            </>
          ) : (
            "Try again"
          )}
        </Button>
      </div>
    )
  } else if (isCompleted) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
        <MapsRankingsList
          items={data.items}
          listing={data.listing}
          onSelect={setSelectedItem}
          ourRank={data.our_rank}
        />
      </div>
    )
  } else {
    body = (
      <MapsEmptyState isStarting={startRun.isPending} onStart={handleStart} />
    )
  }

  return (
    <>
      <Card className={cardClass}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="truncate font-heading text-base font-semibold tracking-tight">
            Maps visibility
          </h3>
          {data && isCompleted ? (
            onCooldown && data.test_available_after ? (
              <p className="shrink-0 text-xs text-muted-foreground">
                Next test available{" "}
                {formatCooldownTime(data.test_available_after)}
              </p>
            ) : (
              <Button
                disabled={!canRetestCompleted}
                onClick={handleStart}
                size="sm"
                type="button"
                variant="outline"
              >
                {startRun.isPending ? (
                  <RefreshCwIcon
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <RefreshCwIcon aria-hidden="true" className="size-4" />
                )}
                Test again
              </Button>
            )
          ) : null}
        </div>
        {body}
      </Card>

      <MapsListingDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        open={selectedItem !== null}
        projectId={projectId}
      />
    </>
  )
}
