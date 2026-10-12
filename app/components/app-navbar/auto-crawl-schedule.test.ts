import { describe, expect, test } from "bun:test"
import {
  autoCrawlScheduleOptions,
  DEFAULT_AUTO_CRAWL_CONFIG,
  getAutoCrawlFrequencyValidationError,
  normalizeAutoCrawlFrequencyDaysForDisplay,
} from "./use-auto-crawl-settings"

describe("auto crawl schedule", () => {
  test("new settings default to weekly", () => {
    expect(DEFAULT_AUTO_CRAWL_CONFIG.frequencyDays).toBe("7")
  })

  test("only weekly, biweekly, and monthly schedules are offered", () => {
    expect(autoCrawlScheduleOptions.map((o) => o.value)).toEqual([
      "7",
      "14",
      "30",
    ])
  })

  test("unsupported stored schedules display weekly", () => {
    for (const legacy of ["1", "2", "3", "4", "5", "", null, undefined, 0]) {
      expect(normalizeAutoCrawlFrequencyDaysForDisplay(legacy)).toBe("7")
    }
    expect(normalizeAutoCrawlFrequencyDaysForDisplay("14")).toBe("14")
    expect(normalizeAutoCrawlFrequencyDaysForDisplay(30)).toBe("30")
  })

  test("validation only accepts the three schedules", () => {
    expect(getAutoCrawlFrequencyValidationError("7")).toBeNull()
    expect(getAutoCrawlFrequencyValidationError("14")).toBeNull()
    expect(getAutoCrawlFrequencyValidationError("30")).toBeNull()
    expect(getAutoCrawlFrequencyValidationError("1")).toBe(
      "Crawl frequency must be Every week, Every 2 weeks, or Every month."
    )
  })
})
