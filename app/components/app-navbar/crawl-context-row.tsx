import { CheckIcon, DownloadIcon, TrashIcon } from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
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
  isDeleting: boolean
  isExporting: boolean
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
  isDeleting,
  isExporting,
  onDelete,
  onExport,
  onFormatChange,
  onSelect,
}: CrawlContextRowProps) {
  const canExport = crawl.status === "completed"
  const canDelete = crawl.status !== "queued" && crawl.status !== "running"

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none data-[active=true]:bg-accent/80 data-[active=true]:text-accent-foreground"
          data-active={isActive}
          onClick={onSelect}
          type="button"
        >
          {isActive ? <CheckIcon className="size-4" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{formatCrawlDateTime(crawl)}</p>
            <p className="truncate text-xs text-muted-foreground">{formatCrawlStats(crawl)}</p>
          </div>
          <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {crawl.status}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canExport || disabled}>
              {isExporting ? (
                <CompileLoader className="text-foreground" size={16} />
              ) : (
                <DownloadIcon />
              )}
              Export
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              <ContextMenuGroup>
                <ContextMenuRadioGroup
                  value={exportFormat}
                  onValueChange={(value) => onFormatChange(value as ExportFormat)}
                >
                  <ContextMenuRadioItem value="xlsx">XLSX</ContextMenuRadioItem>
                  <ContextMenuRadioItem value="csv">CSV</ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!canExport || disabled} onClick={() => onExport(exportFormat)}>
                  {isExporting ? (
                    <CompileLoader className="text-foreground" size={16} />
                  ) : (
                    <DownloadIcon />
                  )}
                  Export {exportFormat.toUpperCase()}
                </ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!canDelete || disabled} onClick={onDelete} variant="destructive">
            {isDeleting ? (
              <CompileLoader className="text-destructive" size={16} />
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
