import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"

import { HandbookSearch } from "~/components/handbook/handbook-search"
import {
  handbookGuidePath,
  handbookGuides,
} from "~/content/handbook/handbook-catalog"
import HandbookIndexPage, { meta as handbookMeta } from "./handbook-index"
import { loader as pillarLoader } from "./handbook-pillar"
import { loader as bucketLoader } from "./handbook-bucket"
import { loader as issueLoader, meta as issueMeta } from "./handbook-issue"

async function expectHandbook404(params: Record<string, string | undefined>) {
  try {
    await issueLoader({ params })
    throw new Error("Expected handbook 404")
  } catch (error) {
    expect(error instanceof Response).toBe(true)
    expect((error as Response).status).toBe(404)
  }
}

describe("public handbook routes", () => {
  test("index renders full navigation and canonical metadata without a login", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HandbookIndexPage />
      </MemoryRouter>
    )
    expect(markup).toContain("Find and fix crawl issues.")
    expect(markup).toContain(`${handbookGuides.length} guides`)
    expect(markup).toContain('href="/handbook/seo/serp-metadata"')
    expect(markup).toContain('href="/handbook/aeo/expertise"')
    expect(markup).toContain('href="/handbook/pagespeed/psi-cwv"')
    expect(
      handbookMeta().some(
        (entry) =>
          "href" in entry && entry.href === "https://revserp.ai/handbook"
      )
    ).toBe(true)
  })

  test("pillar and bucket loaders return the correct guides", async () => {
    const pillar = await pillarLoader({ params: { pillar: "seo" } })
    expect(pillar.guideCount).toBe(38)
    const bucket = await bucketLoader({
      params: { pillar: "seo", bucket: "serp-metadata" },
    })
    expect(bucket.bucketGuides.length).toBe(8)
    expect(
      bucket.bucketGuides.every((guide) => guide.bucket === "serp_metadata")
    ).toBe(true)
  })

  test("all article paths resolve and have correct canonical metadata", async () => {
    for (const guide of handbookGuides) {
      const [, , pillar, bucket, issue] = handbookGuidePath(guide).split("/")
      const data = await issueLoader({ params: { pillar, bucket, issue } })
      expect(data.guide).toBe(guide)
      expect(
        issueMeta({ data }).some(
          (entry) =>
            "href" in entry &&
            entry.href === `https://revserp.ai${handbookGuidePath(guide)}`
        )
      ).toBe(true)
    }
  })

  test("unknown and mismatched route parameters return 404", async () => {
    await expectHandbook404({
      pillar: "wrong",
      bucket: "serp-metadata",
      issue: "missing-title",
    })
    await expectHandbook404({
      pillar: "seo",
      bucket: "wrong",
      issue: "missing-title",
    })
    await expectHandbook404({
      pillar: "seo",
      bucket: "serp-metadata",
      issue: "missing-h1",
    })
    await expectHandbook404({
      pillar: "aeo",
      bucket: "serp-metadata",
      issue: "missing-title",
    })
    await expectHandbook404({
      pillar: "seo",
      bucket: "serp-metadata",
      issue: "wrong",
    })
  })

  test("search has a label and a native search input", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HandbookSearch />
      </MemoryRouter>
    )
    expect(markup).toContain('for="handbook-search-input"')
    expect(markup).toContain('id="handbook-search-input"')
    expect(markup).toContain('type="search"')
    expect(markup).toContain("Search the handbook")
  })
})
