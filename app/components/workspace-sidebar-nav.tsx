"use client"

import type { ReactElement } from "react"

import {
  ActivityIcon,
  CheckIcon,
  EyeIcon,
  GaugeIcon,
  NetworkIcon,
  SearchCheckIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { Separator } from "~/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { HoverPill, useKeyedHoverPill } from "~/components/ui/hover-pill"
import { cn } from "~/lib/utils"

const auditSections = [
  ["Overview", "summary", GaugeIcon],
  ["SEO", "seo", SearchIcon],
  ["AEO", "aeo", SparklesIcon],
  ["PageSpeed", "pagespeed", ActivityIcon],
  ["Site graph", "site-graph", NetworkIcon],
] as const

function CollapsedTooltip({
  children,
  label,
  show,
}: {
  children: ReactElement
  label: string
  show: boolean
}) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

type WorkspaceSidebarNavProps = {
  auditTab: AuditTab
  gscConnector: boolean
  isSidebarCollapsed: boolean
  onSelectWorkspace: (
    nextView: DashboardView,
    nextAuditTab?: AuditTab
  ) => void
  view: DashboardView
}

export function WorkspaceSidebarNav({
  auditTab,
  gscConnector,
  isSidebarCollapsed,
  onSelectWorkspace,
  view,
}: WorkspaceSidebarNavProps) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()

  return (
    <nav aria-label="Workspace sections">
      <SidebarGroup className="mt-6 p-0">
        {isSidebarCollapsed ? null : (
          <SidebarGroupLabel className="h-auto px-2 pb-1 text-[0.7rem] font-medium tracking-widest text-muted-foreground uppercase">
            Audit
          </SidebarGroupLabel>
        )}
        <SidebarMenu className="relative" onMouseLeave={clearPill}>
          <HoverPill
            className="inset-x-1 rounded-md"
            pill={pill}
          />
          {auditSections.map(([label, tab, Icon]) => {
            const active = view === "revserp-audit" && auditTab === tab
            return (
              <SidebarMenuItem key={tab} ref={setItemRef(tab)}>
                <CollapsedTooltip label={label} show={isSidebarCollapsed}>
                  <SidebarMenuButton
                    className={
                      isSidebarCollapsed
                        ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`
                        : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`
                    }
                    isActive={active}
                    onClick={() => onSelectWorkspace("revserp-audit", tab)}
                    onMouseEnter={() => showPill(tab)}
                    title={isSidebarCollapsed ? label : undefined}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {isSidebarCollapsed ? null : label}
                    {isSidebarCollapsed ? null : (
                      <span
                        className={cn(
                          "ml-auto shrink-0",
                          active ? "text-foreground" : "invisible"
                        )}
                      >
                        <CheckIcon className="size-4" />
                      </span>
                    )}
                  </SidebarMenuButton>
                </CollapsedTooltip>
              </SidebarMenuItem>
            )
          })}
          <SidebarMenuItem className="my-3">
            <Separator />
          </SidebarMenuItem>
          <SidebarMenuItem ref={setItemRef("visibility")}>
            <CollapsedTooltip
              label="Visibility test"
              show={isSidebarCollapsed}
            >
              <SidebarMenuButton
                className={
                  isSidebarCollapsed
                    ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "revserp-visibility" ? "text-foreground font-medium" : "text-muted-foreground"}`
                    : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "revserp-visibility" ? "text-foreground font-medium" : "text-muted-foreground"}`
                }
                isActive={view === "revserp-visibility"}
                onClick={() => onSelectWorkspace("revserp-visibility")}
                onMouseEnter={() => showPill("visibility")}
                title={isSidebarCollapsed ? "Visibility test" : undefined}
                type="button"
              >
                <EyeIcon aria-hidden="true" className="size-4 shrink-0" />
                {isSidebarCollapsed ? null : "Visibility test"}
                {isSidebarCollapsed ? null : (
                  <span
                    className={cn(
                      "ml-auto shrink-0",
                      view === "revserp-visibility"
                        ? "text-foreground"
                        : "invisible"
                    )}
                  >
                    <CheckIcon className="size-4" />
                  </span>
                )}
              </SidebarMenuButton>
            </CollapsedTooltip>
          </SidebarMenuItem>
          {gscConnector ? (
            <SidebarMenuItem ref={setItemRef("search-console")}>
              <CollapsedTooltip
                label="Search Console"
                show={isSidebarCollapsed}
              >
                <SidebarMenuButton
                  className={
                    isSidebarCollapsed
                      ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "search-console" ? "text-foreground font-medium" : "text-muted-foreground"}`
                      : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "search-console" ? "text-foreground font-medium" : "text-muted-foreground"}`
                  }
                  isActive={view === "search-console"}
                  onClick={() => onSelectWorkspace("search-console")}
                  onMouseEnter={() => showPill("search-console")}
                  title={isSidebarCollapsed ? "Search Console" : undefined}
                  type="button"
                >
                  <SearchCheckIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  {isSidebarCollapsed ? null : "Search Console"}
                  {isSidebarCollapsed ? null : (
                    <span
                      className={cn(
                        "ml-auto shrink-0",
                        view === "search-console"
                          ? "text-foreground"
                          : "invisible"
                      )}
                    >
                      <CheckIcon className="size-4" />
                    </span>
                  )}
                </SidebarMenuButton>
              </CollapsedTooltip>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  )
}
