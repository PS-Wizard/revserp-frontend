"use client"

import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import { clientApiPut } from "~/lib/api"
import { serverApiFetch } from "~/lib/api"
import { requirePlatformAdmin } from "~/lib/auth.server"
import type {
  ScoreBreakdownResponse,
  ScoringConfig,
  ScoringConfigResponse,
} from "~/lib/api.types"
import { ScoringEditor } from "./scoring/editor"

export async function loader({ request }: LoaderFunctionArgs) {
  const me = await requirePlatformAdmin(request)
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

  const crawlId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("crawl")
      : null

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[104rem] flex-col gap-6 px-4 py-10 sm:px-6 lg:px-4">
        <ScoringEditor
          key={JSON.stringify(config)}
          config={config}
          defaultConfig={defaultConfig}
          baselineBreakdown={baselineBreakdown}
          crawlId={crawlId}
          onSave={async (draftConfig) => {
            const response = await clientApiPut<ScoringConfigResponse>(
              "/internal/scoring-config",
              { config: draftConfig }
            )
            return response.config
          }}
        />
      </div>
    </main>
  )
}
