export type HandbookPillarId = "seo" | "aeo" | "pagespeed"

export type HandbookGuide = {
  issueType: string
  pillar: HandbookPillarId
  bucket: string
  title: string
  summary: string
  scope: "page" | "site" | "origin"
  explanation: string[]
  detection: string[]
  causes: string[]
  fixes: string[]
  verification: string[]
  cautions: string[]
  example?: { label: string; code: string }
  references: { label: string; url: string }[]
  relatedIssueTypes?: string[]
}

export type HandbookBucket = {
  id: string
  title: string
  description: string
}

export type HandbookPillar = {
  id: HandbookPillarId
  title: string
  subtitle: string
  description: string
  buckets: HandbookBucket[]
}
