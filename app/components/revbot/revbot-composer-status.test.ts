import { describe, expect, test } from "bun:test"
import {
  composerActivity,
  composerActivityAnimated,
  composerActivityLabel,
} from "./revbot-composer-status"

describe("composerActivity", () => {
  test("is idle without an active turn", () => {
    expect(composerActivity(false, false, false)).toBe("idle")
    expect(composerActivity(false, false, true)).toBe("idle")
  })

  test("is working while the turn runs", () => {
    expect(composerActivity(true, false, false)).toBe("working")
  })

  test("is stopping once a stop is requested", () => {
    expect(composerActivity(true, true, false)).toBe("stopping")
    expect(composerActivity(true, true, true)).toBe("stopping")
  })

  test("is awaiting while paused for approval", () => {
    expect(composerActivity(true, false, true)).toBe("awaiting")
  })
})

describe("composerActivityLabel", () => {
  test("labels each non-idle state", () => {
    expect(composerActivityLabel("working")).toBe("Working…")
    expect(composerActivityLabel("stopping")).toBe("Stopping…")
    expect(composerActivityLabel("awaiting")).toBe("Waiting for approval")
  })
})

describe("composerActivityAnimated", () => {
  test("spins only while running or stopping", () => {
    expect(composerActivityAnimated("working")).toBe(true)
    expect(composerActivityAnimated("stopping")).toBe(true)
    expect(composerActivityAnimated("awaiting")).toBe(false)
    expect(composerActivityAnimated("idle")).toBe(false)
  })
})
