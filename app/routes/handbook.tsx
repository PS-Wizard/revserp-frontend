import { Link, Outlet, useParams } from "react-router"

import { HandbookThemeToggle } from "~/components/handbook/handbook-theme-toggle"

import {
  getHandbookBucket,
  getHandbookGuide,
  getHandbookGuides,
  handbookBucketPath,
  handbookGuidePath,
  handbookPillarPath,
  handbookPillars,
} from "~/content/handbook/handbook-catalog"
import { HandbookRouteError } from "../components/handbook/handbook-route-error"
import "../components/handbook/handbook.css"

function HandbookChapterNav({
  activeBucketId,
  activeGuideIssueType,
  activePillarId,
}: {
  activeBucketId?: string
  activeGuideIssueType?: string
  activePillarId?: string
}) {
  return (
    <ul className="handbook-chapters">
      {handbookPillars.map((pillar) => {
        const isActivePillar = pillar.id === activePillarId
        return (
          <li key={pillar.id}>
            <Link
              aria-current={isActivePillar ? "page" : undefined}
              className="handbook-chapter-link"
              to={handbookPillarPath(pillar.id)}
            >
              {pillar.title}
            </Link>
            {isActivePillar ? (
              <ul className="handbook-chapter-buckets">
                {pillar.buckets.map((bucket) => {
                  const isActiveBucket = bucket.id === activeBucketId
                  return (
                    <li key={bucket.id}>
                      <Link
                        aria-current={isActiveBucket ? "page" : undefined}
                        to={handbookBucketPath(pillar.id, bucket.id)}
                      >
                        {bucket.title}
                      </Link>
                      {isActiveBucket ? (
                        <ul className="handbook-chapter-guides">
                          {getHandbookGuides(pillar.id, bucket.id).map(
                            (guide) => (
                              <li key={guide.issueType}>
                                <Link
                                  aria-current={
                                    guide.issueType === activeGuideIssueType
                                      ? "page"
                                      : undefined
                                  }
                                  to={handbookGuidePath(guide)}
                                >
                                  {guide.title}
                                </Link>
                              </li>
                            )
                          )}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function HandbookLayout() {
  const params = useParams()
  const activePillar = handbookPillars.find(
    (pillar) => pillar.id === params.pillar
  )
  const activeBucket = activePillar
    ? getHandbookBucket(activePillar, params.bucket)
    : undefined

  const activeGuideIssueType = getHandbookGuide(
    params.pillar,
    params.bucket,
    params.issue
  )?.issueType

  const nav = (
    <HandbookChapterNav
      activeBucketId={activeBucket?.id}
      activeGuideIssueType={activeGuideIssueType}
      activePillarId={activePillar?.id}
    />
  )

  return (
    <div className="handbook">
      <a className="handbook-skip" href="#handbook-main">
        Skip to content
      </a>
      <header className="handbook-header">
        <div className="handbook-header-inner">
          <Link className="handbook-brand" to="/handbook">
            Revserp Handbook
          </Link>
          <div className="handbook-header-actions">
            <nav aria-label="Handbook pillars" className="handbook-header-nav">
              {handbookPillars.map((pillar) => (
                <Link
                  aria-current={
                    pillar.id === activePillar?.id ? "page" : undefined
                  }
                  key={pillar.id}
                  to={handbookPillarPath(pillar.id)}
                >
                  {pillar.title}
                </Link>
              ))}
              <Link to="/">Revserp home</Link>
            </nav>
            <HandbookThemeToggle />
          </div>
        </div>
      </header>
      <details className="handbook-browse">
        <summary>Browse the handbook</summary>
        <nav aria-label="Handbook chapters">{nav}</nav>
      </details>
      <div className="handbook-shell">
        <nav aria-label="Handbook chapters" className="handbook-sidebar">
          <div className="handbook-sidebar-stick">{nav}</div>
        </nav>
        <main className="handbook-main" id="handbook-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <footer className="handbook-footer">
        <p>
          Explanatory reference for crawl findings. Guidance describes what an
          issue means and how to approach it; after changing your site, run a
          new crawl — earlier results stay historical.
        </p>
        <nav aria-label="Handbook footer">
          <Link to="/handbook">Handbook home</Link>
          <Link to="/">Revserp home</Link>
        </nav>
      </footer>
    </div>
  )
}

export function ErrorBoundary() {
  return (
    <div className="handbook">
      <div className="handbook-shell">
        <main className="handbook-main">
          <HandbookRouteError
            notFoundHeading="This handbook page does not exist."
            notFoundHint="The chapter, section, or guide you asked for is not in the handbook. Browse the chapters to find what you need."
          />
        </main>
      </div>
    </div>
  )
}
