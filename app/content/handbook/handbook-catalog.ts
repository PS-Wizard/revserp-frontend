import { aeoHandbookGuides } from "./aeo-guides"
import { pageSpeedHandbookGuides } from "./pagespeed-guides"
import { seoHandbookGuides } from "./seo-guides"
import { handbookPillars } from "./handbook-taxonomy"
import type {
  HandbookGuide,
  HandbookPillar,
  HandbookPillarId,
} from "./handbook-types"

export { handbookPillars } from "./handbook-taxonomy"

export const handbookGuides: HandbookGuide[] = [
  ...seoHandbookGuides,
  ...aeoHandbookGuides,
  ...pageSpeedHandbookGuides,
]

export function handbookSlug(identifier: string) {
  return identifier.replaceAll("_", "-")
}

export function handbookPillarPath(pillarId: HandbookPillarId) {
  return `/handbook/${pillarId}`
}

export function handbookBucketPath(
  pillarId: HandbookPillarId,
  bucketId: string
) {
  return `${handbookPillarPath(pillarId)}/${handbookSlug(bucketId)}`
}

export function handbookGuidePath(guide: HandbookGuide) {
  return `${handbookBucketPath(guide.pillar, guide.bucket)}/${handbookSlug(guide.issueType)}`
}

export function getHandbookPillar(pillarId: string | undefined) {
  return handbookPillars.find((pillar) => pillar.id === pillarId)
}

export function getHandbookBucket(
  pillar: HandbookPillar,
  bucketSlug: string | undefined
) {
  return pillar.buckets.find((bucket) => handbookSlug(bucket.id) === bucketSlug)
}

export function getHandbookGuide(
  pillarId: string | undefined,
  bucketSlug: string | undefined,
  issueSlug: string | undefined
) {
  const pillar = getHandbookPillar(pillarId)
  if (!pillar) return undefined
  const bucket = getHandbookBucket(pillar, bucketSlug)
  if (!bucket) return undefined
  return handbookGuides.find(
    (guide) =>
      guide.pillar === pillar.id &&
      guide.bucket === bucket.id &&
      handbookSlug(guide.issueType) === issueSlug
  )
}

export function getHandbookGuides(
  pillarId?: HandbookPillarId,
  bucketId?: string
) {
  return handbookGuides.filter(
    (guide) =>
      (!pillarId || guide.pillar === pillarId) &&
      (!bucketId || guide.bucket === bucketId)
  )
}

function normalizeHandbookSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

const handbookSearchEntries = handbookGuides.map((guide) => {
  const pillar = getHandbookPillar(guide.pillar)!
  const bucket = pillar.buckets.find((item) => item.id === guide.bucket)!
  const pillarKeywords = {
    seo: "search engine optimization",
    aeo: "answer engine optimization",
    pagespeed: "page speed performance core web vitals cwv",
  }[guide.pillar]
  return {
    guide,
    text: normalizeHandbookSearch(
      [
        guide.issueType,
        guide.title,
        guide.summary,
        pillar.title,
        pillarKeywords,
        bucket.id,
        bucket.title,
        ...guide.explanation,
        ...guide.detection,
      ].join(" ")
    ),
  }
})

export function searchHandbookGuides(query: string) {
  const terms = normalizeHandbookSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return handbookGuides
  return handbookSearchEntries
    .filter((entry) => terms.every((term) => entry.text.includes(term)))
    .map((entry) => entry.guide)
}
