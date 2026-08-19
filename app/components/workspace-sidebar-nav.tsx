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
  SummaryIcon,
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

// The calm summary home is a separate section from the audit breakdowns —
// same treatment the Visibility/Search Console section gets below. Overview
// keeps the audit tab set as it always was.
const auditSections = [
  ["Overview", "overview", GaugeIcon],
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

type NavItemProps = {
  label: string
  icon: typeof GaugeIcon
  active: boolean
  collapsed: boolean
  onClick: () => void
  itemRef: (element: HTMLElement | null) => void
  onMouseEnter: () => void
}

function NavItem({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
  itemRef,
  onMouseEnter,
}: NavItemProps) {
  return (
    <SidebarMenuItem ref={itemRef}>
      <CollapsedTooltip label={label} show={collapsed}>
        <SidebarMenuButton
          className={
            collapsed
              ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "font-medium text-foreground" : "text-muted-foreground"}`
              : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "font-medium text-foreground" : "text-muted-foreground"}`
          }
          isActive={active}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          title={collapsed ? label : undefined}
          type="button"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {collapsed ? null : label}
          {collapsed ? null : (
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
}

type WorkspaceSidebarNavProps = {
  auditTab: AuditTab
  gscConnector: boolean
  isSidebarCollapsed: boolean
  onSelectWorkspace: (nextView: DashboardView, nextAuditTab?: AuditTab) => void
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
          <HoverPill className="inset-x-1 rounded-md" pill={pill} />
          <NavItem
            label="Summary"
            icon={SummaryIcon}
            active={view === "revserp-audit" && auditTab === "summary"}
            collapsed={isSidebarCollapsed}
            onClick={() => onSelectWorkspace("revserp-audit", "summary")}
            itemRef={setItemRef("summary")}
            onMouseEnter={() => showPill("summary")}
          />
          <SidebarMenuItem className="my-3">
            <Separator />
          </SidebarMenuItem>
          {auditSections.map(([label, tab, Icon]) => (
            <NavItem
              key={tab}
              label={label}
              icon={Icon}
              active={view === "revserp-audit" && auditTab === tab}
              collapsed={isSidebarCollapsed}
              onClick={() => onSelectWorkspace("revserp-audit", tab)}
              itemRef={setItemRef(tab)}
              onMouseEnter={() => showPill(tab)}
            />
          ))}
          <SidebarMenuItem className="my-3">
            <Separator />
          </SidebarMenuItem>
          <NavItem
            label="Visibility test"
            icon={EyeIcon}
            active={view === "revserp-visibility"}
            collapsed={isSidebarCollapsed}
            onClick={() => onSelectWorkspace("revserp-visibility")}
            itemRef={setItemRef("visibility")}
            onMouseEnter={() => showPill("visibility")}
          />
          {gscConnector ? (
            <NavItem
              label="Search Console"
              icon={SearchCheckIcon}
              active={view === "search-console"}
              collapsed={isSidebarCollapsed}
              onClick={() => onSelectWorkspace("search-console")}
              itemRef={setItemRef("search-console")}
              onMouseEnter={() => showPill("search-console")}
            />
          ) : null}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  )
}
