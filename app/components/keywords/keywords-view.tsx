"use client"

import {
  CombinedKeywordCloudCard,
  CombinedKeywordsCard,
  DefineYourKeywordsCard,
  SuggestedKeywordsCard,
} from "~/components/keyword-management/project-keyword-cards"
import { KeywordsCoverage } from "~/components/keywords/keywords-coverage"

type Props = {
  projectId: string | null
}

export function KeywordsView({ projectId }: Props) {
  // Key cards by project so drafts, busy flags, errors, tabs, and the
  // suggestion watcher reset on project switch instead of leaking across.
  const cardKey = projectId ?? "none"

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[30rem] lg:h-[48rem] lg:grid-cols-3 lg:px-6">
        <div className="min-h-0">
          <DefineYourKeywordsCard
            key={`define-${cardKey}`}
            projectId={projectId}
          />
        </div>
        <div className="min-h-0">
          <SuggestedKeywordsCard
            key={`suggested-${cardKey}`}
            projectId={projectId}
          />
        </div>
        <div className="min-h-0">
          <CombinedKeywordsCard
            key={`combined-${cardKey}`}
            projectId={projectId}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[30rem] lg:h-[44rem] lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:px-6">
        <div className="min-h-0">
          <KeywordsCoverage key={`coverage-${cardKey}`} projectId={projectId} />
        </div>
        <div className="min-h-0">
          <CombinedKeywordCloudCard
            key={`cloud-${cardKey}`}
            projectId={projectId}
          />
        </div>
      </div>
    </div>
  )
}
