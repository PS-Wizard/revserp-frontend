"use client"

import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"
import { CopyIcon, DownloadIcon, EllipsisIcon, ImageIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  DropdownPillSurface,
  HoverPill,
  useHoverPill,
} from "~/components/ui/hover-pill"
import { cn } from "~/lib/utils"

import {
  captureElementPng,
  copyPngBlob,
  copyText,
  downloadCsv,
  downloadPngBlob,
  downloadSvg,
  slugFilename,
} from "./revbot-artifact-export"

type ArtifactExportOptions = {
  getCsv: () => string
  imageRef: RefObject<HTMLElement | null>
  filename: string
  getSvg?: () => string
}

type ArtifactExportMenuProps = ArtifactExportOptions & {
  className?: string
}

type ArtifactExportContextMenuProps = ArtifactExportOptions & {
  children: ReactElement
}

type ArtifactAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => Promise<void>
}

function useArtifactExportActions({
  filename,
  getCsv,
  getSvg,
  imageRef,
}: ArtifactExportOptions): ArtifactAction[] {
  const handleCopyCsv = useCallback(async () => {
    try {
      const csv = getCsv()
      await copyText(csv)
      toast.success("Copied CSV to clipboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy CSV")
    }
  }, [getCsv])

  const handleDownloadCsv = useCallback(async () => {
    try {
      const csv = getCsv()
      const safe = slugFilename(filename)
      downloadCsv(`${safe}.csv`, csv)
      toast.success("CSV downloaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download CSV"
      )
    }
  }, [filename, getCsv])

  const handleCopyPng = useCallback(async () => {
    try {
      const element = imageRef.current
      if (!element) throw new Error("Image is not ready")
      const blob = captureElementPng(element)
      await copyPngBlob(blob)
      toast.success("Copied image to clipboard")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not copy image"
      )
    }
  }, [imageRef])

  const handleDownloadPng = useCallback(async () => {
    try {
      const element = imageRef.current
      if (!element) throw new Error("Image is not ready")
      const blob = await captureElementPng(element)
      const safe = slugFilename(filename)
      downloadPngBlob(`${safe}.png`, blob)
      toast.success("Image downloaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download image"
      )
    }
  }, [filename, imageRef])

  const handleDownloadSvg = useCallback(async () => {
    try {
      if (!getSvg) throw new Error("SVG is not ready")
      const svg = getSvg()
      const safe = slugFilename(filename)
      downloadSvg(`${safe}.svg`, svg)
      toast.success("SVG downloaded")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download SVG"
      )
    }
  }, [filename, getSvg])

  return useMemo(() => {
    const actions: ArtifactAction[] = [
      {
        id: "copy-csv",
        label: "Copy as CSV",
        icon: <CopyIcon aria-hidden="true" />,
        onClick: handleCopyCsv,
      },
      {
        id: "download-csv",
        label: "Download CSV",
        icon: <DownloadIcon aria-hidden="true" />,
        onClick: handleDownloadCsv,
      },
      {
        id: "copy-png",
        label: "Copy as PNG",
        icon: <ImageIcon aria-hidden="true" />,
        onClick: handleCopyPng,
      },
      {
        id: "download-png",
        label: "Download PNG",
        icon: <DownloadIcon aria-hidden="true" />,
        onClick: handleDownloadPng,
      },
    ]
    if (getSvg) {
      actions.push({
        id: "download-svg",
        label: "Download SVG",
        icon: <DownloadIcon aria-hidden="true" />,
        onClick: handleDownloadSvg,
      })
    }
    return actions
  }, [
    getSvg,
    handleCopyCsv,
    handleCopyPng,
    handleDownloadCsv,
    handleDownloadPng,
    handleDownloadSvg,
  ])
}

export function ArtifactExportMenu({
  className,
  filename,
  getCsv,
  getSvg,
  imageRef,
}: ArtifactExportMenuProps) {
  const [open, setOpen] = useState(false)
  const actions = useArtifactExportActions({
    filename,
    getCsv,
    getSvg,
    imageRef,
  })

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-2 right-2 z-10 opacity-0 transition-opacity duration-150 group-focus-within/revbot-artifact:pointer-events-auto group-focus-within/revbot-artifact:opacity-100 group-hover/revbot-artifact:pointer-events-auto group-hover/revbot-artifact:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
        open && "pointer-events-auto opacity-100",
        className
      )}
      data-export-controls
      data-not-typeset
    >
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Export artifact"
              className="size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              size="icon-xs"
              variant="ghost"
              type="button"
            >
              <EllipsisIcon aria-hidden="true" className="size-3.5" />
            </Button>
          }
        />
        <DropdownPillSurface
          align="end"
          className="min-w-44"
          positionerClassName="z-[120]"
          side="bottom"
          sideOffset={6}
        >
          {(pill) => (
            <DropdownMenuGroup>
              {actions.map((action, index) => (
                <DropdownMenuItem
                  key={action.id}
                  {...pill.getItemProps(index)}
                  onClick={() => void action.onClick()}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownPillSurface>
      </DropdownMenu>
    </div>
  )
}

export function ArtifactExportContextMenu({
  children,
  filename,
  getCsv,
  getSvg,
  imageRef,
}: ArtifactExportContextMenuProps) {
  const actions = useArtifactExportActions({
    filename,
    getCsv,
    getSvg,
    imageRef,
  })
  const hover = useHoverPill()

  return (
    <ContextMenu>
      <ContextMenuTrigger className="select-auto" render={children} />
      <ContextMenuContent
        className="relative min-w-44"
        positionerClassName="z-[120]"
        onMouseLeave={hover.clearPill}
      >
        <HoverPill pill={hover.pill} />
        <ContextMenuGroup>
          {actions.map((action, index) => (
            <ContextMenuItem
              key={action.id}
              {...hover.getItemProps(index)}
              onClick={() => void action.onClick()}
            >
              {action.icon}
              {action.label}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
