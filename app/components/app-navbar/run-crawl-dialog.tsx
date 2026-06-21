import { CompileLoader } from "~/components/compile-loader"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import type { ProjectResponse } from "~/lib/api.types"

type RunCrawlDialogProps = {
  activeProject: ProjectResponse | null
  activeProjectId?: string | null
  fetchTimeoutSeconds: string
  isCrawlRunning: boolean
  isOpen: boolean
  isStartingCrawl: boolean
  maxDepth: string
  runCrawlError: string
  onFetchTimeoutSecondsChange: (value: string) => void
  onMaxDepthChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function RunCrawlDialog({
  activeProject,
  activeProjectId,
  fetchTimeoutSeconds,
  isCrawlRunning,
  isOpen,
  isStartingCrawl,
  maxDepth,
  runCrawlError,
  onFetchTimeoutSecondsChange,
  onMaxDepthChange,
  onOpenChange,
  onSubmit,
}: RunCrawlDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Run Crawl</DialogTitle>
            <DialogDescription>
              Queue a new crawl for {activeProject?.name || "the selected project"}.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="max-depth">Max depth</FieldLabel>
              <Input
                id="max-depth"
                min="0"
                onChange={(event) => onMaxDepthChange(event.target.value)}
                step="1"
                type="number"
                value={maxDepth}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fetch-timeout-seconds">Fetch timeout seconds</FieldLabel>
              <Input
                id="fetch-timeout-seconds"
                min="1"
                onChange={(event) => onFetchTimeoutSecondsChange(event.target.value)}
                step="1"
                type="number"
                value={fetchTimeoutSeconds}
              />
              <FieldDescription>Recommended defaults are already filled in.</FieldDescription>
            </Field>
          </FieldGroup>

          <FieldError>{runCrawlError}</FieldError>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isStartingCrawl || !activeProjectId || isCrawlRunning} type="submit">
              {isStartingCrawl ? (
                <CompileLoader className="text-primary-foreground" size={18} />
              ) : null}
              {isStartingCrawl ? "Starting..." : "Start crawl"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
