import { ThinkingOrb } from "thinking-orbs"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
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
  maxPages: string
  delayMs: string
  jitterMs: string
  runCrawlError: string
  onFetchTimeoutSecondsChange: (value: string) => void
  onMaxDepthChange: (value: string) => void
  onMaxPagesChange: (value: string) => void
  onDelayMsChange: (value: string) => void
  onJitterMsChange: (value: string) => void
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
  maxPages,
  delayMs,
  jitterMs,
  runCrawlError,
  onFetchTimeoutSecondsChange,
  onMaxDepthChange,
  onMaxPagesChange,
  onDelayMsChange,
  onJitterMsChange,
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
              Queue a new crawl for{" "}
              {activeProject?.name || "the selected project"}.
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
              <FieldLabel htmlFor="max-pages">Max pages</FieldLabel>
              <Input
                id="max-pages"
                min="1"
                onChange={(event) => onMaxPagesChange(event.target.value)}
                placeholder="Unlimited"
                step="1"
                type="number"
                value={maxPages}
              />
              <FieldDescription>
                Leave blank to crawl every discovered page.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="delay-ms">Delay (ms)</FieldLabel>
              <Input
                id="delay-ms"
                min="1"
                onChange={(event) => onDelayMsChange(event.target.value)}
                placeholder="No delay"
                step="1"
                type="number"
                value={delayMs}
              />
              <FieldDescription>
                Time each worker waits between requests. Leave blank for no
                delay.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="jitter-ms">Jitter (ms)</FieldLabel>
              <Input
                id="jitter-ms"
                min="1"
                onChange={(event) => onJitterMsChange(event.target.value)}
                placeholder="None"
                step="1"
                type="number"
                value={jitterMs}
              />
              <FieldDescription>
                Randomizes the delay by ± this amount so requests look less
                robotic. Leave blank for none.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="fetch-timeout-seconds">
                Fetch timeout seconds
              </FieldLabel>
              <Input
                id="fetch-timeout-seconds"
                min="1"
                onChange={(event) =>
                  onFetchTimeoutSecondsChange(event.target.value)
                }
                step="1"
                type="number"
                value={fetchTimeoutSeconds}
              />
              <FieldDescription>
                Recommended defaults are already filled in.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <FieldError>{runCrawlError}</FieldError>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isStartingCrawl || !activeProjectId || isCrawlRunning}
              type="submit"
            >
              {isStartingCrawl ? (
                <ThinkingOrb
                  aria-hidden="true"
                  className="shrink-0"
                  size={20}
                  state="solving"
                  style={{ width: 18, height: 18 }}
                />
              ) : null}
              {isStartingCrawl ? "Starting..." : "Start crawl"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
