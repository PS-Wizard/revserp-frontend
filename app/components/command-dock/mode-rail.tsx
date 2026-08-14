"use client"

import { memo } from "react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu"
import { useFeatures } from "~/lib/features"

type ModeRailProps = {
  view: DashboardView
  auditTab: AuditTab
  compareLabel: string | null
  onAuditTabChange: (tab: AuditTab) => void
  onViewChange: (view: DashboardView) => void
}

const AUDIT_OPTIONS = [
  { id: "summary", label: "Summary" },
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "site-graph", label: "Site Graph" },
] as const

export const ModeRail = memo(function ModeRail({
  view,
  auditTab,
  compareLabel,
  onAuditTabChange,
  onViewChange,
}: ModeRailProps) {
  const features = useFeatures()
  const selectAudit = (tab: AuditTab) => {
    onViewChange("revserp-audit")
    onAuditTabChange(tab)
  }

  return (
    <NavigationMenu
      aria-label="Primary navigation"
      className="max-w-full min-w-0"
    >
      <NavigationMenuList className="max-w-full justify-start overflow-x-auto">
        <NavigationMenuItem>
          <NavigationMenuTrigger onClick={() => selectAudit("summary")}>
            Audit
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="flex min-w-32 flex-col gap-1">
              {AUDIT_OPTIONS.map((option) => (
                <NavigationMenuLink
                  active={view === "revserp-audit" && auditTab === option.id}
                  closeOnClick
                  key={option.id}
                  onClick={() => selectAudit(option.id)}
                  render={<button type="button" />}
                >
                  {option.label}
                </NavigationMenuLink>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink
            active={view === "revserp-visibility"}
            className={navigationMenuTriggerStyle()}
            onClick={() => onViewChange("revserp-visibility")}
            render={<button type="button" />}
          >
            Visibility
          </NavigationMenuLink>
        </NavigationMenuItem>

        {features.gsc_connector ? (
          <NavigationMenuItem>
            <NavigationMenuLink
              active={view === "search-console"}
              className={navigationMenuTriggerStyle()}
              onClick={() => onViewChange("search-console")}
              render={<button type="button" />}
            >
              Search Console
            </NavigationMenuLink>
          </NavigationMenuItem>
        ) : null}

        {features.ai_chat ? (
          <NavigationMenuItem>
            <NavigationMenuLink
              active={view === "revbot"}
              className={navigationMenuTriggerStyle()}
              onClick={() => onViewChange("revbot")}
              render={<button type="button" />}
            >
              Revbot
            </NavigationMenuLink>
          </NavigationMenuItem>
        ) : null}

        {compareLabel ? (
          <NavigationMenuItem>
            <NavigationMenuLink
              active={view === "compare"}
              className={navigationMenuTriggerStyle()}
              onClick={() => onViewChange("compare")}
              render={<button type="button" />}
            >
              {compareLabel}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ) : null}
      </NavigationMenuList>
    </NavigationMenu>
  )
})
