"use client"

import { InfoIcon } from "lucide-react"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer"
import type { GooglePSIStoredResult } from "~/lib/api.types"

export function GooglePSIDrawer({
  open,
  onClose,
  psiResult,
}: {
  open: boolean
  onClose: () => void
  psiResult: GooglePSIStoredResult | null
}) {
  const mobile = psiResult?.mobile

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Google PageSpeed Insights</DrawerTitle>
          <DrawerDescription>
            {psiResult?.url ?? "—"} ·{" "}
            {psiResult?.analysis_date
              ? new Date(psiResult.analysis_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-6 px-6 pb-10">
          {!mobile?.success ? (
            <div className="flex items-center gap-3 rounded-md border border-red-300/15 bg-red-400/[0.045] px-4 py-4 text-sm text-red-100">
              <InfoIcon className="size-4 shrink-0" />
              <span>
                {mobile?.error ?? "Google PageSpeed Insights data is not available for this crawl."}
              </span>
            </div>
          ) : (
            <>
              {/* Performance score */}
              <div className="flex items-center justify-center py-4">
                <div className="text-center">
                  <div
                    className="mx-auto mb-3 flex size-28 items-center justify-center rounded-full border-4 text-3xl font-bold"
                    style={{
                      borderColor: scoreColor(mobile.performance_score),
                      color: scoreColor(mobile.performance_score),
                    }}
                  >
                    {mobile.performance_score ?? "—"}
                  </div>
                  <p className="text-sm font-medium">Performance Score</p>
                  <p className="text-xs text-muted-foreground">{scoreLabel(mobile.performance_score)}</p>
                </div>
              </div>

              {/* Core Web Vitals */}
              <div>
                <h3 className="mb-3 text-sm font-medium">Core Web Vitals · Mobile</h3>
                <div className="space-y-2">
                  <MetricRow
                    label="Largest Contentful Paint"
                    value={mobile.metrics?.largest_contentful_paint}
                    unit="s"
                    goodThreshold={2.5}
                    poorThreshold={4.0}
                    lowerIsBetter
                  />
                  <MetricRow
                    label="First Contentful Paint"
                    value={mobile.metrics?.first_contentful_paint}
                    unit="s"
                    goodThreshold={1.8}
                    poorThreshold={3.0}
                    lowerIsBetter
                  />
                  <MetricRow
                    label="Cumulative Layout Shift"
                    value={mobile.metrics?.cumulative_layout_shift}
                    unit=""
                    goodThreshold={0.1}
                    poorThreshold={0.25}
                    lowerIsBetter
                  />
                  <MetricRow
                    label="First Input Delay"
                    value={mobile.metrics?.first_input_delay}
                    unit="ms"
                    displayValue={
                      mobile.metrics?.first_input_delay != null
                        ? Math.round(mobile.metrics.first_input_delay * 1000)
                        : null
                    }
                    goodThreshold={100}
                    poorThreshold={300}
                    lowerIsBetter
                  />
                  <MetricRow
                    label="Speed Index"
                    value={mobile.metrics?.speed_index}
                    unit="s"
                    goodThreshold={3.4}
                    poorThreshold={5.8}
                    lowerIsBetter
                  />
                  <MetricRow
                    label="Time to Interactive"
                    value={mobile.metrics?.time_to_interactive}
                    unit="s"
                    goodThreshold={3.8}
                    poorThreshold={7.3}
                    lowerIsBetter
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function MetricRow({
  label,
  value,
  unit,
  displayValue,
  goodThreshold,
  poorThreshold,
  lowerIsBetter,
}: {
  label: string
  value?: number
  unit: string
  displayValue?: number | null
  goodThreshold: number
  poorThreshold: number
  lowerIsBetter: boolean
}) {
  const resolvedDisplay = displayValue ?? value
  const isGood =
    value != null
      ? lowerIsBetter
        ? value <= goodThreshold
        : value >= goodThreshold
      : null
  const isPoor =
    value != null
      ? lowerIsBetter
        ? value > poorThreshold
        : value < poorThreshold
      : null
  const tone =
    isGood === true ? "text-emerald-200" : isPoor === true ? "text-red-200" : "text-amber-200"

  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-4 py-3">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">
          {value != null ? `${resolvedDisplay?.toLocaleString() ?? "—"} ${unit}`.trim() : "—"}
        </p>
      </div>
      <span className={`text-xs font-medium ${tone}`}>
        {isGood === true ? "Good" : isPoor === true ? "Poor" : value != null ? "Needs work" : "—"}
      </span>
    </div>
  )
}

function scoreColor(score?: number) {
  if (score == null) return "var(--muted-foreground)"
  if (score >= 90) return "#34d399"
  if (score >= 50) return "#fbbf24"
  return "#f87171"
}

function scoreLabel(score?: number) {
  if (score == null) return "No data"
  if (score >= 90) return "Good"
  if (score >= 50) return "Needs Improvement"
  return "Poor"
}
