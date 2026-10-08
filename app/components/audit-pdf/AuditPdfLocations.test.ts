import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import {
  renderAuditPdf as renderPdf,
  type AuditPdfData,
  type AuditPdfLocation,
  type AuditPdfLocationAi,
  type AuditPdfLocationMaps,
} from "./AuditPdfDocument"

async function renderAuditPdf(data: AuditPdfData) {
  const originalFetch = globalThis.fetch
  // Bun imports asset URLs as file paths; Vite serves them over HTTP.
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    if (typeof input === "string" && (input.endsWith("/fonts/Arimo.ttf") || input.endsWith("/icons/revserp-icon-192.png"))) {
      return new Response(new Uint8Array(await readFile(input)))
    }
    throw new Error(`Unexpected network request in PDF render test: ${input}`)
  }) as typeof fetch
  try {
    return await renderPdf(data)
  } finally {
    globalThis.fetch = originalFetch
  }
}

const emptyEntry = () => ({ concerns: [], recommendations: [], strengths: [], summary: "" })

function baseData(): AuditPdfData {
  return {
    commentary: {
      aeo: emptyEntry(),
      overall: emptyEntry(),
      pagespeed: emptyEntry(),
      seo: emptyEntry(),
    },
    pillars: [],
    projectName: "Parent Audit",
    reportDate: "October 8, 2026",
    scores: {},
  }
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]

function mapsFixture(): AuditPdfLocationMaps {
  return {
    runId: "run-maps-1",
    status: "completed",
    queries: ["plumber kathmandu", "emergency plumber"],
    radiusM: 5000,
    foundCount: 12,
    absentCount: 4,
    failedCount: 1,
    unknownCount: 1,
    totalCells: 18,
    foundOnlyMeanRank: 3.2,
    points: LETTERS.map((letter, pointIndex) => ({
      pointIndex,
      letter,
      meanRank: pointIndex < 6 ? 2 + pointIndex * 0.5 : null,
      foundCount: pointIndex < 6 ? 2 : 0,
      absentCount: pointIndex < 6 ? 0 : 1,
      unknownCount: pointIndex < 6 ? 0 : 1,
      totalCount: 2,
    })),
    driftNote: "Centre drift ≈ 45 m",
    failureOnly: false,
    error: null,
  }
}

function aiFixture(questionCount: number): AuditPdfLocationAi {
  const models = ["openai/gpt-5", "other/model"]
  const rows = []
  for (let order = 1; order <= questionCount; order += 1) {
    for (const model of models) {
      rows.push({
        order,
        question: `Does question ${order} mention the Lakeside branch for testing?`,
        model,
        status: "success",
        mentioned: order % 3 !== 0,
        rank: order % 3 !== 0 ? ((order % 5) + 1) : null,
        branchMention: order % 2 === 0,
      })
    }
  }
  return {
    auditId: "audit-ai-1",
    status: "completed",
    completedAt: "2026-09-30T00:00:00Z",
    visibilityRate: 67,
    totalMentions: 4,
    totalSuccess: 6,
    avgRank: 3,
    failedCount: 0,
    unknownCount: 0,
    models: models.map((model) => ({
      model,
      shortModel: model.split("/").pop() ?? model,
      mentionedCount: 2,
      successCount: 3,
      failedCount: 0,
      unknownCount: 0,
      avgRank: 3,
    })),
    rows,
  }
}

function locationFixture(overrides: Partial<AuditPdfLocation> = {}): AuditPdfLocation {
  return {
    id: "loc-1",
    name: "Lakeside",
    maps: mapsFixture(),
    aiVisibility: aiFixture(3),
    ...overrides,
  }
}

const pageCountOf = (bytes: Uint8Array): number => {
  const text = Buffer.from(bytes).toString("latin1")
  const counts = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/g)].map(
    (match) => Number(match[1]),
  )
  return Math.max(0, ...counts)
}

const isPdf = (bytes: Uint8Array) =>
  bytes.slice(0, 4).join(",") === [0x25, 0x50, 0x44, 0x46].join(",")

describe("renderAuditPdf location appendix", () => {
  test("no locations renders the unchanged website audit document", async () => {
    const bytes = await renderAuditPdf(baseData())
    expect(isPdf(bytes)).toBe(true)
    expect(pageCountOf(bytes) >= 1).toBe(true)
  })

  test("location with both sections appends pages", async () => {
    const baseline = pageCountOf(await renderAuditPdf(baseData()))
    const bytes = await renderAuditPdf({ ...baseData(), locations: [locationFixture()] })
    expect(isPdf(bytes)).toBe(true)
    expect(pageCountOf(bytes) > baseline).toBe(true)
  })

  test("maps-only and AI-only locations each render", async () => {
    const baseline = pageCountOf(await renderAuditPdf(baseData()))
    const mapsOnly = await renderAuditPdf({
      ...baseData(),
      locations: [locationFixture({ aiVisibility: null })],
    })
    expect(isPdf(mapsOnly)).toBe(true)
    expect(pageCountOf(mapsOnly) > baseline).toBe(true)

    const aiOnly = await renderAuditPdf({
      ...baseData(),
      locations: [locationFixture({ maps: null })],
    })
    expect(isPdf(aiOnly)).toBe(true)
    expect(pageCountOf(aiOnly) > baseline).toBe(true)
  })

  test("location with neither section adds no pages", async () => {
    const baseline = pageCountOf(await renderAuditPdf(baseData()))
    const bytes = await renderAuditPdf({
      ...baseData(),
      locations: [{ id: "loc-empty", name: "Empty", maps: null, aiVisibility: null }],
    })
    expect(pageCountOf(bytes)).toBe(baseline)
  })

  test("many questions paginate across matrix pages", async () => {
    const few = pageCountOf(
      await renderAuditPdf({ ...baseData(), locations: [locationFixture({ aiVisibility: aiFixture(3) })] }),
    )
    const many = await renderAuditPdf({
      ...baseData(),
      locations: [locationFixture({ id: "loc-many", aiVisibility: aiFixture(25) })],
    })
    expect(isPdf(many)).toBe(true)
    expect(pageCountOf(many) > few).toBe(true)
  })

  test("multiple locations each append pages", async () => {
    const one = pageCountOf(
      await renderAuditPdf({ ...baseData(), locations: [locationFixture()] }),
    )
    const two = await renderAuditPdf({
      ...baseData(),
      locations: [
        locationFixture(),
        locationFixture({ id: "loc-2", name: "Downtown" }),
      ],
    })
    expect(pageCountOf(two) > one).toBe(true)
  })
})
