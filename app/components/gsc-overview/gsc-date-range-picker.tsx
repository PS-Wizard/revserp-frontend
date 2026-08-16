"use client"

import { useMemo, useRef, useState } from "react"
import { subMonths, startOfDay } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Button } from "~/components/ui/button"
import { Calendar } from "~/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"

export type GSCChartRange = { min: number; max: number }

export type GSCRangePresetKey = "1m" | "3m" | "8m"

const rangePresets = [
  { key: "1m" as const, label: "Last month", months: 1 },
  { key: "3m" as const, label: "Last 3 months", months: 3 },
  { key: "8m" as const, label: "Last 8 months", months: 8 },
]

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function presetRangeFromLatest(
  latestTimestamp: number,
  months: number
): GSCChartRange {
  const latest = startOfDay(new Date(latestTimestamp))
  const earliest = startOfDay(subMonths(latest, months))
  return {
    min: earliest.getTime(),
    max: latest.getTime(),
  }
}

function formatRangeLabel(
  range: GSCChartRange | null,
  activePreset: GSCRangePresetKey | null,
  fullRange: GSCChartRange | null
) {
  if (activePreset) {
    return (
      rangePresets.find((preset) => preset.key === activePreset)?.label ??
      "Date range"
    )
  }
  if (!range) {
    if (!fullRange) return "Date range"
    return formatCustomRangeLabel(fullRange)
  }
  return formatCustomRangeLabel(range)
}

function formatCustomRangeLabel(range: GSCChartRange) {
  const from = new Date(range.min)
  const to = new Date(range.max)
  const sameYear = from.getFullYear() === to.getFullYear()
  const fromLabel = sameYear
    ? shortDateFormatter.format(from)
    : fullDateFormatter.format(from)
  const toLabel = fullDateFormatter.format(to)
  return `${fromLabel} – ${toLabel}`
}

function rangeToDateRange(range: GSCChartRange | null): DateRange | undefined {
  if (!range) return undefined
  return {
    from: startOfDay(new Date(range.min)),
    to: startOfDay(new Date(range.max)),
  }
}

export function GSCDateRangePicker({
  latestTimestamp,
  earliestTimestamp,
  activePreset,
  appliedRange,
  onPresetSelect,
  onCustomRangeSelect,
  onReset,
}: {
  latestTimestamp: number
  earliestTimestamp: number
  activePreset: GSCRangePresetKey | null
  appliedRange: GSCChartRange | null
  onPresetSelect: (preset: GSCRangePresetKey, range: GSCChartRange) => void
  onCustomRangeSelect: (range: GSCChartRange) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>()
  // react-day-picker reports from === to on the first click in range mode; the
  // second click completes the range. We keep the popover open so the finished
  // range is visibly highlighted before the user applies it.
  const rangeClickCountRef = useRef(0)

  const fullRange = useMemo(
    () =>
      latestTimestamp && earliestTimestamp
        ? { min: earliestTimestamp, max: latestTimestamp }
        : null,
    [earliestTimestamp, latestTimestamp]
  )

  const triggerLabel = formatRangeLabel(
    appliedRange,
    activePreset,
    fullRange
  )

  const disabledBefore = earliestTimestamp
    ? startOfDay(new Date(earliestTimestamp))
    : undefined
  const disabledAfter = latestTimestamp
    ? startOfDay(new Date(latestTimestamp))
    : undefined

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      rangeClickCountRef.current = 0
      // Only restore a prior custom slice; don't pre-select the full span or
      // the first calendar click completes an existing range immediately.
      setCalendarRange(
        activePreset ? undefined : rangeToDateRange(appliedRange)
      )
    }
  }

  const handleSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      setCalendarRange(undefined)
      return
    }
    rangeClickCountRef.current += 1
    if (rangeClickCountRef.current === 1) {
      // First click starts the range — keep it open-ended so the second
      // click completes it instead of starting a fresh selection.
      setCalendarRange({ from: range.from, to: undefined })
      return
    }
    const from = range.to && range.from <= range.to ? range.from : range.to!
    const to = range.to && range.from <= range.to ? range.to : range.from
    setCalendarRange({ from, to })
    rangeClickCountRef.current = 0
  }

  const canApply = Boolean(calendarRange?.from && calendarRange?.to)

  const applyCalendarRange = () => {
    if (!calendarRange?.from || !calendarRange?.to) return
    onCustomRangeSelect({
      min: startOfDay(calendarRange.from).getTime(),
      max: startOfDay(calendarRange.to).getTime(),
    })
    setOpen(false)
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs font-medium"
            size="sm"
            variant="outline"
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col">
          <Calendar
            key={open ? "open" : "closed"}
            classNames={{ root: "w-full" }}
            className="w-full rounded-none border-0 p-3 [--cell-size:--spacing(9)]"
            defaultMonth={
              calendarRange?.to ??
              (latestTimestamp ? new Date(latestTimestamp) : undefined)
            }
            disabled={(date) => {
              const day = startOfDay(date).getTime()
              if (disabledBefore && day < disabledBefore.getTime()) return true
              if (disabledAfter && day > disabledAfter.getTime()) return true
              return false
            }}
            fixedWeeks
            mode="range"
            numberOfMonths={1}
            onSelect={handleSelect}
            selected={calendarRange}
          />
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            {rangePresets.map((preset) => (
              <Button
                key={preset.key}
                className={cn(
                  activePreset === preset.key && "pointer-events-none"
                )}
                onClick={() => {
                  const range = presetRangeFromLatest(
                    latestTimestamp,
                    preset.months
                  )
                  onPresetSelect(preset.key, range)
                  setOpen(false)
                }}
                size="sm"
                variant={activePreset === preset.key ? "secondary" : "outline"}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              onClick={() => {
                onReset()
                setOpen(false)
              }}
              size="sm"
              variant="outline"
            >
              All data
            </Button>
            <Button
              className="ml-auto"
              disabled={!canApply}
              onClick={applyCalendarRange}
              size="sm"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { presetRangeFromLatest, rangePresets }
