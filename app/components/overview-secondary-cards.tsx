"use client"

import { OverviewGSCRankingsCard } from "~/components/overview-gsc-rankings-card"
import { OverviewTargetKeywordsCard } from "~/components/overview-target-keywords-card"
import { useFeatures } from "~/lib/features"

export function OverviewSecondaryCards({
  projectId,
}: {
  projectId: string | null
}) {
  const features = useFeatures()
  const showRankings = features.gsc_connector !== false

  return (
    <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[32rem] lg:h-[36rem] lg:grid-cols-3 lg:grid-rows-1 lg:px-6">
      {showRankings ? (
        <div className="min-h-0 lg:col-span-2">
          <OverviewGSCRankingsCard projectId={projectId} />
        </div>
      ) : null}
      <div className="min-h-0">
        <OverviewTargetKeywordsCard projectId={projectId} />
      </div>
    </div>
  )
}
