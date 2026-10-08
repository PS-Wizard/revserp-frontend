import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { renderAuditPdf as renderPdf, type AuditPdfData } from "./AuditPdfDocument";

async function renderAuditPdf(data: AuditPdfData) {
  const originalFetch = globalThis.fetch;
  // Bun imports asset URLs as file paths; Vite serves them over HTTP.
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    if (typeof input === "string" && (input.endsWith("/fonts/Arimo.ttf") || input.endsWith("/icons/revserp-icon-192.png"))) {
      return new Response(new Uint8Array(await readFile(input)));
    }
    throw new Error(`Unexpected network request in PDF render test: ${input}`);
  }) as typeof fetch;
  try {
    return await renderPdf(data);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const paragraph = (sentence: string, times: number): string =>
  Array.from({ length: times }, () => sentence).join(" ");

const longEntry = (topic: string) => ({
  concerns: Array.from(
    { length: 12 },
    (_, i) =>
      `${topic} concern ${i + 1}: duplicate boilerplate observed across paginated series with thin unique content per URL.`,
  ),
  recommendations: Array.from(
    { length: 12 },
    (_, i) =>
      `${topic} action ${i + 1}: consolidate page ${i + 1} into its pillar guide and add a self-referencing canonical.`,
  ),
  strengths: Array.from(
    { length: 8 },
    (_, i) => `${topic} strength ${i + 1}: unique titles and H1s hold on money pages.`,
  ),
  summary: paragraph(
    `${topic} summary: metadata is strong and crawl health holds, while pagination depth and template bloat remain the drag on this pillar.`,
    8,
  ),
});

const longData: AuditPdfData = {
  baseUrl: "https://example.com",
  commentary: {
    aeo: longEntry("AEO"),
    overall: longEntry("Overall"),
    pagespeed: longEntry("PageSpeed"),
    seo: longEntry("SEO"),
  },
  model: "audit-spike",
  pillars: [
    {
      buckets: Array.from({ length: 10 }, (_, i) => ({
        affectedUrlCount: 3 + i,
        id: `seo-bucket-${i}`,
        label: `SEO bucket ${i + 1} with a long descriptive label`,
        score: 60 + i,
      })),
      id: "seo",
      label: "SEO",
      score: 82,
    },
    {
      buckets: Array.from({ length: 8 }, (_, i) => ({
        affectedUrlCount: 2 + i,
        id: `aeo-bucket-${i}`,
        label: `AEO bucket ${i + 1}`,
        score: 55 + i,
      })),
      id: "aeo",
      label: "AEO",
      score: 76,
    },
    {
      buckets: Array.from({ length: 8 }, (_, i) => ({
        id: `ps-bucket-${i}`,
        label: `PageSpeed bucket ${i + 1}`,
        score: 50 + i,
      })),
      id: "pagespeed",
      label: "PageSpeed",
      score: 71,
    },
  ],
  projectName: "Example Audit",
  quarter: "Q3 2026",
  reportDate: "September 30, 2026",
  scores: { aeo: 76, overall: 78, pagespeed: 71, seo: 82 },
  urlsCrawled: 148,
};

// Minimal shape: every optional field missing, empty buckets and commentary.
const minimalData: AuditPdfData = {
  commentary: {
    aeo: { concerns: [], recommendations: [], strengths: [], summary: "" },
    overall: { concerns: [], recommendations: [], strengths: [], summary: "" },
    pagespeed: { concerns: [], recommendations: [], strengths: [], summary: "" },
    seo: { concerns: [], recommendations: [], strengths: [], summary: "" },
  },
  pillars: [],
  projectName: "Bare Audit",
  reportDate: "October 2, 2026",
  scores: {},
};

const pageCountOf = (bytes: Uint8Array): number => {
  const text = Buffer.from(bytes).toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/g)].map(
    (match) => Number(match[1]),
  );
  return Math.max(0, ...counts);
};

describe("renderAuditPdf audit PDF document", () => {
  test("long commentary and buckets paginate past the cover page", async () => {
    const bytes = await renderAuditPdf(longData);
    expect(bytes instanceof Uint8Array).toBe(true);
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(bytes.length > 10_000).toBe(true);
    expect(pageCountOf(bytes) > 2).toBe(true);
  });

  test("missing optional fields still render a valid single document", async () => {
    const bytes = await renderAuditPdf(minimalData);
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(bytes.length > 2_000).toBe(true);
    expect(pageCountOf(bytes) >= 1).toBe(true);
  });
});
