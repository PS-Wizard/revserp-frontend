import type { ReactNode } from "react"
import { ArrowLeftIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { cn } from "~/lib/utils"
import {
  LOCAL_SEO_MAP_SIDEBAR_TABS,
  type LocalSeoMapSidebarTab,
} from "~/components/local-seo-map-sidebar"

export type LocalSeoMapDetailPanelProps = {
  title: string
  meta?: string
  pill?: string
  onClose: () => void
  onBack?: () => void
  backClassName?: string
  activeTab?: LocalSeoMapSidebarTab
  onTabChange?: (tab: LocalSeoMapSidebarTab) => void
  children: ReactNode
}

export function LocalSeoMapDetailPanel({
  title,
  meta,
  pill,
  onClose,
  onBack,
  backClassName,
  activeTab,
  onTabChange,
  children,
}: LocalSeoMapDetailPanelProps) {
  const showTabs = activeTab !== undefined && onTabChange !== undefined

  return (
    <div
      id="local-seo-map-detail"
      role="region"
      aria-label={`${title} details`}
      className="pointer-events-auto flex min-h-0 w-[clamp(21rem,26vw,24rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        {onBack ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back to locations"
            className={cn("-ml-2 size-7", backClassName)}
            onClick={onBack}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <h2 className="truncate text-sm leading-tight font-medium text-foreground">
            {title}
          </h2>
          {meta || pill ? (
            <div className="flex min-w-0 items-center gap-2">
              {meta ? (
                <p className="truncate text-xs leading-tight text-muted-foreground">
                  {meta}
                </p>
              ) : null}
              {pill ? (
                <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {pill}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close details"
          className="-mr-2 size-7"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      {showTabs ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as LocalSeoMapSidebarTab)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="shrink-0 px-4 pt-2">
            <TabsList variant="line" className="w-full">
              {LOCAL_SEO_MAP_SIDEBAR_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-1.5 text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <TabsContent value={activeTab}>{children}</TabsContent>
          </div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      )}
    </div>
  )
}
