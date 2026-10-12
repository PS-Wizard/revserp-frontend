import { useState } from "react"
import { Link } from "react-router"
import { Search } from "lucide-react"

import {
  getHandbookPillar,
  handbookGuidePath,
  searchHandbookGuides,
} from "~/content/handbook/handbook-catalog"

export function HandbookSearch() {
  const [handbookSearchQuery, setHandbookSearchQuery] = useState("")
  const trimmedQuery = handbookSearchQuery.trim()
  const handbookSearchResults = trimmedQuery
    ? searchHandbookGuides(trimmedQuery)
    : []

  return (
    <div className="handbook-search">
      <label htmlFor="handbook-search-input">Search the handbook</label>
      <div className="handbook-search-box">
        <Search aria-hidden="true" size={18} />
        <input
          autoComplete="off"
          id="handbook-search-input"
          onChange={(event) => setHandbookSearchQuery(event.target.value)}
          placeholder="Try “missing title”, “CLS”, “llms.txt”…"
          type="search"
          value={handbookSearchQuery}
        />
      </div>
      {trimmedQuery ? (
        <div>
          <p aria-live="polite" className="handbook-search-count" role="status">
            {handbookSearchResults.length === 0
              ? `No guides match “${trimmedQuery}”.`
              : `${handbookSearchResults.length} guide${handbookSearchResults.length === 1 ? "" : "s"} matching “${trimmedQuery}”.`}
          </p>
          {handbookSearchResults.length > 0 ? (
            <ul className="handbook-search-results">
              {handbookSearchResults.map((guide) => (
                <li key={guide.issueType}>
                  <Link to={handbookGuidePath(guide)}>{guide.title}</Link>
                  <p>{guide.summary}</p>
                  <p>
                    {getHandbookPillar(guide.pillar)?.title ?? guide.pillar}
                    {" · "}
                    {guide.bucket}
                    {" · "}
                    <code>{guide.issueType}</code>
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
