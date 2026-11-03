import type {
  AdminWorkspaceFeatures,
  MeUsageResponse,
} from "~/lib/api.types"

export type TierId = "baseline" | "pro" | "customized"

export type TierPreset = {
  id: Exclude<TierId, "customized">
  label: string
  tagline: string
  ai_monthly_message_limit: number
  ai_visibility_audit_monthly_limit: number
  max_projects: number
  max_competitors: number
  ai_concurrent_turn_limit_per_user: number
  maps_credits_included: number
}

/**
 * Frontend-only tier labels. There is no plan column in the DB: a workspace
 * matches a tier when its limits equal the preset, else it is "customized".
 *
 * Baseline equals the backend defaults exactly (COALESCE fallbacks in
 * organization_features.sql, 500-credit grant in migration 000090).
 * Pro numbers are a starting suggestion — tweak them here, one place.
 */
export const TIER_PRESETS: Record<Exclude<TierId, "customized">, TierPreset> = {
  baseline: {
    id: "baseline",
    label: "Baseline",
    tagline: "Default limits for every new workspace.",
    ai_monthly_message_limit: 50,
    ai_visibility_audit_monthly_limit: 10,
    max_projects: 1,
    max_competitors: 3,
    ai_concurrent_turn_limit_per_user: 2,
    maps_credits_included: 500,
  },
  pro: {
    id: "pro",
    label: "Pro",
    tagline: "Higher limits for busy workspaces.",
    ai_monthly_message_limit: 250,
    ai_visibility_audit_monthly_limit: 50,
    max_projects: 5,
    max_competitors: 10,
    ai_concurrent_turn_limit_per_user: 2,
    maps_credits_included: 1000,
  },
}

export const TIER_LABELS: Record<TierId, string> = {
  baseline: "Baseline",
  pro: "Pro",
  customized: "Customized",
}

type TierLimits = {
  messages: number
  audits: number
  projects: number
  competitors: number
}

function matchesPreset(limits: TierLimits, preset: TierPreset): boolean {
  return (
    limits.messages === preset.ai_monthly_message_limit &&
    limits.audits === preset.ai_visibility_audit_monthly_limit &&
    limits.projects === preset.max_projects &&
    limits.competitors === preset.max_competitors
  )
}

function tierForLimits(limits: TierLimits): TierId {
  if (matchesPreset(limits, TIER_PRESETS.baseline)) return "baseline"
  if (matchesPreset(limits, TIER_PRESETS.pro)) return "pro"
  return "customized"
}

/** Tier for the usage popup. Maps credits are excluded: the balance moves as credits are spent or topped up, so it can never match a preset. */
export function getTierForUsage(usage: MeUsageResponse): TierId {
  return tierForLimits({
    messages: usage.ai_messages.limit,
    audits: usage.ai_visibility_audits.limit,
    projects: usage.projects.limit,
    competitors: usage.max_competitors_per_project,
  })
}

function matchesWorkspacePreset(
  workspace: AdminWorkspaceFeatures,
  preset: TierPreset
): boolean {
  return (
    workspace.auto_crawl &&
    workspace.gsc_connector &&
    workspace.ai_chat &&
    workspace.integrations &&
    !workspace.ai_use_internal_prompt &&
    matchesPreset(
      {
        messages: workspace.ai_monthly_message_limit,
        audits: workspace.ai_visibility_audit_monthly_limit,
        projects: workspace.max_projects,
        competitors: workspace.max_competitors,
      },
      preset
    ) &&
    workspace.ai_concurrent_turn_limit_per_user ===
      preset.ai_concurrent_turn_limit_per_user
  )
}

/**
 * Tier for the admin workspaces list. Toggles count too: a workspace with a
 * feature switched off is customized even when its numbers match a preset.
 */
export function getTierForWorkspaceFeatures(
  workspace: AdminWorkspaceFeatures
): TierId {
  if (matchesWorkspacePreset(workspace, TIER_PRESETS.baseline))
    return "baseline"
  if (matchesWorkspacePreset(workspace, TIER_PRESETS.pro)) return "pro"
  return "customized"
}

/** Patch for the admin drawer: fills the inputs with the preset. */
export function presetPatch(
  preset: TierPreset
): Partial<AdminWorkspaceFeatures> {
  return {
    auto_crawl: true,
    gsc_connector: true,
    ai_chat: true,
    integrations: true,
    ai_use_internal_prompt: false,
    ai_monthly_message_limit: preset.ai_monthly_message_limit,
    ai_visibility_audit_monthly_limit:
      preset.ai_visibility_audit_monthly_limit,
    max_competitors: preset.max_competitors,
    max_projects: preset.max_projects,
    ai_concurrent_turn_limit_per_user:
      preset.ai_concurrent_turn_limit_per_user,
  }
}

const numberFormat = new Intl.NumberFormat()

/** Bullet lines for a plan card, e.g. "500 AI messages / month". */
export function tierFacts(preset: TierPreset): string[] {
  return [
    `${numberFormat.format(preset.ai_monthly_message_limit)} AI messages / month`,
    `${numberFormat.format(preset.ai_visibility_audit_monthly_limit)} visibility audits / month`,
    `${numberFormat.format(preset.max_projects)} project${preset.max_projects === 1 ? "" : "s"}`,
    `${numberFormat.format(preset.max_competitors)} competitors per project`,
    `${numberFormat.format(preset.maps_credits_included)} maps credits included`,
  ]
}
