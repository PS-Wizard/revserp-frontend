import { CompileLoader } from "~/components/compile-loader"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import type { ProjectResponse } from "~/lib/api.types"

type RunCrawlPopoverProps = {
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

export function RunCrawlPopover({
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
}: RunCrawlPopoverProps) {
  return (
    <Popover onOpenChange={onOpenChange} open={isOpen}>
      <PopoverTrigger
        render={<Button variant="outline" />}
        disabled={!activeProjectId || isCrawlRunning}
      >
        {isCrawlRunning ? (
          <CompileLoader className="text-foreground" size={18} />
        ) : null}
        Run Crawl
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <PopoverHeader>
            <PopoverTitle>Run Crawl</PopoverTitle>
            <PopoverDescription>
              Queue a new crawl for{" "}
              {activeProject?.name || "the selected project"}.
            </PopoverDescription>
          </PopoverHeader>

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

          <div className="flex justify-end gap-2">
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
                <CompileLoader className="text-primary-foreground" size={18} />
              ) : null}
              {isStartingCrawl ? "Starting..." : "Start crawl"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
