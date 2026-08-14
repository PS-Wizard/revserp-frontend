import { createContext, useContext, type ReactNode } from "react"

import type { OrgFeatures } from "~/lib/api.types"

/**
 * Feature gating for the active workspace, read from /me.
 *
 * This hides UI only. Every gated route is enforced server-side, so a client
 * that ignores this context gains nothing — it just gets 403s. Default to
 * everything enabled so a provider-less render (tests,
 * storybook, a route outside the app shell) never strips the UI.
 */
const ALL_ENABLED: OrgFeatures = {
  auto_crawl: true,
  gsc_connector: true,
  ai_chat: true,
  ai_monthly_message_limit: 50,
  ai_allowed_reasoning_efforts: ["none", "low", "high", "max"],
}

const FeaturesContext = createContext<OrgFeatures>(ALL_ENABLED)

export function FeaturesProvider({
  features,
  children,
}: {
  features: OrgFeatures | undefined
  children: ReactNode
}) {
  return (
    <FeaturesContext.Provider value={features ?? ALL_ENABLED}>
      {children}
    </FeaturesContext.Provider>
  )
}

export function useFeatures() {
  return useContext(FeaturesContext)
}
