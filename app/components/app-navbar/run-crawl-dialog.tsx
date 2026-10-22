import { MonitorPlayIcon, RefreshCwIcon, ShieldCheckIcon, XIcon } from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"
import { Badge } from "~/components/ui/badge"
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { ProjectResponse } from "~/lib/api.types"

const crawlSpeedPresets = [
  { value: "safe", label: "Safe", delayMs: "1000", jitterMs: "500" },
  { value: "balanced", label: "Balanced", delayMs: "500", jitterMs: "250" },
  { value: "fast", label: "Fast", delayMs: "", jitterMs: "" },
]


type RunCrawlDialogProps = {
  activeProject: ProjectResponse | null
  activeProjectId?: string | null
  excludedUrlPatterns: string[]
  exclusionDraft: string
  exclusionError: string
  fetchTimeoutSeconds: string
  forceFullCrawl: boolean
  honourRobotsTxt: boolean
  renderJavaScript: boolean
  isCrawlRunning: boolean
  isOpen: boolean
  isStartingCrawl: boolean
  maxDepth: string
  maxPages: string
  delayMs: string
  jitterMs: string
  runCrawlError: string
  onFetchTimeoutSecondsChange: (value: string) => void
  onForceFullCrawlChange: (value: boolean) => void
  onHonourRobotsTxtChange: (value: boolean) => void
  onRenderJavaScriptChange: (value: boolean) => void
  onMaxDepthChange: (value: string) => void
  onMaxPagesChange: (value: string) => void
  onDelayMsChange: (value: string) => void
  onJitterMsChange: (value: string) => void
  onExclusionDraftChange: (value: string) => void
  onExclusionCommit: (value: string) => void
  onExclusionRemove: (pattern: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function RunCrawlDialog({
  activeProject,
  excludedUrlPatterns,
  exclusionDraft,
  exclusionError,
  activeProjectId,
  fetchTimeoutSeconds,
  forceFullCrawl,
  honourRobotsTxt,
  renderJavaScript,
  isCrawlRunning,
  isOpen,
  isStartingCrawl,
  maxDepth,
  maxPages,
  delayMs,
  jitterMs,
  runCrawlError,
  onFetchTimeoutSecondsChange,
  onForceFullCrawlChange,
  onHonourRobotsTxtChange,
  onRenderJavaScriptChange,
  onMaxDepthChange,
  onMaxPagesChange,
  onDelayMsChange,
  onJitterMsChange,
  onExclusionDraftChange,
  onExclusionCommit,
  onExclusionRemove,
  onOpenChange,
  onSubmit,
}: RunCrawlDialogProps) {
  const selectedSpeedPreset = crawlSpeedPresets.find(
    (preset) =>
      preset.delayMs === delayMs.trim() && preset.jitterMs === jitterMs.trim()
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <DialogHeader className="shrink-0 px-6 pt-6 pr-12">
            <DialogTitle>Run Crawl</DialogTitle>
            <DialogDescription>
              Queue a new crawl for{" "}
              {activeProject?.name || "the selected project"}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
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
                <FieldLabel id="crawl-speed-preset-label">
                  Speed preset
                  {!selectedSpeedPreset ? (
                    <span className="text-muted-foreground">Custom</span>
                  ) : null}
                </FieldLabel>
                <ToggleGroup
                  aria-labelledby="crawl-speed-preset-label"
                  className="w-full"
                  id="crawl-speed-presets"
                  onValueChange={(values) => {
                    const preset = crawlSpeedPresets.find(
                      (option) => option.value === values[0]
                    )
                    if (!preset) return
                    onDelayMsChange(preset.delayMs)
                    onJitterMsChange(preset.jitterMs)
                  }}
                  size="sm"
                  spacing={0}
                  value={selectedSpeedPreset ? [selectedSpeedPreset.value] : []}
                  variant="outline"
                >
                  {crawlSpeedPresets.map((preset) => (
                    <ToggleGroupItem
                      className="flex-1 data-[pressed]:bg-foreground data-[pressed]:text-background aria-pressed:bg-foreground aria-pressed:text-background"
                      key={preset.value}
                      type="button"
                      value={preset.value}
                    >
                      {preset.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  Fills delay and jitter below. Fast is the default, with no added
                  delay or jitter.
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
              <Field>
                <Button
                  aria-pressed={forceFullCrawl}
                  className="w-full"
                  onClick={() => onForceFullCrawlChange(!forceFullCrawl)}
                  type="button"
                  variant={forceFullCrawl ? "default" : "outline"}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Force full crawl
                </Button>
                <FieldDescription>
                  Refetch and process every page instead of reusing unchanged
                  pages.
                </FieldDescription>
              </Field>
              <Field>
                <Button
                  aria-pressed={honourRobotsTxt}
                  className="w-full"
                  onClick={() => onHonourRobotsTxtChange(!honourRobotsTxt)}
                  type="button"
                  variant={honourRobotsTxt ? "default" : "outline"}
                >
                  <ShieldCheckIcon data-icon="inline-start" />
                  Honour robots.txt
                </Button>
                <FieldDescription>
                  Skip pages disallowed by the site's robots.txt.
                </FieldDescription>
              </Field>
              <Field>
                <Button
                  aria-pressed={renderJavaScript}
                  className="w-full"
                  onClick={() => onRenderJavaScriptChange(!renderJavaScript)}
                  type="button"
                  variant={renderJavaScript ? "default" : "outline"}
                >
                  <MonitorPlayIcon data-icon="inline-start" />
                  Render JavaScript
                </Button>
              </Field>
              <Field data-invalid={exclusionError ? true : undefined}>
                <FieldLabel htmlFor="excluded-url-patterns">
                  Excluded URL patterns
                </FieldLabel>
                {excludedUrlPatterns.length > 0 ? (
                  <ul
                    aria-label="Excluded URL patterns"
                    className="flex flex-wrap gap-1.5"
                  >
                    {excludedUrlPatterns.map((pattern) => (
                      <li key={pattern}>
                        <Badge className="gap-1 pr-1" variant="secondary">
                          <span className="max-w-44 truncate">{pattern}</span>
                          <button
                            aria-label={`Remove ${pattern}`}
                            className="flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"
                            onClick={() => onExclusionRemove(pattern)}
                            type="button"
                          >
                            <XIcon aria-hidden="true" className="size-3" />
                          </button>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No exclusions. The crawl covers the whole site.
                  </p>
                )}
                <Input
                  aria-invalid={exclusionError ? true : undefined}
                  autoComplete="off"
                  id="excluded-url-patterns"
                  onChange={(event) => onExclusionDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    // Space and Enter add tokens; Enter must not submit the form.
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      if (exclusionDraft.trim()) onExclusionCommit(exclusionDraft)
                    }
                  }}
                  onPaste={(event) => {
                    const pasted = event.clipboardData.getData("text")
                    if (!/\s/.test(pasted)) return
                    event.preventDefault()
                    onExclusionCommit(`${exclusionDraft} ${pasted}`)
                  }}
                  placeholder="Full URL or /path/* — Space or Enter adds"
                  spellCheck={false}
                  value={exclusionDraft}
                />
                <FieldDescription>
                  Skip login and admin pages. Full https:// URL or path
                  starting with /. Only * is a wildcard.
                </FieldDescription>
                {exclusionError ? (
                  <FieldError>{exclusionError}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>

            <FieldError className="mt-4">{runCrawlError}</FieldError>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
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
