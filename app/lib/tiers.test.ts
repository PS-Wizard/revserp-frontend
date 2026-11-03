import { describe, expect, test } from "bun:test"

import type {
  AdminWorkspaceFeatures,
  MeUsageResponse,
} from "~/lib/api.types"
import {
  getTierForUsage,
  getTierForWorkspaceFeatures,
  presetPatch,
  TIER_PRESETS,
  tierFacts,
} from "./tiers"

function usageWith(overrides: {
  messages?: number
  audits?: number
  projects?: number
  competitors?: number
}): MeUsageResponse {
  return {
    organization_id: "org-1",
    period_start: "2026-11-01",
    period_end: "2026-12-01",
    ai_messages: { used: 0, limit: overrides.messages ?? 50 },
    ai_visibility_audits: { used: 0, limit: overrides.audits ?? 10 },
    projects: { used: 0, limit: overrides.projects ?? 1 },
    max_competitors_per_project: overrides.competitors ?? 3,
    maps_credits: { remaining: 500, reserved: 0, spent: 0 },
  }
}

function workspaceWith(
  overrides: Partial<AdminWorkspaceFeatures>
): AdminWorkspaceFeatures {
  return {
    org_id: "org-1",
    org_name: "Acme",
    auto_crawl: true,
    gsc_connector: true,
    ai_chat: true,
    integrations: true,
    ai_use_internal_prompt: false,
    ai_monthly_message_limit: 50,
    ai_concurrent_turn_limit_per_user: 2,
    ai_allowed_reasoning_efforts: ["none", "low", "high", "max"],
    max_competitors: 3,
    max_projects: 1,
    ai_visibility_audit_monthly_limit: 10,
    disabled_ai_tools: [],
    ...overrides,
  }
}

describe("tiers", () => {
  test("baseline defaults match the backend defaults", () => {
    expect(TIER_PRESETS.baseline.ai_monthly_message_limit).toBe(50)
    expect(TIER_PRESETS.baseline.ai_visibility_audit_monthly_limit).toBe(10)
    expect(TIER_PRESETS.baseline.max_projects).toBe(1)
    expect(TIER_PRESETS.baseline.max_competitors).toBe(3)
    expect(TIER_PRESETS.baseline.ai_concurrent_turn_limit_per_user).toBe(2)
    expect(TIER_PRESETS.baseline.maps_credits_included).toBe(500)
  })

  test("usage with default limits is baseline", () => {
    expect(getTierForUsage(usageWith({}))).toBe("baseline")
  })

  test("usage with pro limits is pro", () => {
    expect(
      getTierForUsage(
        usageWith({ messages: 250, audits: 50, projects: 5, competitors: 10 })
      )
    ).toBe("pro")
  })

  test("usage with mixed limits is customized", () => {
    expect(getTierForUsage(usageWith({ messages: 500 }))).toBe("customized")
  })

  test("maps balance does not affect the tier", () => {
    const usage = usageWith({})
    usage.maps_credits = { remaining: 12, reserved: 3, spent: 485 }
    expect(getTierForUsage(usage)).toBe("baseline")
  })

  test("default workspace features are baseline", () => {
    expect(getTierForWorkspaceFeatures(workspaceWith({}))).toBe("baseline")
  })

  test("preset patch applied to a workspace matches the tier", () => {
    expect(
      getTierForWorkspaceFeatures(
        workspaceWith(presetPatch(TIER_PRESETS.pro))
      )
    ).toBe("pro")
    expect(
      getTierForWorkspaceFeatures(
        workspaceWith({
          ...presetPatch(TIER_PRESETS.pro),
          ai_monthly_message_limit: 51,
        })
      )
    ).toBe("customized")
  })

  test("a switched-off feature means customized", () => {
    expect(
      getTierForWorkspaceFeatures(workspaceWith({ gsc_connector: false }))
    ).toBe("customized")
  })

  test("tier facts list what each plan gets", () => {
    expect(tierFacts(TIER_PRESETS.baseline)).toEqual([
      "50 AI messages / month",
      "10 visibility audits / month",
      "1 project",
      "3 competitors per project",
      "500 maps credits included",
    ])
  })
})
