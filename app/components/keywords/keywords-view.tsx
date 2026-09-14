"use client"

import { OverviewSecondaryCards } from "~/components/overview-secondary-cards"

import { KeywordsCoverage } from "./keywords-coverage"

type Props = {
  projectId: string | null
}

export function KeywordsView({ projectId }: Props) {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          Keywords
        </h1>
      </div>
      <KeywordsCoverage projectId={projectId} />
      <OverviewSecondaryCards projectId={projectId} />
    </div>
  )
}
