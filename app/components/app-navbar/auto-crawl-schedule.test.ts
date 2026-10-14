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

  test("offers weekly, biweekly, monthly, and two-month schedules", () => {
    expect(autoCrawlScheduleOptions).toEqual([
      { value: "7", label: "Every week" },
      { value: "14", label: "Every 2 weeks" },
      { value: "30", label: "Every month" },
      { value: "60", label: "Every 2 months" },
    ])
  })

  test("unsupported stored schedules display weekly", () => {
    for (const legacy of ["1", "2", "3", "4", "5", "", null, undefined, 0]) {
      expect(normalizeAutoCrawlFrequencyDaysForDisplay(legacy)).toBe("7")
    }
    expect(normalizeAutoCrawlFrequencyDaysForDisplay("14")).toBe("14")
    expect(normalizeAutoCrawlFrequencyDaysForDisplay(30)).toBe("30")
    expect(normalizeAutoCrawlFrequencyDaysForDisplay("60")).toBe("60")
    expect(normalizeAutoCrawlFrequencyDaysForDisplay(60)).toBe("60")
  })

  test("validation only accepts the four schedules", () => {
    for (const frequency of ["7", "14", "30", "60"]) {
      expect(getAutoCrawlFrequencyValidationError(frequency)).toBeNull()
    }
    for (const frequency of ["1", "0", "31", "61", "", "-7"]) {
      expect(getAutoCrawlFrequencyValidationError(frequency)).toBe(
        "Crawl frequency must be Every week, Every 2 weeks, Every month, or Every 2 months."
      )
    }
  })
})
