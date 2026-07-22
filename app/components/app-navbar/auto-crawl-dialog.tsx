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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import type { AutoCrawlConfig } from "./use-auto-crawl-settings"

const frequencyOptions = [
  { value: "1", label: "Every day" },
  { value: "2", label: "Every 2 days" },
  { value: "3", label: "Every 3 days" },
  { value: "4", label: "Every 4 days" },
  { value: "5", label: "Every 5 days" },
  { value: "7", label: "Every week" },
  { value: "14", label: "Every 2 weeks" },
]

type AutoCrawlDialogProps = {
  isOpen: boolean
  isSaving: boolean
  error: string
  config: AutoCrawlConfig
  nextRunAt: string
  onConfigChange: (config: AutoCrawlConfig) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export function AutoCrawlDialog({
  isOpen,
  isSaving,
  error,
  config,
  nextRunAt,
  onConfigChange,
  onOpenChange,
  onSubmit,
}: AutoCrawlDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Configure Auto Crawl</DialogTitle>
            <DialogDescription>
              When enabled, the backend will periodically crawl this project
              automatically.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="auto-frequency-days">Schedule</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    onConfigChange({
                      ...config,
                      frequencyDays: value ?? config.frequencyDays,
                    })
                  }
                  value={config.frequencyDays}
                >
                  <SelectTrigger className="w-full" id="auto-frequency-days">
                    <SelectValue placeholder="Every day" />
                  </SelectTrigger>
                  <SelectContent>
                    {frequencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="auto-run-at">At</FieldLabel>
                <Input
                  id="auto-run-at"
                  onChange={(event) =>
                    onConfigChange({ ...config, runAt: event.target.value })
                  }
                  type="time"
                  value={config.runAt}
                />
              </Field>
            </div>
            <FieldDescription>
              {nextRunAt
                ? `Crawls run in your local timezone. Next run: ${formatNextRun(nextRunAt)}.`
                : "Crawls run in your local timezone."}
            </FieldDescription>
            <Field>
              <FieldLabel htmlFor="auto-max-depth">Max depth</FieldLabel>
              <Input
                id="auto-max-depth"
                min="0"
                onChange={(event) =>
                  onConfigChange({ ...config, maxDepth: event.target.value })
                }
                step="1"
                type="number"
                value={config.maxDepth}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="auto-max-pages">Max pages</FieldLabel>
              <Input
                id="auto-max-pages"
                min="1"
                onChange={(event) =>
                  onConfigChange({ ...config, maxPages: event.target.value })
                }
                placeholder="Unlimited"
                step="1"
                type="number"
                value={config.maxPages}
              />
              <FieldDescription>
                Leave blank to crawl every discovered page.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="auto-delay-ms">Delay (ms)</FieldLabel>
              <Input
                id="auto-delay-ms"
                min="1"
                onChange={(event) =>
                  onConfigChange({ ...config, delayMs: event.target.value })
                }
                placeholder="No delay"
                step="1"
                type="number"
                value={config.delayMs}
              />
              <FieldDescription>
                Time each worker waits between requests. Leave blank for no
                delay.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="auto-jitter-ms">Jitter (ms)</FieldLabel>
              <Input
                id="auto-jitter-ms"
                min="1"
                onChange={(event) =>
                  onConfigChange({ ...config, jitterMs: event.target.value })
                }
                placeholder="None"
                step="1"
                type="number"
                value={config.jitterMs}
              />
              <FieldDescription>
                Randomizes the delay by ± this amount so requests look less
                robotic. Leave blank for none.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="auto-fetch-timeout-seconds">
                Fetch timeout seconds
              </FieldLabel>
              <Input
                id="auto-fetch-timeout-seconds"
                min="1"
                onChange={(event) =>
                  onConfigChange({
                    ...config,
                    fetchTimeoutSeconds: event.target.value,
                  })
                }
                step="1"
                type="number"
                value={config.fetchTimeoutSeconds}
              />
              <FieldDescription>
                Recommended defaults are already filled in.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <FieldError>{error}</FieldError>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? (
                <ThinkingOrb
                  aria-hidden="true"
                  className="shrink-0"
                  size={20}
                  state="working"
                  style={{ width: 18, height: 18 }}
                />
              ) : null}
              {isSaving ? "Saving..." : "Save Crawl Config"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const nextRunFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatNextRun(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value
  return nextRunFormatter.format(timestamp)
}
