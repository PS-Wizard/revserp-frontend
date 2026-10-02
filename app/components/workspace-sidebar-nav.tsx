"use client"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import {
  ActivityIcon,
  BlocksIcon,
  ChartNoAxesCombinedIcon,
  CheckIcon,
  EyeIcon,
  FileSearchIcon,
  GaugeIcon,
  NetworkIcon,
  SearchCheckIcon,
  SearchIcon,
  SparklesIcon,
  SwordsIcon,
  TagsIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { cn } from "~/lib/utils"

// The calm summary home is a separate section from the audit breakdowns —
// same treatment the Visibility/Search Console section gets below. Overview
// keeps the audit tab set as it always was.
export const auditSections = [
  ["Overview", "overview", GaugeIcon],
  ["SEO", "seo", SearchIcon],
  ["AEO", "aeo", SparklesIcon],
  ["PageSpeed", "pagespeed", ActivityIcon],
  ["Pages", "pages", FileSearchIcon],
  ["Site graph", "site-graph", NetworkIcon],
] as const

const AUDIT_TAB_DESCRIPTIONS: Record<AuditTab, string> = {
  overview: "Pillar scores from the latest crawl.",
  seo: "Search issues found across every crawled page.",
  aeo: "How well answer engines can read the site.",
  pagespeed: "Core Web Vitals and loading performance.",
  pages: "Every crawled page with the issues on it.",
  "site-graph": "How the pages link to one another.",
}

export type NavTab = {
  key: string
  label: string
  /** Shown in the dock panel; the mobile drawer lists labels only. */
  description: string
  Icon: typeof GaugeIcon
  view: DashboardView
  auditTab?: AuditTab
}

export type NavGroup = {
  key: string
  label: string
  tabs: NavTab[]
}

type BuildGroupsInput = {
  gscConnector: boolean
  integrations: boolean
  maxCompetitors: number
}

/**
 * Groups the workspace tabs by the question each one answers, not by where its
 * data comes from. That is why Search Console sits with Keywords: both answer
 * "how do I show up in search".
 */
export function buildWorkspaceNavGroups({
  gscConnector,
  integrations,
  maxCompetitors,
}: BuildGroupsInput): NavGroup[] {
  const visibility: NavTab[] = []
  if (gscConnector) {
    visibility.push(
      {
        key: "search-console",
        label: "Search Console",
        description: "Queries, clicks and impressions from Google.",
        Icon: SearchCheckIcon,
        view: "search-console",
      },
      {
        key: "analytics",
        label: "Google Analytics",
        description: "Traffic, engagement and conversions.",
        Icon: ChartNoAxesCombinedIcon,
        view: "analytics",
      }
    )
  }
  visibility.push(
    {
      key: "keywords",
      label: "Keywords",
      description: "Coverage, gaps and cannibalised terms.",
      Icon: TagsIcon,
      view: "keywords",
    },
    {
      key: "visibility-test",
      label: "Visibility test",
      description: "Whether AI answers cite your site.",
      Icon: EyeIcon,
      view: "revserp-visibility",
    }
  )

  const compare: NavTab[] = []
  if (maxCompetitors > 0) {
    compare.push({
      key: "competitors",
      label: "Competitors",
      description: "Your crawl set measured against other sites.",
      Icon: SwordsIcon,
      view: "competitors",
    })
  }

  const content: NavTab[] = []
  if (integrations) {
    content.push({
      key: "cms",
      label: "CMS",
      description: "Connect a provider and review site content tools.",
      Icon: BlocksIcon,
      view: "cms",
    })
  }

  return [
    {
      key: "audit",
      label: "Audit",
      tabs: auditSections.map(([label, tab, Icon]): NavTab => ({
        key: `audit-${tab}`,
        label,
        description: AUDIT_TAB_DESCRIPTIONS[tab],
        Icon,
        view: "revserp-audit",
        auditTab: tab,
      })),
    },
    { key: "visibility", label: "Visibility", tabs: visibility },
    { key: "compare", label: "Compare", tabs: compare },
    { key: "content", label: "Content", tabs: content },
  ].filter((group) => group.tabs.length > 0)
}

export function isWorkspaceTabActive(
  tab: NavTab,
  view: DashboardView,
  auditTab: AuditTab
): boolean {
  return (
    tab.view === view &&
    (tab.auditTab === undefined || tab.auditTab === auditTab)
  )
}

export function findActiveGroupIndex(
  groups: NavGroup[],
  view: DashboardView,
  auditTab: AuditTab
): number {
  const index = groups.findIndex((group) =>
    group.tabs.some((tab) => isWorkspaceTabActive(tab, view, auditTab))
  )
  return index === -1 ? 0 : index
}

export function findActiveTabKey(
  groups: NavGroup[],
  view: DashboardView,
  auditTab: AuditTab
): string | null {
  for (const group of groups) {
    for (const tab of group.tabs) {
      if (isWorkspaceTabActive(tab, view, auditTab)) return tab.key
    }
  }
  return null
}

/**
 * The mobile drawer. Every group is listed with its tabs, because the drawer has
 * height to spare and hiding tabs behind pagination in a vertical list would
 * only add friction.
 */
export function WorkspaceSidebarNav({
  auditTab,
  gscConnector,
  integrations,
  maxCompetitors,
  onSelectWorkspace,
  view,
}: {
  auditTab: AuditTab
  gscConnector: boolean
  integrations: boolean
  maxCompetitors: number
  onSelectWorkspace: (nextView: DashboardView, nextAuditTab?: AuditTab) => void
  view: DashboardView
}) {
  const groups = buildWorkspaceNavGroups({
    gscConnector,
    integrations,
    maxCompetitors,
  })

  return (
    <nav aria-label="Workspace sections" className="flex w-full flex-col gap-1">
      {groups.map((group) => (
        <SidebarGroup className="p-0" key={group.key}>
          <SidebarGroupLabel className="h-auto px-2 pb-1 text-[0.7rem] font-medium tracking-widest text-muted-foreground uppercase">
            {group.label}
          </SidebarGroupLabel>
          <SidebarMenu>
            {group.tabs.map((tab) => {
              const active = isWorkspaceTabActive(tab, view, auditTab)
              return (
                <SidebarMenuItem key={tab.key}>
                  <SidebarMenuButton
                    className={cn(
                      "!h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
                      active
                        ? "bg-foreground/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    )}
                    isActive={active}
                    onClick={() => onSelectWorkspace(tab.view, tab.auditTab)}
                    type="button"
                  >
                    <tab.Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0",
                        active ? "" : "invisible"
                      )}
                    >
                      <CheckIcon className="size-4" />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </nav>
  )
}
