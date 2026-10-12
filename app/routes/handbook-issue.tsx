import { Fragment } from "react"
import { Link, useLoaderData } from "react-router"
import ReactMarkdown from "react-markdown"

import type {
  HandbookBucket,
  HandbookGuide,
  HandbookPillar,
} from "~/content/handbook/handbook-types"
import {
  getHandbookBucket,
  getHandbookGuide,
  getHandbookPillar,
  handbookBucketPath,
  handbookGuidePath,
  handbookGuides,
} from "~/content/handbook/handbook-catalog"
import { HandbookRouteError } from "~/components/handbook/handbook-route-error"

type HandbookIssueLoaderData = {
  bucket: HandbookBucket
  guide: HandbookGuide
  pillar: HandbookPillar
  relatedGuides: HandbookGuide[]
}

export async function loader({
  params,
}: {
  params: Record<string, string | undefined>
}): Promise<HandbookIssueLoaderData> {
  const pillar = getHandbookPillar(params.pillar)
  if (!pillar) throw new Response("Unknown handbook pillar", { status: 404 })
  const bucket = getHandbookBucket(pillar, params.bucket)
  if (!bucket) throw new Response("Unknown handbook section", { status: 404 })
  const guide = getHandbookGuide(params.pillar, params.bucket, params.issue)
  if (!guide || guide.pillar !== pillar.id || guide.bucket !== bucket.id)
    throw new Response("Unknown handbook guide", { status: 404 })
  const relatedGuides = (guide.relatedIssueTypes ?? [])
    .map((issueType) =>
      handbookGuides.find((entry) => entry.issueType === issueType)
    )
    .filter((entry): entry is HandbookGuide => entry !== undefined)
  return { bucket, guide, pillar, relatedGuides }
}

