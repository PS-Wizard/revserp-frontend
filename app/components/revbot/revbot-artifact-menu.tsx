"use client"

import { useState, type RefObject } from "react"
import { CopyIcon, DownloadIcon, EllipsisIcon, ImageIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DropdownPillSurface } from "~/components/ui/hover-pill"
import { cn } from "~/lib/utils"

import {
  captureElementPng,
  copyPngBlob,
  copyText,
  downloadCsv,
  downloadPngBlob,
  slugFilename,
} from "./revbot-artifact-export"

type ArtifactExportMenuProps = {
  getCsv: () => string
  imageRef: RefObject<HTMLElement | null>
  filename: string
  className?: string
}

export function ArtifactExportMenu({
  className,
  filename,
  getCsv,
  imageRef,
}: ArtifactExportMenuProps) {
  const [open, setOpen] = useState(false)

  async function handleCopyCsv() {
    try {
      const csv = getCsv()
      await copyText(csv)
      toast.success("Copied CSV to clipboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy CSV")
    }
  }

  async function handleDownloadCsv() {
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
  }

  async function handleCopyPng() {
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
  }

  async function handleDownloadPng() {
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
  }

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
          side="bottom"
          sideOffset={6}
        >
          {(pill) => (
            <DropdownMenuGroup>
              <DropdownMenuItem
                {...pill.getItemProps(0)}
                onClick={() => void handleCopyCsv()}
              >
                <CopyIcon aria-hidden="true" />
                Copy as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                {...pill.getItemProps(1)}
                onClick={() => void handleDownloadCsv()}
              >
                <DownloadIcon aria-hidden="true" />
                Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                {...pill.getItemProps(2)}
                onClick={() => void handleCopyPng()}
              >
                <ImageIcon aria-hidden="true" />
                Copy as PNG
              </DropdownMenuItem>
              <DropdownMenuItem
                {...pill.getItemProps(3)}
                onClick={() => void handleDownloadPng()}
              >
                <DownloadIcon aria-hidden="true" />
                Download PNG
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownPillSurface>
      </DropdownMenu>
    </div>
  )
}
