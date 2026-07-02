"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"

import { Button } from "~/components/ui/button"

export type CancelCrawlTarget = { id: string; projectName?: string }

export function CancelCrawlDialog({
  target,
  onConfirm,
  onOpenChange,
}: {
  target: CancelCrawlTarget | null
  onConfirm: (id: string) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="font-heading leading-none font-medium">
              Cancel this crawl?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {target?.projectName
                ? `The crawl for ${target.projectName} will stop and partial results won't be saved.`
                : "The crawl will stop and partial results won't be saved."}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close render={<Button variant="outline" />}>
              Keep crawling
            </AlertDialog.Close>
            <AlertDialog.Close
              render={<Button variant="destructive" />}
              onClick={() => target && onConfirm(target.id)}
            >
              Cancel crawl
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