export function meta({ data }: { data?: HandbookIssueLoaderData }) {
  const title = data
    ? `${data.guide.title} — Revserp Handbook`
    : "Handbook guide — Revserp"
  const description = data ? data.guide.summary : "A Revserp Handbook guide."
  const canonical = data
    ? `https://revserp.ai${handbookGuidePath(data.guide)}`
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

function HandbookInlineMarkdown({ text }: { text: string }) {
  return <ReactMarkdown components={{ p: Fragment }}>{text}</ReactMarkdown>
}

const handbookTocEntries = [
  { id: "what-it-means", title: "What it means" },
  { id: "how-we-detect-it", title: "How we detect it" },
  { id: "why-it-happens", title: "Why it happens" },
  { id: "how-to-fix-it", title: "How to fix it" },
  { id: "how-to-verify-it", title: "How to verify it" },
  { id: "keep-in-mind", title: "Keep in mind" },
  { id: "references", title: "References" },
]

function HandbookTocList() {
  return (
    <ol className="handbook-toc-list">
      {handbookTocEntries.map((entry) => (
        <li key={entry.id}>
          <a href={`#${entry.id}`}>{entry.title}</a>
        </li>
      ))}
    </ol>
  )
}

const handbookScopeLabels: Record<HandbookGuide["scope"], string> = {
  page: "Page",
  site: "Whole site",
  origin: "Website origin",
}

export default function HandbookIssuePage() {
  const { bucket, guide, pillar, relatedGuides } =
    useLoaderData<typeof loader>()

  return (
    <div className="handbook-guide-page">
      <nav aria-label="Breadcrumb" className="handbook-crumbs">
        <ol>
          <li>
            <Link to="/handbook">Handbook</Link>
          </li>
          <li>
            <Link to={`/handbook/${pillar.id}`}>{pillar.title}</Link>
          </li>
          <li>
            <Link to={handbookBucketPath(pillar.id, bucket.id)}>
              {bucket.title}
            </Link>
          </li>
          <li aria-current="page">{guide.title}</li>
        </ol>
      </nav>

      <details className="handbook-toc-details">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          <HandbookTocList />
        </nav>
      </details>

      <div className="handbook-article-grid">
        <article className="handbook-article">
          <header className="handbook-article-head">
            <h1 className="handbook-article-title">{guide.title}</h1>
            <p className="handbook-article-summary">{guide.summary}</p>
            <dl className="handbook-meta">
              <div>
                <dt>Scope</dt>
                <dd>{handbookScopeLabels[guide.scope]}</dd>
              </div>
            </dl>
            <details className="handbook-meta-details">
              <summary>Technical details</summary>
              <code>{guide.issueType}</code>
            </details>
          </header>

          <section
            aria-labelledby="what-it-means-label"
            className="handbook-section"
            id="what-it-means"
          >
            <h2 id="what-it-means-label">What it means</h2>
            {guide.explanation.map((line) => (
              <p key={line}>
                <HandbookInlineMarkdown text={line} />
              </p>
            ))}
          </section>

          <section
            aria-labelledby="how-we-detect-it-label"
            className="handbook-section"
            id="how-we-detect-it"
          >
            <h2 id="how-we-detect-it-label">How we detect it</h2>
            {guide.detection.map((line) => (
              <p key={line}>
                <HandbookInlineMarkdown text={line} />
              </p>
            ))}
          </section>

          <section
            aria-labelledby="why-it-happens-label"
            className="handbook-section"
            id="why-it-happens"
          >
            <h2 id="why-it-happens-label">Why it happens</h2>
            <ul>
              {guide.causes.map((line) => (
                <li key={line}>
                  <HandbookInlineMarkdown text={line} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="how-to-fix-it-label"
            className="handbook-section"
            id="how-to-fix-it"
          >
            <h2 id="how-to-fix-it-label">How to fix it</h2>
            <ol>
              {guide.fixes.map((line) => (
                <li key={line}>
                  <HandbookInlineMarkdown text={line} />
                </li>
              ))}
            </ol>
            {guide.example ? (
              <figure className="handbook-example">
                <figcaption>{guide.example.label}</figcaption>
                <pre>
                  <code>{guide.example.code}</code>
                </pre>
              </figure>
            ) : null}
          </section>

          <section
            aria-labelledby="how-to-verify-it-label"
            className="handbook-section"
            id="how-to-verify-it"
          >
            <h2 id="how-to-verify-it-label">How to verify it</h2>
            <ul>
              {guide.verification.map((line) => (
                <li key={line}>
                  <HandbookInlineMarkdown text={line} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="keep-in-mind-label"
            className="handbook-section"
            id="keep-in-mind"
          >
            <h2 id="keep-in-mind-label">Keep in mind</h2>
            <ul>
              {guide.cautions.map((line) => (
                <li key={line}>
                  <HandbookInlineMarkdown text={line} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="references-label"
            className="handbook-section"
            id="references"
          >
            <h2 id="references-label">References</h2>
            <ul className="handbook-refs">
              {guide.references.map((reference) => (
                <li key={reference.url}>
                  <a href={reference.url} rel="noopener" target="_blank">
                    {reference.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <aside aria-label="Verification note" className="handbook-note">
            This guide is explanatory. After making changes, run a new crawl to
            confirm the fix — results from earlier crawls stay historical.
          </aside>

          {relatedGuides.length > 0 ? (
            <nav aria-label="Related guides" className="handbook-related">
              <h2>Related guides</h2>
              <ul>
                {relatedGuides.map((related) => (
                  <li key={related.issueType}>
                    <Link to={handbookGuidePath(related)}>{related.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </article>

        <nav aria-label="On this page" className="handbook-toc">
          <div className="handbook-toc-stick">
            <p className="handbook-toc-heading">On this page</p>
            <HandbookTocList />
          </div>
        </nav>
      </div>
    </div>
  )
}

export function ErrorBoundary() {
  return (
    <HandbookRouteError
      notFoundHeading="This guide does not exist."
      notFoundHint="Browse the handbook chapters to find the guide you need."
    />
  )
}
