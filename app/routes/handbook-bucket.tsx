import { Link, useLoaderData } from "react-router"

import type {
  HandbookBucket,
  HandbookGuide,
  HandbookPillar,
} from "~/content/handbook/handbook-types"
import {
  getHandbookBucket,
  getHandbookGuides,
  getHandbookPillar,
  handbookBucketPath,
  handbookGuidePath,
} from "~/content/handbook/handbook-catalog"
import { HandbookRouteError } from "~/components/handbook/handbook-route-error"

type HandbookBucketLoaderData = {
  bucket: HandbookBucket
  bucketGuides: HandbookGuide[]
  pillar: HandbookPillar
}

export async function loader({
  params,
}: {
  params: Record<string, string | undefined>
}): Promise<HandbookBucketLoaderData> {
  const pillar = getHandbookPillar(params.pillar)
  if (!pillar) throw new Response("Unknown handbook pillar", { status: 404 })
  const bucket = getHandbookBucket(pillar, params.bucket)
  if (!bucket) throw new Response("Unknown handbook section", { status: 404 })
  const bucketGuides = getHandbookGuides(pillar.id, bucket.id)
  if (bucketGuides.length === 0)
    throw new Response("Empty handbook section", { status: 404 })
  return { bucket, bucketGuides, pillar }
}

export function meta({ data }: { data?: HandbookBucketLoaderData }) {
  const title = data
    ? `${data.bucket.title} — ${data.pillar.title} Handbook`
    : "Handbook section — Revserp"
  const description = data
    ? `${data.bucket.description} ${data.bucketGuides.length} guides.`
    : "A Revserp Handbook section."
  const canonical = data
    ? `https://revserp.ai${handbookBucketPath(data.pillar.id, data.bucket.id)}`
    : "https://revserp.ai/handbook"
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:type", content: "article" },
  ]
}

export default function HandbookBucketPage() {
  const { bucket, bucketGuides, pillar } = useLoaderData<typeof loader>()
  return (
    <div className="handbook-overview">
      <nav aria-label="Breadcrumb" className="handbook-crumbs">
        <ol>
          <li>
            <Link to="/handbook">Handbook</Link>
          </li>
          <li>
            <Link to={`/handbook/${pillar.id}`}>{pillar.title}</Link>
          </li>
          <li aria-current="page">{bucket.title}</li>
        </ol>
      </nav>
      <h1 className="handbook-title">{bucket.title}</h1>
      <p className="handbook-lede">{bucket.description}</p>
      <p className="handbook-count">{bucketGuides.length} guides</p>

      <hr className="handbook-rule" />

      <ul className="handbook-guide-list">
        {bucketGuides.map((guide) => (
          <li className="handbook-guide-row" key={guide.issueType}>
            <Link
              className="handbook-guide-title"
              to={handbookGuidePath(guide)}
            >
              {guide.title}
            </Link>
            <span className="handbook-guide-code">{guide.issueType}</span>
            <p>{guide.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ErrorBoundary() {
  return (
    <HandbookRouteError
      notFoundHeading="This section does not exist."
      notFoundHint="Browse the handbook chapters to find the section you need."
    />
  )
}
