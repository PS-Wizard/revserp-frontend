import type { HandbookGuide } from "./handbook-types";

export const seoHandbookGuides: HandbookGuide[] = [
  {
    issueType: "missing_title",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Page is missing a title",
    summary:
      "The page has no usable HTML title, so search results and browser tabs have nothing specific to show for it.",
    scope: "page",
    explanation: [
      "The title element is the main text search engines show as the clickable headline for a page, and browsers show it on the tab. When it is empty, both have to fall back to a URL or guess from page content.",
      "Revserp reads only the first `<title>` element and trims surrounding whitespace. If that trimmed value has zero length, the page gets this issue. A page can have a title tag in the source and still flag when the tag is empty or contains only spaces.",
      "This check runs only on healthy HTML-like pages. Broken pages such as fetch failures, 4xx or 5xx statuses, and soft 404s report one status issue instead of the content set, so a missing title never piles on top of a broken page.",
    ],
    detection: [
      "The detector measures the trimmed title with Go len(), which counts bytes rather than visible characters. Accented characters and emoji can therefore count as more than one unit each.",
      "Open the issue row and confirm the page URL, then use view-source on the live page and look for the first `<title>` element. Issue rows are evidence from the stored crawl, so always attribute the finding to that crawl and its timestamp.",
      "An empty title in the row details almost always matches an empty or whitespace-only `<title>` in the source. If the source has a title but the row says empty, the title may be injected by JavaScript after load, which the parser does not execute.",
    ],
    causes: [
      "The template never included a `<title>` element, which is common on error templates, thin programmatic pages, and newly scaffolded routes.",
      "The title is rendered client-side by JavaScript, so the server HTML the crawler parses arrives without one.",
      "A CMS field for the SEO title was left blank and the template outputs an empty tag instead of falling back to the page heading.",
    ],
    fixes: [
      "Add one descriptive `<title>` per page that states the page intent first and the site or brand name second, for example a service page naming the service and city.",
      "Keep titles unique across the site so fixing this page does not create a duplicate_title issue on another page.",
      "Render the title in the server HTML rather than injecting it with JavaScript alone, and confirm it appears in view-source.",
      "Do not stuff keywords or copy another page title verbatim; a copied title clears this row and immediately creates a duplicate-title row.",
    ],
    verification: [
      "Run a new crawl after the change and confirm the page no longer emits missing_title. Old rows stay as history and are never rewritten.",
      "Confirm the new crawl shows a non-empty title for the same URL; a CMS preview or live fetch shows the edit is applied but never closes the row by itself.",
    ],
    cautions: [
      "Length guidance from search documentation describes display behaviour, not a guarantee: search engines may rewrite the displayed headline regardless of what you set.",
      "Do not treat byte length as pixel width. A title within any character range can still be truncated on narrow screens.",
    ],
    example: {
      label: "Descriptive title in server HTML",
      code: "<head>\n  <title>Commercial plumbing repair in Austin | Acme Plumbing</title>\n</head>",
    },
    references: [
      {
        label: "Google Search Central: Title links",
        url: "https://developers.google.com/search/docs/appearance/title-link",
      },
      {
        label: "MDN: The title element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title",
      },
    ],
    relatedIssueTypes: ["title_too_short", "title_too_long", "duplicate_title", "missing_h1"],
  },
  {
    issueType: "title_too_long",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Page title is too long",
    summary:
      "The title exceeds 60 units, so search engines are likely to truncate or rewrite the displayed headline.",
    scope: "page",
    explanation: [
      "Long titles get cut off in search results, which can hide the most distinctive words at the end. The detector flags any trimmed title longer than 60, and the row message states the measured count with a recommended range of 30 to 60.",
      "The count is Go len() over the trimmed string, meaning bytes rather than characters. Plain English text counts one byte per character, but accented letters, CJK characters, and emoji count multiple bytes each and can push a title over 60 sooner than it looks.",
      "Only the first `<title>` element counts, on healthy HTML-like pages only. Empty titles are handled by missing_title instead, so this issue always concerns a real, overlong title.",
    ],
    detection: [
      "Read the exact count in the issue row details and compare it against the live `<title>` in view-source. Small differences usually come from multibyte characters or trailing spaces the trim removes.",
      "Check whether the brand suffix or a list of keyword phrases is inflating the length; those are the most common sources of excess.",
      "Remember the limit is a Revserp comparison threshold, not a Google rule. Google documentation describes display behaviour without a fixed character law, so treat 60 as a working signal rather than proof of truncation.",
    ],
    causes: [
      "A template appends the brand, category path, and keyword phrases to every title, stacking several intents into one tag.",
      "A CMS title field has no length guidance, so editors write full-sentence headlines that work on the page but not in a result list.",
      "Multibyte characters or long place names push an otherwise reasonable title past the byte threshold.",
    ],
    fixes: [
      "Shorten the title to roughly 30 to 60 units with the primary intent first, moving secondary phrases into the meta description or headings.",
      "Keep the brand only when it disambiguates the result, and put it at the end rather than deleting a distinguishing brand.",
      "Do not truncate mid-word to hit the number; rewrite the phrase so the shortened title still reads naturally.",
      "Keep the shortened title unique so the fix does not introduce a duplicate_title row.",
    ],
    verification: [
      "Run a new crawl and confirm the title length is within range with no title_too_long row for the URL.",
      "Old rows remain as history; clearance means the new crawl no longer emits the issue for the same URL.",
    ],
    cautions: [
      "Search engines may still rewrite or truncate a compliant title. Staying within range improves the odds but never guarantees the displayed headline.",
      "Byte counting penalises non-ASCII text; do not mangle names or diacritics just to satisfy the counter.",
    ],
    example: {
      label: "Shortened title with intent first",
      code: "<title>Blocked drain repair in Austin | Acme Plumbing</title>",
    },
    references: [
      {
        label: "Google Search Central: Title links",
        url: "https://developers.google.com/search/docs/appearance/title-link",
      },
      {
        label: "MDN: The title element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title",
      },
    ],
    relatedIssueTypes: ["title_too_short", "missing_title", "duplicate_title", "title_h1_mismatch"],
  },
  {
    issueType: "title_too_short",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Page title is too short",
    summary:
      "The title is present but under 30 units, so it probably does not describe the page specifically enough.",
    scope: "page",
    explanation: [
      "Very short titles such as a brand name alone or a single word like Services give searchers little reason to choose the result. The detector flags any non-empty trimmed title shorter than 30 units as a prompt to be more specific.",
      "Length is measured as Go len() bytes on the trimmed first `<title>`. Empty titles are excluded here and reported as missing_title instead, so this issue always means a real but terse title.",
      "The 30 to 60 range is a Revserp working threshold, not a search-engine law. A short title can still rank; the issue is asking whether the title carries enough intent, not declaring the page broken.",
    ],
    detection: [
      "Read the measured count in the row details and compare it with the live `<title>` in view-source, remembering multibyte characters count multiple bytes.",
      "Check whether the title is just the brand, just the category, or a single generic word that could apply to many pages on the site.",
      "If several short titles look alike, check for a duplicate_title row as well, since templated short titles often collide.",
    ],
    causes: [
      "The template outputs only the brand or a bare page name without the page-specific intent.",
      "A CMS title field was filled with a one-word label meant for navigation rather than search display.",
      "Pagination or programmatic pages reuse a short base title with no per-page qualifier.",
    ],
    fixes: [
      "Expand the title to roughly 30 to 60 units by adding the specific intent: service, topic, audience, or place, keeping the most distinctive words first.",
      "Keep it concise and readable rather than padding with filler, repeated brand text, or keyword lists.",
      "Make the expanded title unique to the page so the fix does not create a duplicate_title issue.",
      "When the page genuinely needs a short label, accept the row intentionally rather than adding meaningless words.",
    ],
    verification: [
      "Run a new crawl and confirm the title length sits between 30 and 60 with no title_too_short row for the URL.",
      "A live preview showing the new title proves the edit is applied; only the new crawl proves the row is cleared.",
    ],
    cautions: [
      "Padding a title with filler to hit 30 can make results worse. Specificity is the goal, not the number alone.",
      "Google documentation does not set a minimum title length, so treat this as editorial guidance rather than a ranking rule.",
    ],
    example: {
      label: "Expanded but still concise title",
      code: "<title>Emergency drain unblocking in Austin | Acme Plumbing</title>",
    },
    references: [
      {
        label: "Google Search Central: Title links",
        url: "https://developers.google.com/search/docs/appearance/title-link",
      },
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
    ],
    relatedIssueTypes: ["missing_title", "title_too_long", "duplicate_title", "title_h1_mismatch"],
  },
  {
    issueType: "duplicate_title",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Pages share a duplicate title",
    summary:
      "Two or more pages have the same normalized title, so search results cannot easily tell them apart.",
    scope: "page",
    explanation: [
      "When several pages share one title, search engines must choose between near-identical headlines and may show the wrong page for a query. Users face the same confusion when comparing tabs or bookmarks.",
      "Revserp normalises each title by lowercasing it and collapsing whitespace to single spaces, then groups pages with equal values. Empty titles are ignored, and groups where every URL looks like pure pagination are skipped entirely.",
      "A pagination group is skipped only when every member URL carries /page/ in the path or a ?page= value other than 1. Mixed groups, where one member is not paginated, still flag.",
    ],
    detection: [
      "The row details name matching URLs, showing up to 3 plus an and N more suffix when the group is large. Duplicate evidence groups carry the full member set behind the row.",
      "Compare the listed URLs side by side: category pages, tag pages, paginated archives, and programmatic location pages are the usual members.",
      "Because normalisation ignores case and spacing, titles that differ only in capitalisation or extra spaces still match. Changing only those never clears the row.",
    ],
    causes: [
      "A template emits one fixed title for a whole section, such as every category or author page sharing the section name.",
      "Copied page drafts or location variants were published without rewriting the title for each intent.",
      "Pagination titles omit the page number, so page 2 and page 3 normalise to the same value as page 1.",
    ],
    fixes: [
      "Give each page a title that matches its own intent, adding the distinguishing facet: category, tag, page number, place, or audience.",
      "For paginated series outside the pure-pagination exemption, include the page number in the title so members differ after normalisation.",
      "Consolidate pages that genuinely serve the same intent instead of writing cosmetic title variations around identical content.",
      "Do not rely on case or whitespace tweaks; the normaliser collapses those before comparison.",
    ],
    verification: [
      "Run a new crawl and confirm no duplicate_title row remains for the URLs in the group.",
      "Identical templated titles kept deliberately still flag by design; verification then means acknowledging the row as intended rather than clearing it.",
    ],
    cautions: [
      "Intentionally identical titles, such as staged copies or print variants, still flag. Decide deliberately whether the duplication serves users before dismissing the row.",
      "These documentation links describe Google-side title behaviour; they do not prove the Revserp normalisation matches Google exactly.",
    ],
    references: [
      {
        label: "Google Search Central: Title links",
        url: "https://developers.google.com/search/docs/appearance/title-link",
      },
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
    ],
    relatedIssueTypes: ["duplicate_meta_description", "exact_duplicate_content", "near_duplicate_content", "missing_title"],
  },
  {
    issueType: "missing_meta_description",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Page is missing a meta description",
    summary:
      "The page has no meta description, so search engines must build the result snippet entirely from page text.",
    scope: "page",
    explanation: [
      "The meta description is the short summary a page offers for its search snippet. Search engines often rewrite snippets, but a good description still sets the baseline they start from.",
      "Revserp reads only the first meta[name=description] tag and trims it. A zero-length value means the tag is absent, empty, or whitespace-only, and the page gets this issue on healthy HTML-like pages.",
      "This is a medium-severity editorial signal, not a failure. Pages without descriptions can still appear in results; they simply give up control over the suggested summary.",
    ],
    detection: [
      "Confirm the row for the URL, then inspect view-source for the first meta[name=description] tag. CMS previews that show a description may reflect a draft that the crawled HTML did not contain.",
      "Check whether the tag is injected by JavaScript, which the parser does not execute, or stripped by a template condition on some page types.",
      "Remember the stored crawl is the evidence. A live fix applied after the crawl cannot clear the row until the next crawl.",
    ],
    causes: [
      "The template omits the description tag on certain page types such as archives, tag pages, or custom post types.",
      "A CMS SEO field was left blank with no fallback, so the template outputs nothing.",
      "The description is added client-side or by a tag manager after load and never reaches the parsed HTML.",
    ],
    fixes: [
      "Add one meta[name=description] per page summarising what the page offers and for whom, in plain specific language.",
      "Render it in the server HTML and confirm it appears in view-source, not only in a JavaScript-rendered preview.",
      "Write a unique description per page rather than copying the title verbatim or reusing one global sentence.",
      "Keep the length in the 120 to 160 range so the fix does not immediately raise a too-short or too-long row.",
    ],
    verification: [
      "Run a new crawl and confirm the description is present with no missing_meta_description row for the URL.",
      "Old rows remain as history; clearance is defined as the new crawl no longer emitting the issue for the same URL.",
    ],
    cautions: [
      "Search engines frequently rewrite snippets from page content. A description is a suggestion, never a guarantee of the displayed text.",
      "Do not paste the title verbatim into the description; identical phrasing wastes the one place meant to expand on the title.",
    ],
    example: {
      label: "Unique meta description in server HTML",
      code: "<meta name='description' content='Same-day drain unblocking in Austin for homes and small businesses. Upfront pricing and a 12-month workmanship warranty.'>",
    },
    references: [
      {
        label: "Google Search Central: Snippets and meta descriptions",
        url: "https://developers.google.com/search/docs/appearance/snippet",
      },
      {
        label: "MDN: Standard metadata names",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name",
      },
    ],
    relatedIssueTypes: ["meta_description_too_short", "meta_description_too_long", "duplicate_meta_description", "thin_content"],
  },
  {
    issueType: "meta_description_too_long",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Meta description is too long",
    summary:
      "The meta description exceeds 160 units, so the key summary may be cut off in search snippets.",
    scope: "page",
    explanation: [
      "Snippet space is limited, and text past the visible cutoff may never be read. The detector flags trimmed descriptions longer than 160 units and quotes the measured count with a recommended 120 to 160 range.",
      "Length is Go len() bytes on the trimmed first meta[name=description], not visible characters. Multibyte punctuation and non-Latin scripts inflate the count faster than they appear on screen.",
      "This threshold is a Revserp working signal for snippet fitness. Search documentation does not define a hard description length law, and engines truncate or rewrite snippets at their own display limits.",
    ],
    detection: [
      "Read the exact count in the row details and compare it with the live meta tag in view-source, allowing for byte-versus-character differences.",
      "Look for stacked sentences, repeated calls to action, or appended boilerplate such as delivery notices that push the value over the limit.",
      "If the description looks short on screen but flags, suspect multibyte characters or hidden trailing content in the CMS field.",
    ],
    causes: [
      "An editor wrote a full paragraph where a two-sentence summary belongs, often by pasting the article introduction into the SEO field.",
      "A template concatenates an excerpt, category name, and site slogan into one long value.",
      "Auto-generated descriptions append boilerplate such as Read more or site-wide offers to every page.",
    ],
    fixes: [
      "Shorten the description so the core summary fits roughly 120 to 160 units, leading with the page-specific value rather than boilerplate.",
      "Cut trailing repetition first: duplicated calls to action, restated titles, and site-wide slogans add length without information.",
      "Rewrite rather than truncating mid-word so the summary still reads as a complete thought at the cutoff point.",
      "Keep the shortened description unique to avoid trading this row for a duplicate_meta_description row.",
    ],
    verification: [
      "Run a new crawl and confirm the description length is within range with no meta_description_too_long row.",
      "Clearance refers to the new crawl; earlier rows persist as historical evidence.",
    ],
    cautions: [
      "Staying within range does not guarantee the snippet shows your text. Engines may still rewrite or shorten it from page content.",
      "Do not sacrifice clarity to chase the number; a readable 150-unit summary beats a cramped 160-unit one.",
    ],
    example: {
      label: "Shortened description with key facts first",
      code: "<meta name='description' content='Same-day drain unblocking in Austin. Upfront pricing, tidy engineers, 12-month warranty.'>",
    },
    references: [
      {
        label: "Google Search Central: Snippets and meta descriptions",
        url: "https://developers.google.com/search/docs/appearance/snippet",
      },
      {
        label: "MDN: Standard metadata names",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name",
      },
    ],
    relatedIssueTypes: ["meta_description_too_short", "missing_meta_description", "duplicate_meta_description"],
  },
  {
    issueType: "meta_description_too_short",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Meta description is too short",
    summary:
      "The description is present but under 120 units, so it likely undersells the page in snippets.",
    scope: "page",
    explanation: [
      "A very short description leaves snippet space unused and often restates the title instead of expanding on it. The detector flags non-empty trimmed descriptions shorter than 120 units.",
      "Measurement is Go len() bytes on the first meta[name=description]. Empty values are reported as missing_meta_description instead, so this row always concerns a real but thin summary.",
      "The 120 to 160 band is a Revserp editorial range, not a search-engine requirement. Treat the row as an invitation to write a fuller summary, not as proof of a ranking penalty.",
    ],
    detection: [
      "Read the measured count in the row details and compare it against the live tag in view-source.",
      "Check whether the value merely repeats the title or names the topic without saying what the page offers, such as Plumbing services without scope, audience, or differentiator.",
      "When many pages share the same short sentence, also check for a duplicate_meta_description row on the group.",
    ],
    causes: [
      "The CMS field was filled with a terse label meant for internal use rather than a snippet summary.",
      "A template falls back to the page title or first category when no description is written, producing a short generic value.",
      "Auto-generated descriptions truncate excerpts aggressively and keep only the first clause.",
    ],
    fixes: [
      "Expand the description to roughly 120 to 160 units with a fuller summary: what the page covers, who it serves, and one concrete differentiator.",
      "Stay specific and concise rather than padding with filler phrases such as best ever or welcome to our website.",
      "Keep the expanded text unique per page so the fix does not create a duplicate description row.",
      "If a page type genuinely needs no snippet pitch, leave the row acknowledged rather than writing hollow filler.",
    ],
    verification: [
      "Run a new crawl and confirm the description length is within 120 to 160 with no meta_description_too_short row.",
      "Live previews prove the edit is applied; only the new crawl clears the stored row.",
    ],
    cautions: [
      "Filler added only to reach 120 can make snippets worse. Informativeness is the goal, not the count alone.",
      "Engines may ignore even a compliant description and build the snippet from page text; that is normal behaviour, not a detector error.",
    ],
    example: {
      label: "Expanded description that earns its length",
      code: "<meta name='description' content='Blocked drains cleared same-day across Austin for homes and cafes. Camera diagnosis, upfront pricing, 12-month warranty.'>",
    },
    references: [
      {
        label: "Google Search Central: Snippets and meta descriptions",
        url: "https://developers.google.com/search/docs/appearance/snippet",
      },
      {
        label: "MDN: Standard metadata names",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name",
      },
    ],
    relatedIssueTypes: ["missing_meta_description", "meta_description_too_long", "duplicate_meta_description"],
  },
  {
    issueType: "duplicate_meta_description",
    pillar: "seo",
    bucket: "serp_metadata",
    title: "Pages share a duplicate meta description",
    summary:
      "Two or more pages reuse the same normalized description, so their snippets cannot differentiate them.",
    scope: "page",
    explanation: [
      "Duplicate descriptions make candidate snippets interchangeable, which weakens the one summary each page offers to searchers. The fix is usually per-page copy rather than structural work.",
      "Revserp applies the same normalisation as duplicate titles: lowercase plus single-spacing, empty values ignored, and pure-pagination groups skipped when every member URL carries /page/ or a non-1 ?page= value.",
      "Row details list up to 3 matching URLs plus an and N more suffix, while duplicate evidence groups carry the member set for the full group.",
    ],
    detection: [
      "Open the row details and list the matching URLs, then compare their live meta tags in view-source to confirm the shared sentence.",
      "Suspect a global CMS default or a template fallback whenever the same sentence appears across unrelated sections.",
      "Remember that case-only or whitespace-only edits do not break the match, because the normaliser removes those differences before comparing.",
    ],
    causes: [
      "A site-wide default description is applied to every page without one, turning a missing-description problem into a duplication problem.",
      "Category, tag, or location templates reuse one boilerplate sentence across all members.",
      "Copied drafts kept the source page description when the body was rewritten.",
    ],
    fixes: [
      "Write a unique description per page that reflects its own intent, keeping each within roughly 120 to 160 units.",
      "Replace global fallback text with per-type templates that interpolate the distinguishing facet, such as the category or place name.",
      "For genuinely paginated series inside the pure-pagination exemption, no action is needed; outside it, differentiate or consolidate the pages.",
      "Verify the rewrite in view-source rather than only in the CMS editor, since some fields do not render to the crawled HTML.",
    ],
    verification: [
      "Run a new crawl and confirm no duplicate_meta_description row remains for the member URLs.",
      "Deliberately shared descriptions still flag by design; acknowledge them as intended instead of editing around the detector.",
    ],
    cautions: [
      "Unique descriptions do not guarantee unique displayed snippets, because engines may rewrite any of them from page content.",
      "Google documentation on snippets describes best practice; it does not prove the Revserp normalisation equals any search-engine comparison.",
    ],
    references: [
      {
        label: "Google Search Central: Snippets and meta descriptions",
        url: "https://developers.google.com/search/docs/appearance/snippet",
      },
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
    ],
    relatedIssueTypes: ["duplicate_title", "missing_meta_description", "near_duplicate_content", "exact_duplicate_content"],
  },
  {
    issueType: "missing_h1",
    pillar: "seo",
    bucket: "content_structure",
    title: "Page is missing an H1",
    summary:
      "The page has no usable first-level heading, so its main topic is never stated in the heading outline.",
    scope: "page",
    explanation: [
      "The H1 is the on-page headline that tells readers and parsers what the page is about. Titles serve search results; the H1 serves the reader who has already arrived.",
      "Revserp takes the first non-empty h1 as the page H1 and counts every h1 element separately. When that first non-empty text is empty, meaning no h1 or only blank ones, the page gets this issue.",
      "Empty headings are excluded from the outline used by other checks, so a page with only blank h1 elements also has no outline entry to evaluate for skipped levels.",
    ],
    detection: [
      "Confirm the row for the URL, then inspect the rendered page and view-source for an h1 element with real text. Headings injected only by JavaScript do not count for the parser.",
      "Check whether the visual headline is a styled div or paragraph rather than a heading element; text that looks like a heading without heading markup is invisible to this check.",
      "Headings hidden with CSS still count when they contain text, so a hidden empty h1 is doubly unhelpful: it counts toward multiple_h1 while leaving this row uncleared.",
    ],
    causes: [
      "The template styles a div as the headline and never uses an h1 element.",
      "A page-builder heading block was left empty or set to a lower level, leaving the page without a primary heading.",
      "The h1 is rendered client-side after load, so the parsed HTML contains no heading text.",
    ],
    fixes: [
      "Add one primary h1 to the page that states the page topic in plain words, matching the intent of the title without needing to be byte-identical.",
      "Use a real h1 element in the server HTML rather than a styled div, and confirm it appears in view-source.",
      "Keep exactly one h1 so the fix does not raise a multiple_h1 row; demote secondary headlines to h2 or lower.",
      "Do not hide the h1 with CSS or fill it with keyword lists; hidden or stuffed headings fail readers even when they satisfy a counter.",
    ],
    verification: [
      "Run a new crawl and confirm the page H1 is non-empty with no missing_h1 row for the URL.",
      "Check the stored H1 value on the new crawl rather than only the visual page, since styling can mislead.",
    ],
    cautions: [
      "One clear H1 beats several competing ones. Adding extra h1 elements to be safe creates the multiple_h1 problem instead.",
      "Heading guidance in search starter documentation describes structure best practice, not a guarantee of improved visibility.",
    ],
    example: {
      label: "Single primary heading",
      code: "<main>\n  <h1>Blocked drain repair in Austin</h1>\n  <p>Same-day callouts across the metro area.</p>\n</main>",
    },
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "MDN: Heading elements",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements",
      },
    ],
    relatedIssueTypes: ["multiple_h1", "title_h1_mismatch", "missing_title", "skipped_heading_levels"],
  },
  {
    issueType: "multiple_h1",
    pillar: "seo",
    bucket: "content_structure",
    title: "Page has multiple H1 headings",
    summary:
      "The page contains more than one h1 element, so there is no single primary headline for the outline.",
    scope: "page",
    explanation: [
      "Multiple top-level headings force readers and assistive technology to guess which headline defines the page. A single H1 with sectioned h2 headings gives the outline a clear root.",
      "Revserp counts every h1 element in the full document, including empty ones and header or footer headings. The H1 value itself is the first non-empty h1, but the count behind this issue includes blanks, so two empty h1 tags still flag.",
      "The count covers the whole document rather than the cleaned main container, which surprises sites whose header logo and footer slogan each use an h1.",
    ],
    detection: [
      "Confirm the row, then search view-source for all h1 occurrences rather than only the visible headline; header and footer markup are frequent hidden members.",
      "Check page-builder templates that emit an h1 per section or per widget, and themes that wrap the logo in an h1 on every page.",
      "Empty h1 elements still increment the count, so do not stop after finding the visible one when the row persists.",
    ],
    causes: [
      "A theme wraps the site logo in an h1 while the content template adds its own h1, doubling the count on every page.",
      "Page-builder sections each start with an h1 because the style looked right, without regard for outline level.",
      "Footer or sidebar widgets include h1 elements copied from heading styles.",
    ],
    fixes: [
      "Keep one primary h1 for the page topic and demote every other h1 to h2 or lower, preserving the visual style through CSS rather than heading level.",
      "Change logo, widget, and footer headings to paragraphs or lower-level headings styled to match, since hiding extra h1 elements with display rules does not remove them from the parse.",
      "Remove empty h1 elements entirely instead of leaving blank tags in the markup.",
      "Re-crawl mentally through the full document, not just the article body, because the counter includes header and footer markup.",
    ],
    verification: [
      "Run a new crawl and confirm the H1 count is 1 with no multiple_h1 row for the URL.",
      "Verify in view-source that only one h1 element remains; visual inspection alone can miss hidden extras.",
    ],
    cautions: [
      "Hiding extra h1 elements with CSS is explicitly not a fix: the parser counts them regardless of display rules.",
      "Modern HTML allows several h1 elements in sectioned content, but this detector keeps the one-primary-h1 convention, so decide intentionally when deviating.",
    ],
    example: {
      label: "Demoted secondary headings",
      code: "<main>\n  <h1>Blocked drain repair in Austin</h1>\n  <h2>Pricing</h2>\n  <h2>Service area</h2>\n</main>",
    },
    references: [
      {
        label: "MDN: Heading elements",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements",
      },
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
    ],
    relatedIssueTypes: ["missing_h1", "skipped_heading_levels", "title_h1_mismatch"],
  },
  {
    issueType: "title_h1_mismatch",
    pillar: "seo",
    bucket: "content_structure",
    title: "Page title and H1 do not align",
    summary:
      "The title and the main heading describe different intents, so the result headline and the landing headline disagree.",
    scope: "page",
    explanation: [
      "Searchers click a title and expect the landing headline to confirm they arrived in the right place. When the two diverge, confidence drops and the page can attract the wrong queries.",
      "Revserp flags a mismatch only when both values are non-empty, neither contains the other after lowercase single-space normalisation, and unweighted character-trigram similarity sits under 0.32. The similarity step strips edge punctuation and common stop words before comparing trigrams, so only genuinely different wording scores low. Either value containing the other, such as a title that extends the H1 with a brand suffix, passes without a row.",
      "The row details quote both the title and the H1, so the disagreement is directly inspectable without opening the page.",
    ],
    detection: [
      "Read the quoted title and H1 in the row details and ask whether a stranger would recognise them as the same page intent.",
      "Check normalisation effects first: case, spacing, edge punctuation, and common stop-word differences alone never cause this row, so a flag means the wording genuinely diverges past the 0.32 similarity gate.",
      "Watch for template drift, where the title pulls from an SEO field last edited months after the H1, or category pages whose H1 names the listing while the title names a campaign.",
    ],
    causes: [
      "The SEO title was rewritten for clicks while the on-page H1 kept older wording, and the two were never reconciled.",
      "A template builds the title from category plus brand while the H1 comes from the article headline field, producing systematically different phrasing.",
      "The page changed topic over time and only one of the two fields was updated.",
    ],
    fixes: [
      "Align both on the same page intent by rewriting the vaguer of the two, keeping each natural for its context rather than forcing byte-identical text.",
      "Let one contain the other where that reads well, since containment passes the check and often matches the title-brand-suffix pattern.",
      "Update the CMS fields that feed each value so future edits do not reintroduce drift, and document which field owns the page intent.",
      "Do not make them byte-identical when the sections genuinely differ; alignment means shared intent, not duplicated strings.",
    ],
    verification: [
      "Run a new crawl and confirm no title_h1_mismatch row remains for the URL.",
      "Confirm both stored values on the new crawl read as the same intent to a fresh reader, not merely that the row disappeared.",
    ],
    cautions: [
      "Deliberately different but related phrasing near the 0.32 threshold can flag. When the divergence is intentional, acknowledge the row rather than warping good copy to satisfy a similarity number.",
      "Similarity here is an unweighted Revserp character-trigram Dice comparison, not a search-engine relevance judgement; the field weights used for near-duplicate scoring do not apply to this check.",
    ],
    references: [
      {
        label: "Google Search Central: Title links",
        url: "https://developers.google.com/search/docs/appearance/title-link",
      },
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
    ],
    relatedIssueTypes: ["missing_title", "missing_h1", "title_too_long", "title_too_short"],
  },
  {
    issueType: "missing_h2_on_long_page",
    pillar: "seo",
    bucket: "content_structure",
    title: "Long page is missing H2 headings",
    summary:
      "A page of 300 or more words has no H2 subheadings, so long text arrives as one unbroken block.",
    scope: "page",
    explanation: [
      "Subheadings let readers scan a long page and jump to the section they need. Without them, instructions, pricing, and background blur into a wall of text that many readers abandon.",
      "Revserp flags pages where the stored WordCount reaches 300 or more while the non-empty h2 count is 0. WordCount is whitespace-separated tokens of cleaned visible text from the main container with boilerplate stripped, not raw HTML length.",
      "Empty h2 elements are not counted, so decorative or placeholder subheadings do not satisfy the check. Only h2 elements with real text move the counter above zero.",
    ],
    detection: [
      "Read the word count quoted in the row details and confirm the page genuinely carries long-form content rather than inflated boilerplate the cleaning would have stripped.",
      "Search view-source for h2 elements; pages that use bold paragraphs or oversized divs as section titles have zero despite looking structured.",
      "Check whether subheadings exist at other levels only, such as h3 sections without any parent h2, which still leaves this counter at zero.",
    ],
    causes: [
      "A long article or guide was written as continuous prose with bold lead-ins instead of heading elements.",
      "The editor used h3 or h4 styling for sections while no h2 was ever added, often after copying formatting from another document.",
      "Content migrated from a document or page builder preserved visual styles but dropped the heading levels.",
    ],
    fixes: [
      "Break the page into sections with descriptive h2 subheadings that name each part in plain words a scanner can follow.",
      "Use real h2 elements in the markup rather than bold text or styled divs, and keep them in logical reading order.",
      "Write subheadings that summarise the section rather than generic labels such as Section 1, so each aids both scanning and snippet selection.",
      "Do not add empty h2 elements for spacing; they are excluded from the count and add nothing for readers.",
    ],
    verification: [
      "Run a new crawl and confirm the H2 count is above 0 with no missing_h2_on_long_page row for the URL.",
      "Read the updated page as a scanner would: each major block should start with a heading that predicts its content.",
    ],
    cautions: [
      "Short pages never flag here regardless of structure; adding h2 elements to a 100-word page is optional, not required by this check.",
      "Word count reflects cleaned visible text, so header, footer, script, and style content do not contribute to the 300-word gate.",
    ],
    example: {
      label: "Sectioned long page",
      code: "<main>\n  <h1>Blocked drain guide</h1>\n  <h2>Signs of a blockage</h2>\n  <p>Slow drainage and gurgling traps.</p>\n  <h2>What to do first</h2>\n  <p>Stop running water, then call for diagnosis.</p>\n</main>",
    },
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "MDN: Heading elements",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements",
      },
    ],
    relatedIssueTypes: ["skipped_heading_levels", "thin_content", "missing_h1"],
  },
  {
    issueType: "skipped_heading_levels",
    pillar: "seo",
    bucket: "content_structure",
    title: "Page skips heading levels",
    summary:
      "The heading outline jumps more than one level somewhere, for example from H2 straight to H4.",
    scope: "page",
    explanation: [
      "Heading levels form an outline the way chapter numbers do: readers and assistive technology expect h3 to sit under h2, not to appear from nowhere. A jump from H2 to H4 breaks that contract and makes the structure harder to follow.",
      "Revserp builds the outline from non-empty h1 through h6 elements in document order and flags any step upward larger than one level. Fewer than two headings never flag, and empty headings are excluded before the comparison.",
      "Row details name each jump with the quoted heading texts, so the exact transition to repair is spelled out rather than guessed.",
    ],
    detection: [
      "Read the jump descriptions in the row details, which quote the from and to headings such as an H2 jumping to an H4.",
      "Walk the page with a headings-outline view or search view-source for h1 through h6 in order; jumps usually come from pasted content or heading styles chosen for size rather than level.",
      "Note that dropping back down, such as H4 to H2, is not a skip; only upward jumps of more than one level flag.",
    ],
    causes: [
      "An editor picked a heading style for its font size, using h4 under an h2 because it looked smaller.",
      "Migrated or pasted content carried heading levels from a different outline that do not fit the new page.",
      "A component template hardcodes a deep heading level that sits under a shallower parent on some pages.",
    ],
    fixes: [
      "Restructure so levels progress without skipping: demote or promote the offending heading by one level until the outline steps by at most one.",
      "Separate visual size from outline level by styling headings with CSS while keeping the markup hierarchy logical.",
      "Fix each named jump in the row details in document order, since repairing one can reveal the intended nesting for the next.",
      "Do not fake headings with styled paragraphs; text that looks like a heading without heading markup stays invisible to the outline.",
    ],
    verification: [
      "Run a new crawl and confirm the outline has no jumps with no skipped_heading_levels row for the URL.",
      "Re-read the outline top to bottom: every level change upward should step by exactly one.",
    ],
    cautions: [
      "Cosmetic restyling does not repair the outline. Only the heading tags themselves matter to this check.",
      "AValid outline is no guarantee of good writing; headings should still summarise their sections rather than merely nest correctly.",
    ],
    references: [
      {
        label: "MDN: Heading elements",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Heading_Elements",
      },
      {
        label: "W3C WAI: Headings tutorial",
        url: "https://www.w3.org/WAI/tutorials/page-structure/headings/",
      },
    ],
    relatedIssueTypes: ["missing_h1", "multiple_h1", "missing_h2_on_long_page"],
  },
  {
    issueType: "thin_content",
    pillar: "seo",
    bucket: "content_quality",
    title: "Page content is thin",
    summary:
      "The page has some text but fewer than 150 words, so it may not answer its intent on its own.",
    scope: "page",
    explanation: [
      "Thin pages often disappoint visitors who clicked expecting an answer: a service page with two sentences, a product page with only a price, or a location page with a bare address. Search engines face the same shortfall when deciding what the page covers.",
      "Revserp flags pages whose stored WordCount is above 0 and below 150. WordCount is whitespace-separated tokens of cleaned visible text taken from the main or article container where present, with header, footer, navigation, scripts, and common chrome classes stripped out.",
      "A page with zero counted words is not thin but empty, and is reported under near_empty_visible_content instead. Thin means genuinely sparse rather than completely blank.",
    ],
    detection: [
      "Read the stored word count context in related rows and compare it with the visible article text, ignoring header, footer, and cookie banners the cleaning removes.",
      "Check whether the page leans on images, videos, or downloads to carry meaning that text never states; the counter measures words, not media value.",
      "JavaScript-only pages parsed without rendering can undercount badly. Little counted text on such pages is a coverage limitation, not proof the live page is empty.",
    ],
    causes: [
      "Programmatic pages were generated per location, tag, or variant with only a sentence of unique text each.",
      "The page is a placeholder or stub published before its content was written.",
      "Key content lives in images, embedded viewers, or client-rendered widgets the parser never converts to visible text.",
    ],
    fixes: [
      "Add useful original content that answers the page intent: what the page offers, who it serves, how it works, and what to do next.",
      "Write for the visitor first with specific details such as scope, process, pricing basis, and service area rather than generic filler.",
      "Consolidate pages whose intents overlap instead of padding each stub with boilerplate; cleaning strips much boilerplate and footer repetition anyway.",
      "Do not inflate the count with copied footer text or hidden paragraphs; hidden text is not visible content and copied boilerplate adds no distinct value.",
    ],
    verification: [
      "Run a new crawl and confirm the WordCount reaches 150 or more with no thin_content row for the URL.",
      "Read the page fresh and check that a stranger could act on it without opening another page for the basics.",
    ],
    cautions: [
      "Word count is a Revserp editorial gate, not a search-engine quality verdict. A focused 120-word page can satisfy users while still flagging here.",
      "Copying boilerplate to inflate the count is explicitly unhelpful: the cleaner strips much of it before counting.",
    ],
    references: [
      {
        label: "Google Search Central: Helpful, reliable, people-first content",
        url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
      },
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
    ],
    relatedIssueTypes: ["near_empty_visible_content", "exact_duplicate_content", "near_duplicate_content", "missing_h2_on_long_page"],
  },
  {
    issueType: "near_empty_visible_content",
    pillar: "seo",
    bucket: "content_quality",
    title: "Page has near-empty visible content",
    summary:
      "The page shows fewer than 25 counted visible words, so there is almost nothing for readers or parsers to work with.",
    scope: "page",
    explanation: [
      "A page with a headline and a button but no explanatory text leaves visitors guessing and gives text-based evaluation almost nothing to assess. Zero counted words is reported as empty visible content at high severity; 1 to 24 words is the near-empty medium case.",
      "The count is whitespace-separated tokens of cleaned VisibleText from the main content container, with chrome, scripts, styles, and common banner classes removed. Alt text, scripts, and hidden text do not contribute.",
      "Row details state the counted number, such as a page with only 6 visible words, so the scale of the shortfall is explicit.",
    ],
    detection: [
      "Read the counted words in the row details and compare with the article body, ignoring navigation, cookie notices, and footers that cleaning excludes.",
      "Check whether the page is a placeholder, an unconfigured template, or a JavaScript application shell with no server-rendered text.",
      "For JavaScript-heavy pages, view-source reveals the gap directly: when the body carries only a root div and script tags, the parser has no visible text to count.",
    ],
    causes: [
      "The page was published as a stub or coming-soon shell with only a headline and a call to action.",
      "Content renders entirely client-side, so the parsed HTML arrives without text.",
      "The main container holds only media, forms, or embedded widgets with no accompanying explanation.",
    ],
    fixes: [
      "Add substantial visible content beyond placeholder or utility copy: describe the offer, the process, and the next step in complete sentences.",
      "Server-render the core text so it appears in the HTML rather than depending on script execution.",
      "Pair media and forms with explanations of what they show and what happens after submitting or playing.",
      "Do not add hidden text, alt-only descriptions, or scripts to inflate the count; none of those count as visible text.",
    ],
    verification: [
      "Run a new crawl and confirm the token count reaches 25 or more with no near_empty_visible_content row for the URL.",
      "Confirm the words appear in the main article text a reader sees, not in metadata or hidden regions.",
    ],
    cautions: [
      "JavaScript-only pages parsed without rendering undercount by design. Treat the row as a coverage limitation to investigate, not automatic proof the live experience is empty.",
      "A utility page such as a bare redirect confirmation may legitimately stay short; acknowledge the row intentionally rather than padding it.",
    ],
    references: [
      {
        label: "Google Search Central: Helpful, reliable, people-first content",
        url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
      },
      {
        label: "Google Search Central: JavaScript SEO basics",
        url: "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
      },
    ],
    relatedIssueTypes: ["thin_content", "fetch_failed", "soft_404", "missing_h1"],
  },
  {
    issueType: "exact_duplicate_content",
    pillar: "seo",
    bucket: "content_quality",
    title: "Pages have exact duplicate content",
    summary:
      "Two or more pages have byte-identical normalized content, so they compete for the same intent with the same words.",
    scope: "page",
    explanation: [
      "Identical pages split attention between URLs that offer nothing distinct. Visitors cannot tell which to trust, and evaluation effort is spent comparing copies instead of distinct answers.",
      "Revserp normalises the title, meta description, H1, and visible text by lowercasing and single-spacing each, drops empty fields, joins the rest with newlines, and compares SHA256 hashes. Equal hashes across 2 or more pages raise this high-severity row with matching URLs named in the details.",
      "The comparison ignores canonical tags entirely. Adding a canonical to one copy is good consolidation practice but does not change the hash, so identical copy still flags until the text differs or the duplicates leave the crawled set.",
    ],
    detection: [
      "Read the matching URLs in the row details and the duplicate evidence groups carrying the member set, then compare the pages side by side.",
      "Because normalisation collapses case and spacing, edits that change only capitalisation or extra spaces never break the match.",
      "Suspect print variants, staged copies, HTTP versus HTTPS duplicates, and query-parameter copies whenever the text matches exactly but the URLs differ trivially.",
    ],
    causes: [
      "The same content was published at several URLs through staging copies, print views, or parameterised variants.",
      "Location or product templates duplicate one source text across many pages without per-page differentiation.",
      "Migrations left old and new URL trees serving identical bodies side by side.",
    ],
    fixes: [
      "Decide the consolidation intentionally: keep one canonical source with unique copy and remove or redirect true duplicates to it.",
      "Differentiate pages that must remain separate by writing genuinely distinct text for each intent rather than shuffling punctuation the normaliser collapses.",
      "Use canonical tags and redirects as consolidation practice, understanding they do not clear this row on their own; the normalized content must actually differ or the duplicate pages must leave the crawled set.",
      "Remove staged, print, or parameter copies from the crawled set when they serve no user purpose.",
    ],
    verification: [
      "Run a new crawl and confirm no exact-duplicate row remains for the set because the normalized content differs or the set is gone, not merely because a canonical tag was added.",
      "Re-compare the member URLs after the crawl; any remaining pair with equal normalized hashes still flags.",
    ],
    cautions: [
      "Intentionally mirrored pages such as print variants still flag by design. Keep them only deliberately, and expect the row while they exist.",
      "Canonical and redirect work is best practice for consolidation but is explicitly not detector clearance here; verification requires differing content or removal from the set.",
    ],
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
      {
        label: "Google Search Central: Helpful, reliable, people-first content",
        url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
      },
    ],
    relatedIssueTypes: ["near_duplicate_content", "duplicate_title", "duplicate_meta_description", "canonical_differs"],
  },
  {
    issueType: "near_duplicate_content",
    pillar: "seo",
    bucket: "content_quality",
    title: "Pages have near-duplicate content",
    summary:
      "Two or more pages are closely similar without being identical, so their intents overlap more than their words differ.",
    scope: "page",
    explanation: [
      "Near-duplicates are the location pages that differ by one suburb name, or product pages sharing three paragraphs with one swapped specification. Each pair wastes a chance to answer its own intent distinctly.",
      "Revserp first requires candidate pairs to share at least 2 word bigrams after stop-word removal, then scores weighted character-trigram similarity at 0.58 or more, composed of visible text at 0.55 plus title, meta description, and H1 at 0.15 each. Exact-hash matches are excluded from this check and reported as exact duplicates instead.",
      "Relations carry the pairwise similarity for inspection. The check uses shingle prefiltering for scale, so very short pages may never become candidates even when they read similarly.",
    ],
    detection: [
      "Read the matched URLs and their pairwise similarity in the relation evidence, then diff the pages to find the shared boilerplate versus the distinct facts.",
      "Check templates that wrap a small unique slot in a large shared shell; the weighting means body-text overlap dominates the score while title and heading differences contribute less.",
      "Short pages that feel duplicative but never flag are usually below the candidate prefilter, not proof of distinctness.",
    ],
    causes: [
      "Location, category, or product templates reuse most of the body with token swaps for names or attributes.",
      "Content was syndicated or copied across sections with light edits that preserve trigram structure.",
      "Pagination or faceted pages share long introductions above small distinct listings.",
    ],
    fixes: [
      "Differentiate with genuinely unique content per intent: distinct explanations, examples, scope, and next steps rather than synonym swaps.",
      "Consolidate when intents truly overlap, keeping one strong page and redirecting the weaker siblings to it.",
      "Treat canonical tags as consolidation practice with the same caveat as exact duplicates: the similarity check ignores canonical tags, so text must actually diverge or pages must leave the set.",
      "Do not shuffle stop words alone; stop words are removed before comparison and such edits barely move the score.",
    ],
    verification: [
      "Run a new crawl and confirm no near-duplicate relation remains for the pair because the content is actually distinct or consolidated out of the set.",
      "Re-diff the former pair after the crawl; the shared boilerplate should be gone or sharply reduced, not merely reworded.",
    ],
    cautions: [
      "Similarity scoring is a Revserp heuristic with fixed weights and a 0.58 gate, not a search-engine duplication verdict. Use it to prioritise rewriting, not to claim a penalty.",
      "Very short pages may escape candidacy through the shingle prefilter; absence of a row never proves two stubs are distinct enough for readers.",
    ],
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
      {
        label: "Google Search Central: Helpful, reliable, people-first content",
        url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
      },
    ],
    relatedIssueTypes: ["exact_duplicate_content", "duplicate_title", "thin_content", "canonical_differs"],
  },
  {
    issueType: "missing_canonical",
    pillar: "seo",
    bucket: "indexability",
    title: "Page is missing a canonical URL",
    summary:
      "The page declares no preferred URL, so duplicate or parameter variants have no consolidation hint.",
    scope: "page",
    explanation: [
      "The canonical link tells search engines which URL is the preferred copy when similar versions exist. Without it, each variant must stand on its own and consolidation signals stay weak.",
      "Revserp reads the first link[rel=canonical] href and trims it. An empty value means the element is absent or its href is blank, which raises this medium-severity row on healthy HTML-like pages.",
      "A missing canonical never breaks the page by itself. It matters most on sites with tracking parameters, print views, or HTTP and HTTPS variants of the same content.",
    ],
    detection: [
      "Confirm the row for the URL, then check view-source for a link rel=canonical element in the head. CMS fields that show a canonical in the editor do not count unless they render to the crawled HTML.",
      "Check whether the tag is injected by JavaScript or stripped by template conditions on some page types.",
      "Attribute the finding to the stored crawl; a canonical added after that crawl cannot clear the row until the next one.",
    ],
    causes: [
      "The theme or template never outputs a canonical element.",
      "A CMS SEO field for the canonical URL was left blank with no self-referencing fallback.",
      "The tag renders only on selected post types, leaving archives, search, or custom templates uncovered.",
    ],
    fixes: [
      "Add a link rel=canonical element with the preferred absolute page URL, self-referencing on canonical pages.",
      "Render it in the server HTML head so it appears in view-source, using an absolute http(s) URL.",
      "Audit templates per page type so archives and custom types carry canonicals as well as posts and pages.",
      "Keep the target indexable; a canonical pointing at a noindex or error page raises a separate non-indexable-target row.",
    ],
    verification: [
      "Run a new crawl and confirm the canonical is present with no missing_canonical row for the URL.",
      "Confirm the stored canonical value on the new crawl equals the intended preferred URL.",
    ],
    cautions: [
      "A canonical is a hint, not a directive, and search engines may choose a different canonical. It still pays to declare one deliberately.",
      "Documentation on consolidation describes best practice; it does not prove any engine follows the declared canonical exactly.",
    ],
    example: {
      label: "Self-referencing canonical",
      code: "<head>\n  <link rel='canonical' href='https://example.com/drain-repair-austin/'>\n</head>",
    },
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
      {
        label: "MDN: The link element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link",
      },
    ],
    relatedIssueTypes: ["malformed_canonical", "canonical_differs", "canonical_points_to_non_indexable_page", "exact_duplicate_content"],
  },
  {
    issueType: "malformed_canonical",
    pillar: "seo",
    bucket: "indexability",
    title: "Canonical URL is malformed",
    summary:
      "The declared canonical is not a valid absolute http(s) URL, so it cannot be followed as a consolidation hint.",
    scope: "page",
    explanation: [
      "A canonical that points nowhere usable is worse than decorative: it suggests a preferred URL that parsers must discard, leaving the page effectively without consolidation guidance.",
      "Revserp treats a canonical as malformed when it is not an absolute HTTP or HTTPS URL. Relative paths, wrong schemes such as ftp or bare domains without a scheme, and unparsable values all flag, with the value quoted in the row details.",
      "The parser normalises resolvable canonicals against the page URL where possible, so surviving values that still flag are the ones that could not qualify as absolute http(s) targets.",
    ],
    detection: [
      "Read the quoted canonical value in the row details and compare it with the link rel=canonical href in view-source.",
      "Look for relative hrefs such as /drain-repair-austin/ without an origin, scheme-relative or mistyped schemes, and template placeholders left unfilled.",
      "Check CMS fields that store paths rather than full URLs when the template outputs them verbatim into the href.",
    ],
    causes: [
      "The template outputs a root-relative path instead of an absolute URL.",
      "A CMS field holds a pasted path or a domain without https:// and the markup repeats it unchanged.",
      "A migration or staging prefix produced an unparsable or wrong-scheme value that was never validated.",
    ],
    fixes: [
      "Replace the value with a valid absolute http(s) URL for the preferred page, including the scheme and host.",
      "Fix the template or field to emit absolute URLs, adding validation so paths alone cannot be saved as canonicals.",
      "Remove staging hosts and placeholder tokens from the value before publishing.",
      "Re-check pages sharing the template, since a markup bug usually affects every page using it.",
    ],
    verification: [
      "Run a new crawl and confirm the stored canonical is well-formed with no malformed_canonical row for the URL.",
      "Confirm the value in view-source is the same absolute URL the new crawl stored.",
    ],
    cautions: [
      "Normalising a relative canonical into an absolute one at render time is acceptable only when the resolved target is the intended preferred URL; verify the resolution rather than assuming it.",
      "A well-formed canonical is still a hint. Validity makes it usable, not binding.",
    ],
    example: {
      label: "Absolute canonical URL",
      code: "<link rel='canonical' href='https://example.com/drain-repair-austin/'>",
    },
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
      {
        label: "MDN: The link element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link",
      },
    ],
    relatedIssueTypes: ["missing_canonical", "canonical_differs", "canonical_points_to_non_indexable_page"],
  },
  {
    issueType: "canonical_differs",
    pillar: "seo",
    bucket: "indexability",
    title: "Canonical URL differs from page URL",
    summary:
      "The page canonicalises to a different URL string, so it declares itself a non-preferred copy of another page.",
    scope: "page",
    explanation: [
      "A cross-page canonical tells search engines to consolidate this page toward another URL. That is sometimes exactly the intent for variants and pagination, and sometimes an accident that surrenders a page that should stand alone.",
      "Revserp compares the trimmed page URL string with the trimmed canonical string using exact equality, not URL normalisation. Trailing slashes, query order, case, or encoding differences that a human calls equivalent still flag here.",
      "The row details name the canonical target, so the first question is always whether that target is the deliberate preferred copy.",
    ],
    detection: [
      "Read the canonical target in the row details and compare it character by character with the page URL, watching for trailing slashes, parameters, and http versus https.",
      "Check whether the target is intentional consolidation for duplicates and variants, or template drift pointing many pages at the homepage or a section root.",
      "Remember the comparison is string equality: equivalent URLs in different spellings flag while the strings differ, even when they resolve identically.",
    ],
    causes: [
      "Variant, parameter, or paginated pages deliberately canonicalise to the main page.",
      "A template hardcodes one canonical for a whole section, pointing distinct articles at a category root.",
      "URL spelling drift such as slash, case, or tracking-parameter differences makes a self-intended canonical read as cross-page.",
    ],
    fixes: [
      "Confirm intent first: when cross-page canonicalisation is deliberate for variants or pagination, keep it and acknowledge the row as intended.",
      "When the page should stand alone, point the canonical at this page preferred URL with matching string spelling.",
      "Normalise the site URL spelling, such as trailing-slash and case conventions, so self-referencing canonicals compare equal.",
      "Consolidate true duplicates intentionally rather than scattering cross-page canonicals across overlapping intents.",
    ],
    verification: [
      "For unintended differences, run a new crawl and confirm the stored canonical equals the page URL with no canonical_differs row.",
      "For intentional cross-page canonicals, verification means the row is acknowledged as intended; the exact-string check stays flagged by design and never clears while the strings differ.",
    ],
    cautions: [
      "An intentional cross-page canonical stays flagged by design because the check is exact string inequality. Do not chase clearance by weakening deliberate consolidation.",
      "Canonicals are hints that engines may override; a declared target does not guarantee consolidation toward it.",
    ],
    example: {
      label: "Self-referencing canonical spelling",
      code: "<link rel='canonical' href='https://example.com/guides/drain-care/'>",
    },
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
    ],
    relatedIssueTypes: ["missing_canonical", "malformed_canonical", "canonical_points_to_non_indexable_page", "exact_duplicate_content"],
  },
  {
    issueType: "canonical_points_to_non_indexable_page",
    pillar: "seo",
    bucket: "indexability",
    title: "Canonical points to a non-indexable page",
    summary:
      "The canonical target itself cannot be indexed, so the consolidation hint leads to a dead end.",
    scope: "page",
    explanation: [
      "Pointing a canonical at a page that refuses indexing asks search engines to consolidate toward a URL that cannot appear in results. The hint contradicts itself and the source page keeps no clear preferred copy.",
      "Revserp raises this row when the canonical target exists in the same crawl facts and is non-indexable: its meta[name=robots] contains noindex case-insensitively, or its status is 400 or above. Targets outside the crawled set cannot be judged and do not flag.",
      "This is a high-severity contradiction worth fixing promptly, since it usually means one of the two pages carries the wrong directive.",
    ],
    detection: [
      "Read the canonical target named in the row details, then inspect that target page status and its meta robots value in view-source.",
      "Check whether the target was accidentally left noindexed after staging, or whether it errors while the source still points at it.",
      "Remember only same-crawl targets are evaluated; an external or uncrawled target neither passes nor fails this check.",
    ],
    causes: [
      "The preferred page kept a staging noindex directive after launch while variants canonicalise to it.",
      "The target was removed or broke, returning a 4xx or 5xx status that now poisons every canonical pointing at it.",
      "A template canonicalises a section to a landing page that was later deindexed without updating the sources.",
    ],
    fixes: [
      "Point the canonical at an indexable preferred page that returns success and carries no noindex directive.",
      "Alternatively make the current target indexable: remove the stray noindex when it should appear in results, or repair the error status.",
      "Audit every page canonicalising to the repaired target, since one bad target can flag many sources at once.",
      "Re-crawl after both sides are fixed, because the check joins source and target facts from the same crawl.",
    ],
    verification: [
      "Run a new crawl and confirm the target is indexable with no canonical_points_to_non_indexable_page row for the source URL.",
      "Confirm the target status is under 400 and its robots value has no noindex on the same new crawl.",
    ],
    cautions: [
      "Only meta[name=robots] feeds this judgement; X-Robots-Tag headers are not read, so a header-only noindex on the target escapes this check.",
      "Fixing only the source canonical while the target stays non-indexable moves the contradiction rather than resolving it.",
    ],
    references: [
      {
        label: "Google Search Central: Consolidate duplicate URLs",
        url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
      },
      {
        label: "Google Search Central: Robots meta tags",
        url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
      },
    ],
    relatedIssueTypes: ["noindex_page", "client_error_status", "server_error_status", "canonical_differs"],
  },
  {
    issueType: "noindex_page",
    pillar: "seo",
    bucket: "indexability",
    title: "Page is marked noindex",
    summary:
      "The page carries a noindex robots directive, so it asks search engines to exclude it from results.",
    scope: "page",
    explanation: [
      "Noindex is the standard way to keep utility pages such as admin screens, thank-you pages, or staging copies out of search results. On a page that should attract search traffic, the same directive silently removes it from eligibility.",
      "Revserp flags pages whose lowercased meta[name=robots] content contains noindex. Only the HTML meta tag is read; X-Robots-Tag HTTP headers are not evaluated, so a header-only noindex never raises this row.",
      "This high-severity row is a statement of intent found in the markup, not a verdict that the directive is wrong. Many flagged pages are correctly excluded.",
    ],
    detection: [
      "Confirm the row, then inspect the meta[name=robots] tag in view-source for the noindex token, checking combined values such as noindex, nofollow together.",
      "Determine whether the directive is page-specific or template-wide by checking sibling pages; a global CMS toggle or staging setting often explains site-wide rows.",
      "Check whether production still serves the tag when a preview environment does not, since removing it only in preview leaves production flagged.",
    ],
    causes: [
      "A staging or development noindex was carried into production and never removed.",
      "A CMS checkbox or template condition marks the page or post type as excluded from search.",
      "A plugin or SEO tool applies a default noindex to archives, search results, or thin templates that also caught a page meant to be visible.",
    ],
    fixes: [
      "Remove the noindex directive when the page should be eligible for search results, keeping any needed nofollow as a separate decision.",
      "Fix the source setting rather than only the output: update the CMS field, template condition, or environment configuration that emits the tag.",
      "Confirm production HTML specifically, since preview-only fixes leave the crawled production markup unchanged.",
      "Leave intentional noindex directives in place on utility, duplicate, or private pages and acknowledge those rows instead.",
    ],
    verification: [
      "Run a new crawl and confirm the stored robots value has no noindex with no noindex_page row for the URL.",
      "Verify the production view-source, not only a staging preview, since the crawler reads the production-equivalent HTML.",
    ],
    cautions: [
      "Noindex is often intentional for admin, cart, thank-you, staging, or duplicate pages. Never remove it as a blanket fix without checking page purpose.",
      "Header-based X-Robots-Tag directives are invisible to this check; a page can be excluded in practice while this row stays clear.",
    ],
    example: {
      label: "Indexable robots value",
      code: "<meta name='robots' content='index, follow'>",
    },
    references: [
      {
        label: "Google Search Central: Robots meta tags",
        url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
      },
    ],
    relatedIssueTypes: ["nofollow_page", "canonical_points_to_non_indexable_page", "missing_canonical"],
  },
  {
    issueType: "nofollow_page",
    pillar: "seo",
    bucket: "indexability",
    title: "Page is marked nofollow",
    summary:
      "The page robots directive tells search engines not to follow its outgoing links.",
    scope: "page",
    explanation: [
      "A page-level nofollow asks crawlers not to follow any link on the page, which can strand the targets from discovery through this source. It does not block indexing of the page itself.",
      "Revserp flags pages whose lowercased meta[name=robots] content contains nofollow, on healthy HTML-like pages. As with noindex, only the HTML meta tag is read and X-Robots-Tag headers are ignored.",
      "Page-level nofollow differs from per-link rel=nofollow attributes. This row concerns the whole-page directive; individual annotated links are a separate editorial choice the detector does not evaluate.",
    ],
    detection: [
      "Confirm the row, then inspect the meta[name=robots] tag in view-source for the nofollow token, including combined values such as noindex, nofollow.",
      "Check whether the directive comes from a template default, a CMS toggle, or an SEO plugin preset applied to the page type.",
      "Compare with the outbound link rows: a page with no followed internal links out plus this row is doubly isolated as a link source.",
    ],
    causes: [
      "A template applies nofollow, noindex defaults to archives or untrusted sections and the scope crept onto editorial pages.",
      "An SEO tool preset marks generated or user-content pages nofollow without distinguishing internal navigation links.",
      "A staging configuration suppressing link-following was copied to production.",
    ],
    fixes: [
      "Remove the page-level nofollow when search engines should follow the page links, keeping per-link annotations for the specific untrusted links that need them.",
      "Prefer granular rel=nofollow or rel=sponsored on individual links over a whole-page directive when only some targets are untrusted.",
      "Fix the template or plugin preset that emits the directive so sibling pages are corrected together.",
      "Leave intentional page-level nofollow in place on untrusted or paid-link-heavy pages and acknowledge the row.",
    ],
    verification: [
      "Run a new crawl and confirm the stored robots value has no nofollow with no nofollow_page row for the URL.",
      "Re-check outbound internal link counts on the new crawl to confirm the page now contributes followed navigation.",
    ],
    cautions: [
      "Page-level nofollow can be intentional for login walls, untrusted listings, or transitional pages. Removing it everywhere without review can expose untrusted targets.",
      "This check never evaluates per-link rel attributes or HTTP headers; clearing this row does not audit those separately.",
    ],
    example: {
      label: "Followable robots value",
      code: "<meta name='robots' content='index, follow'>",
    },
    references: [
      {
        label: "Google Search Central: Robots meta tags",
        url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["noindex_page", "no_internal_links_out", "low_internal_links_out"],
  },
  {
    issueType: "missing_viewport",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page is missing a viewport meta tag",
    summary:
      "The page declares no viewport, so mobile browsers cannot scale and lay out the page correctly.",
    scope: "page",
    explanation: [
      "The viewport tag tells mobile browsers how wide the layout viewport should be and how to scale initial content. Without it, pages typically render at desktop width and force sideways scrolling and tiny text on phones.",
      "Revserp reads the first meta[name=viewport] content value and trims it. An empty value raises this high-severity row on healthy HTML-like pages, since mobile rendering affects most visitors.",
      "This is a purely technical markup check. It says nothing about whether the design is actually responsive; a page can carry the tag and still lay out badly.",
    ],
    detection: [
      "Confirm the row, then check view-source for a meta[name=viewport] element in the head. CMS editors rarely surface this tag, so the theme or base template is the usual suspect.",
      "Test the live page at a phone width to see the practical effect: desktop-width rendering with horizontal scrolling confirms the gap.",
      "Remember the tag must be in the parsed HTML; viewport settings applied only through JavaScript or headers do not satisfy the check.",
    ],
    causes: [
      "A custom theme or landing template omits the viewport element from its base layout.",
      "A legacy desktop-only template was reused for new pages without adding mobile markup.",
      "An optimisation pass accidentally removed the head element containing the viewport.",
    ],
    fixes: [
      "Add a viewport meta tag to the base template head so every page inherits it, using the standard width and initial-scale declaration.",
      "Apply the fix in the shared layout rather than page by page, since a missing tag usually affects the whole template.",
      "Verify the responsive CSS actually adapts at phone widths after adding the tag; the tag enables correct scaling but does not create a responsive design by itself.",
    ],
    verification: [
      "Run a new crawl and confirm the viewport is present with no missing_viewport row for the URL.",
      "Load the page at a mobile width and confirm content fits without horizontal scrolling.",
    ],
    cautions: [
      "The standard declaration is width=device-width with initial-scale=1. Constraining zoom with maximum-scale harms accessibility and should be avoided.",
      "Presence of the tag never proves good mobile usability; treat layout testing as the real verification.",
    ],
    example: {
      label: "Standard viewport declaration",
      code: "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    },
    references: [
      {
        label: "MDN: Viewport meta tag",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag",
      },
    ],
    relatedIssueTypes: ["missing_lang", "images_missing_dimensions", "too_many_images_on_page"],
  },
  {
    issueType: "missing_lang",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page is missing a language attribute",
    summary:
      "The root html element declares no language, so parsers and assistive technology must guess the page language.",
    scope: "page",
    explanation: [
      "The lang attribute declares the page primary language for screen readers, translation tools, and language-aware processing. Without it, pronunciation and hyphenation fall back to guesses.",
      "Revserp reads the lang attribute of the first html element and trims it. An empty value raises this medium-severity row on healthy HTML-like pages.",
      "This is a small, cheap fix with accessibility weight beyond any search snippet effect. It rarely changes rankings directly but improves how the page is consumed.",
    ],
    detection: [
      "Confirm the row, then inspect view-source for the opening html tag and its lang attribute.",
      "Check whether the CMS or theme exposes a language setting that was never configured, leaving the attribute blank across the site.",
      "For multilingual sites, confirm each locale template declares its own language rather than inheriting a single default.",
    ],
    causes: [
      "The base template hardcodes an html tag without a lang attribute.",
      "A custom theme ignores the CMS locale setting and never outputs it to the markup.",
      "Migrated static pages were copied without their original language declarations.",
    ],
    fixes: [
      "Add a lang attribute to the root html element with the page primary language code, wiring it to the CMS locale where one exists.",
      "Use correct subtags for regional variants where the content targets them, and mark inline passages in other languages separately.",
      "Apply the fix in the shared layout so all pages inherit it rather than editing page by page.",
    ],
    verification: [
      "Run a new crawl and confirm the lang value is present with no missing_lang row for the URL.",
      "Confirm the opening html tag in view-source carries the expected language code.",
    ],
    cautions: [
      "A wrong language code is worse than none for screen-reader pronunciation. Declare the language the content is actually written in.",
      "This row never evaluates whether mixed-language passages are individually marked; that remains separate editorial work.",
    ],
    example: {
      label: "Declared page language",
      code: "<html lang='en'>",
    },
    references: [
      {
        label: "MDN: lang global attribute",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang",
      },
      {
        label: "W3C: Declaring language in HTML",
        url: "https://www.w3.org/International/questions/qa-html-language-declarations",
      },
    ],
    relatedIssueTypes: ["missing_viewport", "missing_h1"],
  },
  {
    issueType: "fetch_failed",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page could not be fetched",
    summary:
      "The crawler could not retrieve the page at all, so no content checks were possible for it.",
    scope: "page",
    explanation: [
      "A fetch failure means the crawl never received a usable response: DNS problems, TLS errors, connection resets, bot protection, rate limiting, or a page with no status and no parsed content. The row details carry the capped error string up to 500 bytes as crawl-time evidence.",
      "Broken pages deliberately yield one status issue instead of the content set. A fetch failure therefore never appears alongside missing titles or thin-content rows for the same page in the same crawl.",
      "The error describes crawl conditions at crawl time. It is not a live diagnosis of the page today; the page may already work again.",
    ],
    detection: [
      "Read the capped error string in the row details for the immediate cause class, such as DNS, TLS, timeout, or blocked request.",
      "Check whether sibling pages failed together, which points at server, network, or protection issues rather than one bad URL.",
      "Reproduce carefully outside the crawl with the same URL spelling, since redirects, trailing slashes, and case differences can fetch differently by hand.",
    ],
    causes: [
      "DNS, TLS certificate, or hosting faults made the origin unreachable during the crawl window.",
      "Rate limiting, bot protection, or IP rules blocked the crawler specifically while browsers pass.",
      "The URL is stale or mistyped, or internal links point at a host or scheme that no longer serves content.",
    ],
    fixes: [
      "Make the URL reachable: repair DNS, TLS, and server faults, and allow legitimate crawler traffic through rate limits and bot rules.",
      "When the page no longer exists, remove internal links pointing to it instead of leaving dead references in navigation and content.",
      "Fix the linking sources identified by internal_links_to_broken_pages rows so other pages stop sending visitors and crawlers to the dead URL.",
      "Retry display text or preview rendering never substitutes for restoring reachability.",
    ],
    verification: [
      "Run a new crawl and confirm the URL fetches with a status code and no fetch_failed row.",
      "Old rows stay as history; clearance means the new crawl retrieved the page, not that an old error was edited away.",
    ],
    cautions: [
      "The stored error is crawl-time evidence, not proof the page is still broken. Verify against a new crawl rather than assuming persistence.",
      "Do not weaken approval controls, bot protection, or access policy merely to clear a crawl row; allow only legitimate measurement traffic deliberately.",
    ],
    references: [
      {
        label: "Google Search Central: HTTP status codes and network errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
      },
    ],
    relatedIssueTypes: ["client_error_status", "server_error_status", "internal_links_to_broken_pages", "soft_404"],
  },
  {
    issueType: "client_error_status",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page returned a client error",
    summary:
      "The page answered with a 4xx status, so the requested URL is refused or missing at crawl time.",
    scope: "page",
    explanation: [
      "A 4xx status means the server understood the request but would not serve content for it: the classic 404 for missing pages, 403 for forbidden areas, or 410 for deliberately removed content. The row details state the exact HTTP status from the stored crawl.",
      "Like other broken-page states, a client error yields one status issue with no content-issue set, since scoring absent content as thin or untitled would misdescribe a single underlying problem.",
      "The status is a persisted page-row fact from the crawl, not a live verdict. Content, redirects, and permissions may all have changed since.",
    ],
    detection: [
      "Read the exact status in the row details and confirm the same URL spelling, since neighbouring spellings can return different statuses.",
      "Check internal link sources and sitemaps that still reference the URL; lingering references keep sending visitors to the error.",
      "Distinguish deliberate removals, which should return 404 or 410, from accidental breakage caused by slug changes, case changes, or permission rules.",
    ],
    causes: [
      "The page was renamed, moved, or deleted without a redirect, leaving the old URL to 404.",
      "Permission or protection rules return 403 for paths the crawler is not allowed to read.",
      "A mistyped or outdated internal link targets a URL that never existed.",
    ],
    fixes: [
      "Fix the underlying client error so the page responds successfully when it should exist: restore, republish, or correct the path and permissions.",
      "Redirect permanently to the correct successor when the page moved, and remove or update internal links pointing at the old URL.",
      "Leave deliberate 404 or 410 responses in place for content that should stay gone, and clean up references to those URLs instead.",
      "Update sitemaps and navigation that list the erroring URL so discovery stops reinforcing it.",
    ],
    verification: [
      "Run a new crawl and confirm the status is under 400 with no client_error_status row for the URL.",
      "Confirm linking sources no longer target the erroring URL on the same new crawl.",
    ],
    cautions: [
      "A 4xx page that should stay removed is working correctly; clearing the row by redirecting everything to the homepage hides the removal rather than handling it.",
      "Crawl-time status never proves current live status. Verify removal or repair against the new crawl, not against memory of the old one.",
    ],
    references: [
      {
        label: "Google Search Central: HTTP status codes and network errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
      },
    ],
    relatedIssueTypes: ["server_error_status", "soft_404", "fetch_failed", "internal_links_to_broken_pages"],
  },
  {
    issueType: "server_error_status",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page returned a server error",
    summary:
      "The page answered with a 5xx status, so the server failed while trying to serve it.",
    scope: "page",
    explanation: [
      "A 5xx status means the request reached the server but the server could not complete it: application crashes, database outages, overloaded workers, or misconfigured proxies. Visitors and crawlers alike receive no usable page.",
      "The row details state the exact HTTP status from the stored crawl, and the page yields only this one status issue with no content set, since absent content cannot be meaningfully evaluated.",
      "Server errors are usually transient or load-dependent, so a single 5xx row may reflect a bad minute rather than a permanently broken page.",
    ],
    detection: [
      "Read the exact status in the row details and check whether sibling pages failed at the same crawl time, which points at infrastructure rather than one template.",
      "Correlate with deploy logs, error trackers, and resource graphs around the stored crawl timestamp before assuming a content cause.",
      "Reproduce with the same URL and headers where possible; intermittent 5xx faults often disappear on retry and reappear under load.",
    ],
    causes: [
      "Application exceptions, failed deploys, or database and dependency outages during the crawl window.",
      "Resource exhaustion or concurrency limits that fail some requests while others succeed.",
      "Proxy, cache, or function-timeout misconfiguration that converts slow successes into 5xx responses.",
    ],
    fixes: [
      "Fix the server error at its source: resolve the exception, restore the dependency, or correct the infrastructure configuration.",
      "Review capacity and timeouts when failures cluster under load rather than tracing to one code path.",
      "Re-run the affected crawl window after the fix rather than editing content, since no content edit addresses a serving failure.",
    ],
    verification: [
      "Run a new crawl and confirm the status is under 400 with no server_error_status row for the URL.",
      "Confirm the fix held across the whole crawl window, not only on a single manual refresh.",
    ],
    cautions: [
      "A single 5xx during an incident window may clear on the next crawl without any code change. Record what actually changed so verification states stay honest.",
      "Caching a friendly error page with a 200 status to hide 5xx faults creates a soft-404 problem instead; always preserve the real status.",
    ],
    references: [
      {
        label: "Google Search Central: HTTP status codes and network errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
      },
    ],
    relatedIssueTypes: ["client_error_status", "fetch_failed", "soft_404"],
  },
  {
    issueType: "soft_404",
    pillar: "seo",
    bucket: "technical_seo",
    title: "Page serves not-found content with a success status",
    summary:
      "The page answers 2xx but shows the site not-found message, so it looks like an error wearing a success code.",
    scope: "page",
    explanation: [
      "A soft 404 happens when a missing page returns HTTP 200 alongside not-found wording instead of a real 404 or 410. Search engines must then infer the page is gone, and the broken inbound link that led there stays hidden behind a success code.",
      "Revserp fingerprints the soft-404 response per crawl by requesting a random nonexistent URL under the crawl root. A 2xx page matches when its normalized title plus H1 equal the probe, or its visible-text hash is identical. The fallback heuristic flags 2xx pages with not-found wording in the title or H1 on pages with 120 or fewer visible words.",
      "Row details state the HTTP status and the soft-404 meaning. Like other broken states, the page yields this single issue with no content set.",
    ],
    detection: [
      "Read the status and meaning in the row details, then open the URL and check whether it shows the site not-found template while the network status reads 200.",
      "Compare the page title and H1 against the site genuine 404 page; matching wording plus a success status is the primary signal.",
      "Suspect fallback-heuristic matches on short pages whose titles mention 404, and verify the word count bound of 120 before concluding.",
    ],
    causes: [
      "The application renders its not-found template while keeping the default 200 status instead of setting 404 or 410.",
      "Single-page application routing serves the shell with status 200 for unknown paths and fills in a not-found message client-side.",
      "A catch-all route swallows unknown URLs into a normal page response rather than rejecting them.",
    ],
    fixes: [
      "Return a real 404 or 410 status for URLs that do not exist, keeping the helpful not-found body but setting the correct code.",
      "Configure the framework route, CDN rule, or server block that currently swallows unknown paths so it preserves the error status.",
      "Fix or remove the internal links that point at the nonexistent URL so visitors stop reaching the dead end.",
      "Do not merely rewrite the not-found wording while still answering 200; the page stays a soft 404 and the broken inbound link stays hidden.",
    ],
    verification: [
      "Run a new crawl and confirm the nonexistent URL returns 404 or 410 with no soft_404 row.",
      "Check the network status code directly rather than the visible wording, since wording alone never determines the outcome.",
    ],
    cautions: [
      "Articles legitimately about 404 errors are protected by the 120-word bound, and sites answering unknown URLs with the homepage are deliberately not fingerprinted as soft 404s; a catch-all homepage is a separate problem.",
      "Masking the wording without fixing the status hides the signal from readers while keeping it for parsers. Always fix the code first.",
    ],
    references: [
      {
        label: "Google Search Central: Soft 404 errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/soft-404-errors",
      },
      {
        label: "Google Search Central: HTTP status codes and network errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
      },
    ],
    relatedIssueTypes: ["client_error_status", "fetch_failed", "internal_links_to_broken_pages", "near_empty_visible_content"],
  },
  {
    issueType: "images_missing_alt",
    pillar: "seo",
    bucket: "media_optimization",
    title: "Images are missing alt text",
    summary:
      "At least one image on the page has no usable alt text, so its meaning is unavailable to assistive technology and text-based evaluation.",
    scope: "page",
    explanation: [
      "Alt text is the textual substitute for an image: screen readers announce it, and text-based parsers use it when they cannot see pixels. An image without alt text contributes layout weight with no communicated meaning.",
      "Revserp counts every img in the full document, including header and footer images, and flags when the missing count is above zero. An empty alt value counts as missing, which means decorative images using alt='' still flag and must be knowingly accepted when that is the intent.",
      "Row evidence is the stored missing-alt count. Per-image alt presence can be corroborated through content image blocks, which show alt text and URLs per image.",
    ],
    detection: [
      "Confirm the missing-alt count for the URL, then review images in the article, header, and footer rather than the article alone, since the counter covers the whole document.",
      "Search view-source for img tags without an alt attribute and for alt='' values, separating meaningful images that need descriptions from genuinely decorative ones.",
      "Check CMS image fields and templates that strip alt text on resize or lazy-load rewrites.",
    ],
    causes: [
      "Editors upload images without filling the alt field, and the template outputs no attribute at all.",
      "Theme and footer images such as logos, icons, and badges were never given text equivalents.",
      "An optimisation or lazy-load rewrite drops the original alt attribute when replacing the img markup.",
    ],
    fixes: [
      "Add descriptive alt text to meaningful images, stating what the image shows or what it does as a control in concise plain words.",
      "Keep decorative images marked alt='' only when the flag is knowingly accepted as intentional, since empty values still count toward it.",
      "Fix the template and CMS defaults so alt text survives resizing, lazy loading, and CDN rewrites.",
      "Prioritise unique informative images in the main content over repeated chrome icons when working through a large count.",
    ],
    verification: [
      "Run a new crawl and confirm the missing-alt count is 0 with no images_missing_alt row for the URL.",
      "Spot-check view-source that each meaningful img now carries a non-empty alt value.",
    ],
    cautions: [
      "Empty alt on decorative images is correct accessibility practice even though it still flags here. Accept those rows deliberately rather than writing misleading descriptions.",
      "Keyword-stuffed alt text harms screen-reader users. Describe the image, not the marketing message.",
    ],
    example: {
      label: "Descriptive alt text",
      code: "<img src='drain-camera.jpg' alt='Engineer feeding a camera into an open drain' width='800' height='600'>",
    },
    references: [
      {
        label: "Google Search Central: Image SEO best practices",
        url: "https://developers.google.com/search/docs/appearance/google-images",
      },
      {
        label: "MDN: The img element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img",
      },
    ],
    relatedIssueTypes: ["images_missing_dimensions", "too_many_images_on_page", "near_empty_visible_content"],
  },
  {
    issueType: "images_missing_dimensions",
    pillar: "seo",
    bucket: "media_optimization",
    title: "Images are missing dimensions",
    summary:
      "At least one image lacks an explicit width or height, so the browser cannot reserve layout space before it loads.",
    scope: "page",
    explanation: [
      "Without known dimensions, the browser lays out text first and then shoves content aside when each image arrives. That visible jump, called layout shift, is annoying for readers and measurable as instability.",
      "Revserp counts every img in the full document and flags when any image has an empty width or an empty height attribute. Either dimension missing is enough; both must be present to satisfy the check.",
      "Image counts include header and footer images, so icons and badges added by the theme count alongside article photography.",
    ],
    detection: [
      "Confirm the missing-dimensions count for the URL, then search view-source for img tags lacking width or height attributes.",
      "Check responsive images specifically: srcset and sizes control selection but do not replace the width and height attributes the counter reads.",
      "Look for CMS, lazy-load, or CDN rewrites that strip dimensions while replacing markup.",
    ],
    causes: [
      "Editors insert images without dimensions and the CMS outputs bare img tags.",
      "A lazy-load or optimisation plugin rewrites image markup and drops the original attributes.",
      "Theme icons and footer badges were added as dimension-less images outside the editorial flow.",
    ],
    fixes: [
      "Set explicit width and height attributes reflecting the intrinsic image size where possible, letting CSS scale responsively from that aspect ratio.",
      "Fix the image component or plugin so dimensions survive lazy loading, srcset generation, and CDN rewriting.",
      "Cover theme and footer images as well as article images, since the counter reads the whole document.",
      "Use aspect-ratio CSS as a complement for responsive behaviour, not as a substitute for the attributes this check reads.",
    ],
    verification: [
      "Run a new crawl and confirm the missing-dimensions count is 0 with no images_missing_dimensions row for the URL.",
      "Reload with images uncached and confirm content no longer jumps as images arrive.",
    ],
    cautions: [
      "Attributes must reflect the true aspect ratio; invented dimensions that distort the reservation are worse than none.",
      "This row measures attribute presence, not rendering performance. Keep image byte sizes and formats as separate optimisation work.",
    ],
    example: {
      label: "Image with reserved dimensions",
      code: "<img src='team-van.jpg' alt='Branded repair van parked outside a house' width='800' height='600'>",
    },
    references: [
      {
        label: "web.dev: Optimize Cumulative Layout Shift",
        url: "https://web.dev/articles/cls",
      },
      {
        label: "MDN: The img element",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img",
      },
    ],
    relatedIssueTypes: ["images_missing_alt", "too_many_images_on_page", "missing_viewport"],
  },
  {
    issueType: "too_many_images_on_page",
    pillar: "seo",
    bucket: "media_optimization",
    title: "Page may have too many images for its content",
    summary:
      "The page carries 10 or more images with fewer than 50 words of text per image, so visuals outweigh explanation.",
    scope: "page",
    explanation: [
      "Image-heavy pages with little supporting text ask a lot of readers: slow loads, long scrolls, and minimal explanation of what each visual adds. Galleries can justify the ratio; undifferentiated stock photography usually cannot.",
      "Revserp flags pages with an image count of 10 or more when the word count is 0 or below, or when integer words-per-image falls under 50. The row details state the image count, the word count, and the 50-words-per-image threshold for the calculation.",
      "Both counters come from crawl-time facts: image count covers the full document including header and footer, while word count is cleaned visible text with boilerplate stripped.",
    ],
    detection: [
      "Read the image and word counts plus the threshold in the row details to see how far the ratio falls short.",
      "Inventory which images carry meaning versus decoration, and whether header, footer, and icon images inflate the count past 10 on their own.",
      "Check whether the word count is genuinely low or undercounted through JavaScript rendering gaps before deciding the images are the problem.",
    ],
    causes: [
      "Galleries, sliders, and before-and-after sets accumulate images without accompanying explanations.",
      "Stock photography and badge rows decorate thin copy instead of illustrating specific points.",
      "Theme chrome contributes icons and promotional images that push an otherwise balanced article over the image gate.",
    ],
    fixes: [
      "Remove unnecessary images or add supporting content so the ratio reaches at least 50 words per image or the count drops below 10.",
      "Give remaining images distinct jobs: each should illustrate a point the text makes, with captions or alt text where they add meaning.",
      "Move purely decorative imagery to CSS backgrounds where appropriate so content images reflect real illustration.",
      "Do not hide images with CSS to dodge the count; the parser still counts hidden images.",
    ],
    verification: [
      "Run a new crawl and confirm the ratio is at or above 50 words per image, or the image count is below 10, with no too_many_images_on_page row.",
      "Read the trimmed page to confirm every remaining image earns its place beside the text.",
    ],
    cautions: [
      "Legitimate galleries may accept this row intentionally. The threshold is a Revserp editorial gate, not a rule that galleries are harmful.",
      "Hiding images with display rules is explicitly not a fix since the parser counts them regardless.",
    ],
    references: [
      {
        label: "Google Search Central: Image SEO best practices",
        url: "https://developers.google.com/search/docs/appearance/google-images",
      },
      {
        label: "web.dev: Optimize Cumulative Layout Shift",
        url: "https://web.dev/articles/cls",
      },
    ],
    relatedIssueTypes: ["images_missing_alt", "images_missing_dimensions", "thin_content"],
  },
  {
    issueType: "no_internal_links_out",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page has no internal links out",
    summary:
      "The page links to no other internal page, so readers and crawlers reaching it find no onward path.",
    scope: "page",
    explanation: [
      "Outbound internal links are the onward journey: related guides, services, and contact routes a reader can follow next. A page with none is a dead end that also passes no discovery path deeper into the site.",
      "Revserp counts deduped distinct internal target URLs per source page, excluding self-links where source equals target. A count of 0 raises this medium-severity row, while counts of 1 or 2 raise the milder low_internal_links_out row instead.",
      "The count covers every stored internal link row with no status filter, so targets the crawl never fetched still count; only empty URLs and self-links are excluded.",
    ],
    detection: [
      "Confirm the zero outbound count for the URL, then read the page looking for navigation, related-links blocks, and in-content references that should exist.",
      "Check whether links present are external-only, anchor-only, or self-links to the same URL, since none of those count as internal outbound targets.",
      "Inspect templates that strip sidebars or related-content blocks on certain page types, leaving the article body link-free.",
    ],
    causes: [
      "Thin or placeholder pages were published without related links or calls to action.",
      "A landing template omits navigation, related content, and footer links for design reasons.",
      "All outbound references point externally or back at the same page, contributing nothing to the distinct internal count.",
    ],
    fixes: [
      "Add relevant internal links to other important pages: related guides, parent services, and the natural next step for the reader.",
      "Place links contextually in the body where they continue the task, not only in a generic link dump at the foot.",
      "Link with descriptive anchor text that states the destination intent rather than bare click here phrasing.",
      "Cover the template when the gap is systematic so sibling pages gain onward paths together.",
    ],
    verification: [
      "Run a new crawl and confirm the outbound distinct count is above 0 with no no_internal_links_out row for the URL.",
      "Follow the new links as a reader to confirm they resolve to useful destinations rather than redirects or errors.",
    ],
    cautions: [
      "Relevance outranks quantity. Stuffing unrelated links to clear the counter harms readers without helping discovery.",
      "External links never satisfy this check; only distinct internal targets move the counter.",
    ],
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["low_internal_links_out", "orphan_like_page", "low_internal_links_in", "nofollow_page"],
  },
  {
    issueType: "low_internal_links_out",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page has few internal links out",
    summary:
      "The page links to only 1 or 2 other internal pages, so its onward paths are thin.",
    scope: "page",
    explanation: [
      "One or two outbound links give readers a narrow choice of next steps and offer crawlers few discovery routes from the page. More connected pages distribute attention across the site more effectively.",
      "Revserp raises this low-severity row when the deduped distinct internal target count is 1 or 2, with the count stated in the row details. Zero targets raise no_internal_links_out instead, and 3 or more clear both rows.",
      "Self-links are excluded but every other stored internal target counts, including targets the crawl never fetched, so the number reflects distinct linked destinations regardless of their status.",
    ],
    detection: [
      "Read the stated count in the row details and list the current outbound targets to see what is already covered.",
      "Check whether obvious continuations are missing: parent service, sibling topics, pricing, contact, or supporting guides.",
      "Compare with well-connected sibling pages to calibrate how many contextual links this page type normally carries.",
    ],
    causes: [
      "Short articles link once to their parent and stop, without referencing sibling topics.",
      "Related-content blocks are absent or limited to a single slot on the template.",
      "Authors link sparingly from habit, treating links as interruptions rather than continuations.",
    ],
    fixes: [
      "Add relevant internal links until the page offers more than 2 distinct internal destinations, choosing targets that continue the reader task.",
      "Weave links into the body copy at the point of need rather than appending an unrelated list.",
      "Use descriptive anchors naming the destination intent so each link earns its place for scanners.",
      "Avoid padding with tangential links; two genuinely useful links beat five decorative ones even when the row persists a little longer.",
    ],
    verification: [
      "Run a new crawl and confirm the outbound distinct count is above 2 with no low_internal_links_out row for the URL.",
      "Confirm each added link resolves successfully rather than pointing at redirects or broken targets.",
    ],
    cautions: [
      "This is a low-severity nudge, not a quota. Forcing irrelevant links to pass the threshold of 3 harms readers more than the row ever did.",
      "A link to a target the crawl never fetches still counts here on the next crawl; only the broken-target (status 400 or above) and redirect-target (status 300 to 399) checks depend on resolved target statuses.",
    ],
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["no_internal_links_out", "internal_links_to_redirects", "internal_links_to_broken_pages"],
  },
  {
    issueType: "orphan_like_page",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page appears orphan-like",
    summary:
      "No discovered internal page links to this page, so it is unreachable by following site links from the crawl root.",
    scope: "page",
    explanation: [
      "Inbound internal links are how pages get found: navigation, hub pages, and contextual references that lead readers inward. With zero inbound sources, a page depends entirely on direct visits, sitemaps, or external links.",
      "Revserp raises this high-severity row when crawl depth is above 0 and the distinct inbound internal source count is 0. The homepage at depth 0 never flags, since it is the discovery root by definition.",
      "Counts are deduped distinct source URLs with self-links excluded and no status filter, so every stored internal reference from another page counts, even when the target was never fetched.",
    ],
    detection: [
      "Confirm the zero inbound count for the URL and its depth, then check navigation menus, hub pages, and related-links blocks that should reference it.",
      "Search the site for the URL or its title to find unlinked mentions that name the page without linking it.",
      "Check whether the only references are external or self-links, since neither counts as an inbound internal source.",
    ],
    causes: [
      "The page was published without adding it to navigation, hub pages, or related content on sibling pages.",
      "A campaign or seasonal page lives outside the information architecture with only paid or social traffic pointing at it.",
      "A redesign dropped the linking hub that used to reference the page, stranding it silently.",
    ],
    fixes: [
      "Link to the page from relevant navigation, hub, or contextual sources where a reader would naturally look for it.",
      "Add contextual references from sibling articles and parent services, not only a footer link that scanners overlook.",
      "Review the site structure so the page sits within a discoverable path from the homepage rather than floating detached.",
      "Do not rely on external or self links to resolve this; only inbound internal sources move the counter.",
    ],
    verification: [
      "Run a new crawl and confirm the inbound distinct count is above 0 with no orphan_like_page row for the URL.",
      "Trace a click path from the homepage to the page to confirm a human can now reach it by following links.",
    ],
    cautions: [
      "Sitemap entries and external links help discovery but never satisfy this check. The row measures internal link graph connectivity specifically.",
      "Deliberately unlinked utility pages may accept the row intentionally; acknowledge rather than distorting navigation to link pages nobody needs.",
    ],
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["low_internal_links_in", "very_deep_page", "no_internal_links_out"],
  },
  {
    issueType: "low_internal_links_in",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page has few internal links in",
    summary:
      "Only 1 or 2 internal pages link to this page, so its discovery paths are narrow.",
    scope: "page",
    explanation: [
      "Pages with a single inbound reference hang by one thread: remove or redesign that source and the target drifts toward orphan status. Broader inbound support makes discovery resilient.",
      "Revserp raises this medium-severity row when depth is above 0 and distinct inbound internal sources number 1 or 2, stating the count in the row details. Zero inbound raises orphan_like_page instead, and depth-0 homepages never flag.",
      "Sources are deduped distinct URLs with self-links excluded, so repeated links from one page still count once.",
    ],
    detection: [
      "Read the stated inbound count in the row details and identify the current linking sources.",
      "Check whether parent hubs, sibling articles, and navigation omit the page where a reader would expect it.",
      "Assess the fragility: when the only source is a footer, a campaign block, or a soon-to-retire page, the link graph is thinner than the number suggests.",
    ],
    causes: [
      "The page is linked once from its parent but never referenced contextually from siblings.",
      "New pages were announced in one post and never woven into evergreen hubs.",
      "Navigation limits or template sidebars restrict how many pages can surface the target.",
    ],
    fixes: [
      "Add more inbound internal links from relevant hubs, parents, and sibling content until the distinct source count exceeds 2.",
      "Choose sources a reader would genuinely follow from, placing contextual links at the point of need.",
      "Strengthen hub pages so they index their whole topic cluster rather than a favoured subset.",
      "Avoid link-exchange style stuffing; sources should be topically relevant, not merely numerous.",
    ],
    verification: [
      "Run a new crawl and confirm the inbound distinct count is above 2 with no low_internal_links_in row for the URL.",
      "Confirm the new sources are themselves reachable pages rather than redirects or errors.",
    ],
    cautions: [
      "Depth-0 homepages never flag here regardless of inbound count, since they are the crawl root rather than a discovery target.",
      "Counts reflect stored internal link rows with no status filter, so a reference from another page counts even when the target itself was never fetched.",
    ],
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["orphan_like_page", "very_deep_page", "low_internal_links_out"],
  },
  {
    issueType: "very_deep_page",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page is very deep in the crawl",
    summary:
      "The page was discovered at crawl depth 4 or more, so reaching it takes many link hops from the homepage.",
    scope: "page",
    explanation: [
      "Depth measures link distance from the crawl root: each followed internal link adds one level. Deep pages require persistent clicking to reach, and each hop dilutes the attention flowing inward.",
      "Revserp flags pages discovered at depth 4 or more and states the crawl depth in the row details. Depth is discovery depth through the followed link graph, not the number of URL path segments, so a short URL can still be deep and a long URL can be shallow.",
      "Depth depends on crawl order and link choices during that crawl, so the same page can measure differently across crawls when paths change.",
    ],
    detection: [
      "Read the stated depth in the row details and trace the click path from the homepage to see where the hops accumulate.",
      "Check whether the page sits behind paginated archives, faceted filters, or chains of category pages that each add a level.",
      "Distinguish URL length from link distance: shortening the slug alone never changes this number, since depth comes from link hops.",
    ],
    causes: [
      "The page is reachable only through multi-level category, archive, or pagination chains with no shortcut links.",
      "Hub and navigation pages omit direct references, forcing travel through intermediate listings.",
      "New sections were grafted onto old navigation without adding top-level entry points.",
    ],
    fixes: [
      "Link from stronger parent, hub, or navigation pages to reduce the hop count, giving the page a shorter discovered path.",
      "Add contextual shortcuts from high-traffic siblings where readers would naturally jump across levels.",
      "Flatten category chains that force every leaf through three listing layers before reaching content.",
      "Do not shorten the URL slug as the fix; depth responds to link distance, not to slug length.",
    ],
    verification: [
      "Run a new crawl and confirm the discovered depth is under 4 with no very_deep_page row for the URL.",
      "Count the clicks on the new shortest path from the homepage to confirm a human feels the improvement.",
    ],
    cautions: [
      "Depth is crawl-path dependent and can shift between crawls as link graphs change. Verify improvement on the new crawl rather than assuming permanence.",
      "Some deep archives are structurally fine; flatten only where readers genuinely benefit rather than rewiring the whole taxonomy for one row.",
    ],
    references: [
      {
        label: "Google Search Central: SEO starter guide",
        url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["orphan_like_page", "low_internal_links_in", "no_internal_links_out"],
  },
  {
    issueType: "internal_links_to_broken_pages",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page links to broken internal targets",
    summary:
      "The page contains internal links pointing at targets that return 4xx or 5xx or could not be fetched.",
    scope: "page",
    explanation: [
      "Every link is a promise that the destination exists. Links to broken targets send readers to error pages and waste crawl effort on URLs that cannot succeed.",
      "Revserp flags source pages with at least one internal target whose resolved status is 400 or above, listing up to 3 targets plus an and N more suffix in the row details. Targets are deduped and self-links excluded; unresolved targets never flag.",
      "The row belongs to the linking source page, not the broken target. Fixing the target repairs the destination, but the source row clears only when its links no longer point at broken URLs.",
    ],
    detection: [
      "Read the listed broken targets in the row details and open each to confirm the error status.",
      "Find the linking markup in the source page to see whether the links sit in body content, navigation, or footer includes that repeat across many pages.",
      "Check whether the targets moved, were deleted, or suffer permission faults, since each cause leads to a different repair.",
    ],
    causes: [
      "Target pages were renamed, moved, or deleted without updating the pages that reference them.",
      "Internal links were typed with wrong slugs, case, or trailing characters that resolve to missing URLs.",
      "Targets broke through server faults or permission changes after the links were written.",
    ],
    fixes: [
      "Update or remove links pointing at broken targets, pointing each at the correct live successor where one exists.",
      "Fix or redirect the target itself when it should exist, then confirm the source links resolve to it.",
      "Repair shared includes first when navigation or footer links repeat the same broken target across many sources.",
      "Remove references to deliberately deleted content rather than redirecting everything to the homepage.",
    ],
    verification: [
      "Run a new crawl and confirm no broken-target row remains for the source page.",
      "Confirm each formerly broken target now returns success or is no longer linked from the source on the same new crawl.",
    ],
    cautions: [
      "Redirecting every broken link to the homepage hides the breakage instead of repairing intent. Choose the genuine successor or remove the link.",
      "Statuses resolve after the crawl loop, so targets fetched late in the window still attribute correctly; verify against the new crawl rather than mid-crawl states.",
    ],
    references: [
      {
        label: "Google Search Central: HTTP status codes and network errors",
        url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["internal_links_to_redirects", "client_error_status", "server_error_status", "fetch_failed", "no_internal_links_out"],
  },
  {
    issueType: "internal_links_to_redirects",
    pillar: "seo",
    bucket: "internal_linking",
    title: "Page links to redirecting internal targets",
    summary:
      "The page links to internal URLs that redirect elsewhere, adding an extra hop to every follow.",
    scope: "page",
    explanation: [
      "Redirected links still reach their destination, but each hop costs time and attention: readers wait through the chain and crawlers spend extra requests per target. Direct links skip the detour.",
      "Revserp flags source pages with at least one internal target whose resolved status falls in 300 to 399, with the same up-to-3 plus and N more details truncation as broken-target rows. Self-links are excluded and unresolved targets never flag.",
      "This is a medium-severity hygiene signal rather than an emergency. The destinations work; the references are merely stale.",
    ],
    detection: [
      "Read the listed redirecting targets in the row details and follow each to record the final destination URL.",
      "Check whether the redirects come from slug changes, trailing-slash conventions, or http-to-https upgrades that left old spellings in link markup.",
      "Look for shared navigation or footer includes repeating one stale target across many source rows.",
    ],
    causes: [
      "Pages moved to new slugs while existing links kept pointing at the old URLs.",
      "Site-wide canonical spelling changed, such as trailing-slash or https conventions, without updating link markup.",
      "Campaign or short URLs that redirect were used as permanent references in evergreen content.",
    ],
    fixes: [
      "Point links directly at the final destination URL, replacing each redirecting href with the resolved target.",
      "Fix shared includes and templates first so one edit clears the same stale target across many sources.",
      "Update the authoring habit: copy destination URLs from the live page address rather than from memory or old drafts.",
      "Leave deliberate redirect patterns such as campaign short links alone where the indirection is the point, and acknowledge those rows.",
    ],
    verification: [
      "Run a new crawl and confirm no redirect-target row remains for the source page.",
      "Follow the updated links to confirm each lands directly without an intermediate redirect status.",
    ],
    cautions: [
      "Leaving the chain because the destination renders keeps the extra hop permanently. Rendering is not the same as linking well.",
      "Redirect targets can chain or change over time; verify against final destinations on the new crawl rather than cached expectations.",
    ],
    references: [
      {
        label: "Google Search Central: Redirects and Google Search",
        url: "https://developers.google.com/search/docs/crawling-indexing/301-redirects",
      },
      {
        label: "Google Search Central: Crawlable links",
        url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
      },
    ],
    relatedIssueTypes: ["internal_links_to_broken_pages", "low_internal_links_out", "canonical_differs"],
  },
];
