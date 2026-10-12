import { Link, useLoaderData } from "react-router"

import type {
  HandbookGuide,
  HandbookPillar,
} from "~/content/handbook/handbook-types"
import {
  getHandbookGuides,
  getHandbookPillar,
  handbookBucketPath,
  handbookGuidePath,
  handbookPillarPath,
} from "~/content/handbook/handbook-catalog"
import { HandbookRouteError } from "~/components/handbook/handbook-route-error"

type HandbookPillarLoaderData = {
  guideCount: number
  pillar: HandbookPillar
  pillarGuides: HandbookGuide[]
}

export async function loader({
  params,
}: {
  params: Record<string, string | undefined>
}): Promise<HandbookPillarLoaderData> {
  const pillar = getHandbookPillar(params.pillar)
  if (!pillar) throw new Response("Unknown handbook pillar", { status: 404 })
  const pillarGuides = getHandbookGuides(pillar.id)
  if (pillarGuides.length === 0)
    throw new Response("Empty handbook chapter", { status: 404 })
  return { guideCount: pillarGuides.length, pillar, pillarGuides }
}

export function meta({ data }: { data?: HandbookPillarLoaderData }) {
  const title = data
    ? `${data.pillar.title} — Revserp Handbook`
    : "Handbook chapter — Revserp"
  const description = data
    ? `${data.pillar.subtitle.replace(/\.$/, "")} — ${data.guideCount} guides across ${data.pillar.buckets.length} sections.`
    : "A Revserp Handbook chapter."
  const canonical = data
    ? `https://revserp.ai${handbookPillarPath(data.pillar.id)}`
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

export default function HandbookPillarPage() {
  const { pillar, pillarGuides, guideCount } = useLoaderData<typeof loader>()
  return (
    <div className="handbook-overview">
      <nav aria-label="Breadcrumb" className="handbook-crumbs">
        <ol>
          <li>
            <Link to="/handbook">Handbook</Link>
          </li>
          <li aria-current="page">{pillar.title}</li>
        </ol>
      </nav>
      <h1 className="handbook-title">{pillar.title}</h1>
      <p className="handbook-lede">{pillar.description}</p>
      <p className="handbook-count">
        {guideCount} guides · {pillar.buckets.length} sections
      </p>

      {pillar.buckets.map((bucket) => {
        const bucketGuides = pillarGuides.filter(
          (guide) => guide.bucket === bucket.id
        )
        if (bucketGuides.length === 0) return null
        return (
          <section
            aria-labelledby={`bucket-${bucket.id}`}
            className="handbook-bucket-block"
            key={bucket.id}
          >
            <h2 id={`bucket-${bucket.id}`}>
              <Link to={handbookBucketPath(pillar.id, bucket.id)}>
                {bucket.title}
              </Link>
            </h2>
            <p>{bucket.description}</p>
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
          </section>
        )
      })}
    </div>
  )
}

export function ErrorBoundary() {
  return (
    <HandbookRouteError
      notFoundHeading="This chapter does not exist."
      notFoundHint="The handbook has three chapters: SEO, AEO, and PageSpeed."
    />
  )
}
