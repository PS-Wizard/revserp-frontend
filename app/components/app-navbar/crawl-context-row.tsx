import {
  ArrowLeftRightIcon,
  BanIcon,
  CheckIcon,
  DownloadIcon,
  TrashIcon,
} from "lucide-react"

import { ThinkingOrb } from "thinking-orbs"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import type { CrawlResponse } from "~/lib/api.types"

import type { ExportFormat } from "./types"
import { formatCrawlDateTime, formatCrawlStats } from "./utils"

type CrawlContextRowProps = {
  crawl: CrawlResponse
  disabled: boolean
  exportFormat: ExportFormat
  isActive: boolean
  isCancelling: boolean
  isDeleting: boolean
  isExporting: boolean
  onCancel: () => void
  /** Present only when this crawl can be compared against the current one. */
  onCompare?: () => void
  onDelete: () => void
  onExport: (format: ExportFormat) => void
  onFormatChange: (format: ExportFormat) => void
  onSelect: () => void
}

export function CrawlContextRow({
  crawl,
  disabled,
  exportFormat,
  isActive,
  isCancelling,
  isDeleting,
  isExporting,
  onCancel,
  onCompare,
  onDelete,
  onExport,
  onFormatChange,
  onSelect,
}: CrawlContextRowProps) {
  const canExport = crawl.status === "completed"
  const canCancel = crawl.status === "queued" || crawl.status === "running"
  const canDelete = crawl.status !== "queued" && crawl.status !== "running"

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="group/crawl relative">
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none data-[active=true]:bg-accent/80 data-[active=true]:text-accent-foreground"
          data-active={isActive}
          onClick={onSelect}
          type="button"
        >
          {isActive ? <CheckIcon className="size-4" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {formatCrawlDateTime(crawl)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatCrawlStats(crawl)}
            </p>
          </div>
          <span
            className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase transition data-[compare=true]:group-hover/crawl:opacity-0"
            data-compare={onCompare !== undefined}
          >
            {crawl.status}
          </span>
        </button>
        {onCompare ? (
          <button
            className="absolute top-1/2 right-2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border border-border/70 bg-popover px-2 py-1 text-[11px] opacity-0 transition group-hover/crawl:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
            onClick={onCompare}
            type="button"
          >
            <ArrowLeftRightIcon className="size-3" />
            Compare
          </button>
        ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canExport || disabled}>
              {isExporting ? (
                <ThinkingOrb
                  aria-label="Exporting crawl"
                  className="shrink-0"
                  size={20}
                  state="working"
                  style={{ width: 16, height: 16 }}
                />
              ) : (
                <DownloadIcon />
              )}
              Export
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              <ContextMenuGroup>
                <ContextMenuRadioGroup
                  value={exportFormat}
                  onValueChange={(value) =>
                    onFormatChange(value as ExportFormat)
                  }
                >
                  <ContextMenuRadioItem value="xlsx">XLSX</ContextMenuRadioItem>
                  <ContextMenuRadioItem value="csv">CSV</ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={!canExport || disabled}
                  onClick={() => onExport(exportFormat)}
                >
                  {isExporting ? (
                    <ThinkingOrb
                      aria-label="Exporting crawl"
                      className="shrink-0"
                      size={20}
                      state="working"
                      style={{ width: 16, height: 16 }}
                    />
                  ) : (
                    <DownloadIcon />
                  )}
                  Export {exportFormat.toUpperCase()}
                </ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {canCancel ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem disabled={isCancelling} onClick={onCancel}>
                {isCancelling ? (
                  <ThinkingOrb
                    aria-label="Cancelling crawl"
                    className="shrink-0"
                    size={20}
                    state="working"
                    style={{ width: 16, height: 16 }}
                  />
                ) : (
                  <BanIcon />
                )}
                Cancel crawl
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canDelete || disabled}
            onClick={onDelete}
            variant="destructive"
          >
            {isDeleting ? (
              <ThinkingOrb
                aria-label="Deleting crawl"
                className="shrink-0"
                size={20}
                state="working"
                style={{ width: 16, height: 16 }}
              />
            ) : (
              <TrashIcon />
            )}
            Delete crawl
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
