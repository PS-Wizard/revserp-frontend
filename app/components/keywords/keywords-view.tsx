"use client"

import { OverviewGSCRankingsCard } from "~/components/overview-gsc-rankings-card"
import { OverviewMapsVisibilityCard } from "~/components/overview-maps-visibility-card"
import { OverviewTargetKeywordsCard } from "~/components/overview-target-keywords-card"
import { useFeatures } from "~/lib/features"

import { KeywordsCoverage } from "./keywords-coverage"

type Props = {
  projectId: string | null
}

export function KeywordsView({ projectId }: Props) {
  const features = useFeatures()
  const showRankings = features.gsc_connector !== false

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          Keywords
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See which target phrases have a home on your site — and which need one.
        </p>
      </div>

      <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[36rem] lg:h-[36rem] lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:px-6">
        <div className="min-h-0">
          <KeywordsCoverage projectId={projectId} />
        </div>
        <div className="min-h-0">
          <OverviewTargetKeywordsCard projectId={projectId} />
        </div>
      </div>

      {showRankings ? (
        <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[36rem] lg:h-[36rem] lg:grid-cols-3 lg:px-6">
          <div className="min-h-0 lg:col-span-2">
            <OverviewGSCRankingsCard projectId={projectId} />
          </div>
          <div className="min-h-0">
            <OverviewMapsVisibilityCard projectId={projectId} />
          </div>
        </div>
      ) : (
        <div className="px-4 lg:px-6">
          <div className="h-[36rem] min-h-0 max-lg:h-auto max-lg:min-h-[32rem]">
            <OverviewMapsVisibilityCard projectId={projectId} />
          </div>
        </div>
      )}
    </div>
  )
}
