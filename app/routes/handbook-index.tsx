import { Link } from "react-router"

import {
  getHandbookGuides,
  handbookBucketPath,
  handbookGuidePath,
  handbookGuides,
  handbookPillarPath,
  handbookPillars,
} from "~/content/handbook/handbook-catalog"
import { HandbookSearch } from "~/components/handbook/handbook-search"
import { HandbookRouteError } from "~/components/handbook/handbook-route-error"

export function meta() {
  const title = "Revserp handbook | Crawl issue guides"
  const description =
    "Plain-language guides to every Revserp finding across SEO, AEO, and PageSpeed: what it means, how it is detected, and how to fix it."
  return [
    { title },
    { name: "description", content: description },
    {
      tagName: "link",
      rel: "canonical",
      href: "https://revserp.ai/handbook",
    },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: "https://revserp.ai/handbook" },
    { property: "og:type", content: "website" },
  ]
}

export default function HandbookIndexPage() {
  return (
    <div className="handbook-overview">
      <h1 className="handbook-title">Find and fix crawl issues.</h1>
      <p className="handbook-lede">
        Every finding from a crawl, explained in plain language: what it means,
        how it is detected, why it happens, and how to check your fix.
        {` ${handbookGuides.length} guides across three chapters.`}
      </p>

      <HandbookSearch />

      <hr className="handbook-rule" />

      <ol className="handbook-chapter-list">
        {handbookPillars.map((pillar) => {
          const guides = getHandbookGuides(pillar.id)
          const featured = guides.slice(0, 3)
          return (
            <li className="handbook-chapter-row" key={pillar.id}>
              <div>
                <h2>
                  <Link to={handbookPillarPath(pillar.id)}>{pillar.title}</Link>
                </h2>
                <p className="handbook-chapter-desc">{pillar.description}</p>
                <ul
                  aria-label={`${pillar.title} sections`}
                  className="handbook-bucket-links"
                >
                  {pillar.buckets.map((bucket) => (
                    <li key={bucket.id}>
                      <Link to={handbookBucketPath(pillar.id, bucket.id)}>
                        {bucket.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="handbook-count">
                  {guides.length} guides, including{" "}
                  {featured.map((guide, i) => (
                    <span key={guide.issueType}>
                      {i > 0 ? ", " : ""}
                      <Link to={handbookGuidePath(guide)}>{guide.title}</Link>
                    </span>
                  ))}
                  .
                </p>
                <Link
                  className="handbook-read-link"
                  to={handbookPillarPath(pillar.id)}
                >
                  Browse this chapter →
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function ErrorBoundary() {
  return (
    <HandbookRouteError
      notFoundHeading="This handbook page does not exist."
      notFoundHint="Browse the chapters above to find the guide you need."
    />
  )
}
