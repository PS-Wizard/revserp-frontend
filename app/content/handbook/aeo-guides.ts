import type { HandbookGuide } from './handbook-types';

export const aeoHandbookGuides: HandbookGuide[] = [
  {
    issueType: 'missing_structured_data',
    pillar: 'aeo',
    bucket: 'answerability',
    title: 'Page has no structured data',
    summary:
      'The page exposes no JSON-LD structured data, so answer engines must guess what the content is instead of reading a labeled description of it.',
    scope: 'page',
    explanation: [
      'Structured data is a small block of JSON-LD in the page that labels the content with a vocabulary from schema.org, for example marking a page as an Article with a headline, author, and publication date.',
      'Search and answer engines use these labels to understand the page precisely and to consider it for rich results, citations, and direct answers. Without them the page is plain text that machines must interpret on their own.',
      'This check only looks at JSON-LD script blocks. Other formats such as Microdata or RDFa do not satisfy it, because the crawler collects JSON-LD only.',
      'Adding structured data does not guarantee rich results, citations, or better placement. It makes the page eligible to be understood correctly, which is a precondition, not a reward.',
    ],
    detection: [
      'The detector reads the stored JSON-LD bytes for the page and flags the page when they are empty, the literal value null, or an empty array [].',
      'This is a raw-bytes check only. Malformed JSON still counts as present, so a page with broken JSON-LD does not raise this flag; it usually raises schema_missing_core_fields instead.',
      'The check runs on every healthy HTML-like page, not only on articles. A product page, homepage, or contact page with no JSON-LD at all is flagged the same way.',
    ],
    causes: [
      'The site template never included a JSON-LD block, which is common on older themes, hand-built pages, or pages assembled outside the main CMS.',
      'An SEO plugin or theme setting that outputs schema markup is disabled, misconfigured, or only enabled for some post types.',
      'The JSON-LD block is injected by JavaScript after load. The crawler stores the served markup, so client-side-only markup is invisible to this check.',
      'A deployment or caching change stripped script tags from the served HTML.',
    ],
    fixes: [
      'Confirm what the page actually is (article, product, FAQ, local business, organization) before choosing a schema type; the type must describe the real content.',
      'Add one JSON-LD block to the page with the matching schema.org type and the identity fields the core-fields check looks for: a non-empty name plus a url or description on the same node.',
      'Keep the markup consistent with the visible page. The headline, author, and dates in the JSON-LD should match what a reader sees.',
      'If the site uses a CMS plugin for schema output, enable it for this page type and confirm the block appears in the served HTML source, not only in a preview.',
    ],
    verification: [
      'A new crawl must store JSON-LD for the page and stop emitting this issue type for the URL. Old rows stay as history; only a fresh crawl clears the flag.',
      'Check the live page with view-source and confirm a script tag of type application/ld+json is present in the served HTML.',
      'Validate the block with the Schema Markup Validator or the Google Rich Results Test to catch syntax errors before the next crawl.',
    ],
    cautions: [
      'Do not copy markup from another page and leave its headline, URL, or dates in place. Mismatched markup misdescribes the page.',
      'Do not add markup for content the page does not have, such as FAQPage schema on a page with no questions. Markup that does not reflect visible content can make the page ineligible for rich results.',
      'The page content viewer in reporting tools never shows script contents, so an empty content view does not prove JSON-LD is missing. Always check view-source or the CMS schema view.',
    ],
    example: {
      label: 'Minimal Article JSON-LD with identity fields',
      code: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to service a hub bearing",
  "name": "How to service a hub bearing",
  "url": "https://example.com/guides/service-hub-bearing/",
  "description": "Step-by-step guide to inspecting and servicing a hub bearing.",
  "author": { "@type": "Person", "name": "Ada Nowak" }
}`,
    },
    references: [
      { label: 'Google: Understand how structured data works', url: 'https://developers.google.com/search/docs/appearance/structured-data/intro' },
      { label: 'schema.org: Article', url: 'https://schema.org/Article' },
      { label: 'Schema Markup Validator', url: 'https://validator.schema.org/' },
    ],
    relatedIssueTypes: ['generic_structured_data_only', 'schema_missing_core_fields', 'article_missing_article_schema'],
  },
  {
    issueType: 'generic_structured_data_only',
    pillar: 'aeo',
    bucket: 'answerability',
    title: 'Structured data uses only generic types',
    summary:
      'The page has JSON-LD, but every type it declares is generic (such as WebPage or Thing), so the markup says almost nothing about what the page actually contains.',
    scope: 'page',
    explanation: [
      'Schema.org has a hierarchy of types. Generic types like Thing, WebPage, CollectionPage, and ItemPage describe almost any page, while specific types like Article, Product, FAQPage, or LocalBusiness say what the page really is.',
      'When a page declares only generic types, answer engines learn nothing they could not already infer from the URL. The markup exists but carries no useful signal.',
      'Specific types also unlock specific fields: an Article can carry an author and publication date, a Product can carry offers and reviews. Generic types have no such fields, so the page cannot express its most useful facts.',
      'This flag means the markup is vague, not absent. Replacing or supplementing the generic type with the specific type that matches the page purpose resolves it.',
    ],
    detection: [
      'The detector collects every @type value in the stored JSON-LD, walking nested objects, arrays, @graph entries, and JSON strings that embed further JSON.',
      'It flags the page when at least one type exists and every collected type is one of Thing, WebPage, CollectionPage, or ItemPage.',
      'Pages with no JSON-LD at all are not flagged here; they raise missing_structured_data instead. Pages whose JSON parses to nothing also escape this flag, because no type names are collected.',
    ],
    causes: [
      'A theme or SEO plugin emits a default WebPage block on every page and nothing more specific was ever configured.',
      'A developer added a placeholder schema block during setup and never replaced it with the real type.',
      'A page redesign changed the page purpose (for example a plain page became a guide) without updating the markup.',
    ],
    fixes: [
      'Identify the single most accurate specific type for the page: Article or BlogPosting for editorial content, Product for product pages, FAQPage for question-and-answer pages, and so on.',
      'Add the specific type alongside or in place of the generic block, with the fields that type supports (author and date for articles, questions and answers for FAQs).',
      'Leave the generic WebPage node in place if the setup uses it as a wrapper; the flag clears as soon as at least one non-generic type is present.',
      'Re-check that the specific markup matches visible content before the next crawl.',
    ],
    verification: [
      'A new crawl must collect at least one non-generic @type from the page JSON-LD and stop emitting this issue type for the URL.',
      'Confirm with view-source that the specific type string appears in the served JSON-LD block.',
      'Run the block through the Schema Markup Validator to confirm the type name is spelled correctly; a typo creates an unknown type rather than clearing the flag.',
    ],
    cautions: [
      'Do not stack several specific types hoping one fits. Markup should describe the page as it is, not cover every possibility.',
      'A misspelled type (for example Artical) is treated as a distinct unknown string, which does clear this particular flag but leaves broken markup. Spell type names exactly as schema.org defines them.',
      'This check reads stored JSON-LD bytes, which reporting content views never display. Do not conclude anything about schema types from a content preview.',
    ],
    example: {
      label: 'Replacing a generic-only block with a specific type',
      code: `{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Torque settings for alloy stems",
  "name": "Torque settings for alloy stems",
  "url": "https://example.com/blog/torque-settings-alloy-stems/",
  "author": { "@type": "Person", "name": "Ada Nowak" }
}`,
    },
    references: [
      { label: 'Google: Understand how structured data works', url: 'https://developers.google.com/search/docs/appearance/structured-data/intro' },
      { label: 'schema.org full type hierarchy', url: 'https://schema.org/docs/schemas.html' },
    ],
    relatedIssueTypes: ['missing_structured_data', 'schema_missing_core_fields', 'article_missing_article_schema'],
  },
  {
    issueType: 'schema_missing_core_fields',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Structured data is missing core identity fields',
    summary:
      'The page has JSON-LD, but no single node carries the basic identity fields together: a non-empty name plus a url or description on the same node.',
    scope: 'page',
    explanation: [
      'Identity fields tell an answer engine which real-world thing a schema node describes. A name plus a URL or description is the minimum that lets a machine distinguish this article, business, or product from every other one.',
      'The fields must sit on the same node. A name on the Article node and a URL on a separate WebPage node does not satisfy the check, because no one node is fully identified.',
      'A field counts as present when it is a non-empty string, an array containing a content entry, or any non-empty object. Note that any non-empty object counts, even one like {"@type": "Person"} with no name inside, because the detector treats every non-empty map as content.',
      'Malformed JSON-LD usually surfaces here rather than as missing_structured_data: unparseable markup yields no qualifying node, so the page is flagged for missing fields.',
    ],
    detection: [
      'The detector parses the stored JSON-LD and walks nested objects, arrays, and embedded JSON strings looking for one node with non-empty name and non-empty url or description together.',
      'If parsing fails entirely, the page is flagged, since no qualifying node can be found.',
      'Single-field nodes do not combine: name on one node plus description on another still flags the page.',
    ],
    causes: [
      'A minimal schema template emits only @type and @context with no descriptive fields filled in.',
      'A plugin outputs author or publisher as a bare object with only @type and no name, which can still count as a field value but leaves the node itself unnamed.',
      'The descriptive fields live on different nodes after a plugin update split the markup into separate blocks.',
      'The JSON-LD is syntactically broken, so the parser finds no nodes at all.',
    ],
    fixes: [
      'Open the served JSON-LD block in view-source and find the node that best describes the page (the Article, Product, or Organization node).',
      'Add a name to that node if it lacks one, plus the page URL as url or a one-to-two sentence description matching the visible page.',
      'If the name and URL sit on different nodes, move or duplicate them so one node carries both.',
      'Validate the edited block with the Schema Markup Validator so a syntax error does not silently keep the flag alive.',
    ],
    verification: [
      'A new crawl must find at least one node with name plus url or description together and stop emitting this issue type for the URL.',
      'Confirm in view-source that the fields are inside the same JSON object, not merely present somewhere in the block.',
      'The reporting content view never shows scripts, so verify through view-source or the CMS schema view rather than the content preview.',
    ],
    cautions: [
      'Do not paste the same name and URL into every node. Each node should carry the identity of the thing it describes.',
      'A bare object such as {"@type": "Person"} counts as a non-empty field value to this detector, but it is weak markup for real consumers. Prefer a named entity with an actual name.',
      'Keep the description truthful and matching the page. Markup text that contradicts the visible page undermines trust rather than building it.',
    ],
    example: {
      label: 'One node carrying name plus url and description',
      code: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "name": "Torque settings for alloy stems",
  "url": "https://example.com/blog/torque-settings-alloy-stems/",
  "description": "Torque values and tightening order for alloy quill and threadless stems."
}`,
    },
    references: [
      { label: 'Google: Understand how structured data works', url: 'https://developers.google.com/search/docs/appearance/structured-data/intro' },
      { label: 'schema.org: Article', url: 'https://schema.org/Article' },
    ],
    relatedIssueTypes: ['missing_structured_data', 'generic_structured_data_only', 'missing_org_identity_schema'],
  },
  {
    issueType: 'article_missing_article_schema',
    pillar: 'aeo',
    bucket: 'answerability',
    title: 'Article-like page is missing article schema',
    summary:
      'The page looks like an article but its JSON-LD contains no article type, so answer engines cannot see it labeled as editorial content.',
    scope: 'page',
    explanation: [
      'A page counts as article-like when its stored JSON-LD already declares an article type (Article, BlogPosting, NewsArticle, or TechArticle) at the top level, in a top-level array, in an @graph array, or inside an embedded JSON string; only the node’s own @type is read for this gate. Otherwise it counts as article-like when it has 300 or more words and its URL contains /blog/, /article/, /articles/, /guides/, or /news/.',
      'Concretely: a 250-word /blog/ post is not article-like because the word gate fails, and a 900-word /pricing/ page without article schema is not article-like because the path gate fails. Both skip this check entirely.',
      'This particular flag fires for article-like pages that do have JSON-LD but whose markup lacks any article-like type, for example a long guide under /guides/ whose only schema is a generic WebPage block.',
      'Article-like pages with no JSON-LD at all raise missing_structured_data instead. The two flags are mutually exclusive by construction.',
    ],
    detection: [
      'The detector first applies the article-like gate described above, then checks the stored JSON-LD for any of the four article-like types.',
      'Gate and check use the same type test: only the node’s own `@type` (a string or string array) counts, read at the top level, inside top-level arrays, inside `@graph` arrays, or inside JSON strings that embed further JSON. An article type nested inside an arbitrary object does not count for either.',
      'Non-article pages are never flagged here no matter how long they are or what schema they carry.',
    ],
    causes: [
      'A long guide lives under an article-like path such as /guides/ but the template only emits a generic WebPage block.',
      'The site marks posts with a custom post type whose schema output was never mapped to Article or BlogPosting.',
      'An article schema block was removed during a theme change while the URL structure stayed the same.',
    ],
    fixes: [
      'Add an Article or BlogPosting node to the page JSON-LD with headline, author, and publication date filled in.',
      'Make sure the article node also carries the identity fields (at least one of author, publisher, or mainEntityOfPage) so the publisher-identity check passes too.',
      'If the page is genuinely not an article, the honest fix is to move it off the article-like URL path or shorten boilerplate-inflated word counts, not to add article markup to non-editorial content.',
      'Confirm the block appears in served view-source, since client-side-injected schema is invisible to the crawl.',
    ],
    verification: [
      'A new crawl must find an article-like type in the page JSON-LD and stop emitting this issue type for the URL.',
      'Confirm the type string in view-source and validate the block with the Rich Results Test article report.',
      'If the page was intentionally declassified (moved URL or trimmed content), confirm the new crawl no longer treats it as article-like.',
    ],
    cautions: [
      'Do not add Article markup to product, checkout, or landing pages to chase this flag. Mis-typed markup misleads answer engines.',
      'BlogPosting and Article are both accepted; NewsArticle and TechArticle also count. Pick the one that fits rather than adding several.',
      'Word count here is the crawler stored count, which reporting views may render differently. Do not reconcile the two by hand.',
    ],
    example: {
      label: 'BlogPosting node for a guide under /guides/',
      code: `{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Bleeding hydraulic disc brakes",
  "author": { "@type": "Person", "name": "Ada Nowak" },
  "datePublished": "2026-03-14",
  "mainEntityOfPage": "https://example.com/guides/bleed-hydraulic-disc-brakes/"
}`,
    },
    references: [
      { label: 'Google: Article structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
      { label: 'schema.org: BlogPosting', url: 'https://schema.org/BlogPosting' },
    ],
    relatedIssueTypes: ['missing_structured_data', 'generic_structured_data_only', 'article_missing_publisher_identity'],
  },
  {
    issueType: 'faq_like_page_missing_faq_schema',
    pillar: 'aeo',
    bucket: 'answerability',
    title: 'FAQ-like page is missing FAQ schema',
    summary:
      'The page reads like a frequently-asked-questions page but exposes no FAQPage structured data, so answer engines cannot lift its questions and answers directly.',
    scope: 'page',
    explanation: [
      'Question-and-answer content is among the most reusable formats for answer engines: each question maps cleanly to a spoken or quoted answer. FAQPage markup makes that mapping explicit.',
      'A page counts as FAQ-like when any of three rules match: its URL contains /faq (case-insensitive), at least 2 headings contain a question mark, or the visible text contains at least 3 question-mark characters.',
      'Because the text rule only needs three question marks anywhere in the visible text, long support or product pages can trip it accidentally. The flag describes page shape, not page intent.',
      'FAQPage markup is only appropriate when the page genuinely presents questions with answers. Decorative question marks do not make a page an FAQ.',
    ],
    detection: [
      'The detector applies the three FAQ-like rules to the stored URL, heading outline, and visible text, then checks the stored JSON-LD for an FAQPage type.',
      'The FAQPage search walks nested objects, arrays, @graph entries, and embedded JSON strings.',
      'The heading rule reads the stored heading outline; headings rendered only by scripts after load are not in the stored facts.',
    ],
    causes: [
      'A real FAQ or support page never had FAQPage markup added.',
      'A page accumulates question-style headings (How it works? Why choose us?) until it crosses the 2-heading threshold unintentionally.',
      'Body copy contains three or more question marks in testimonials, quoted speech, or rhetorical questions, tripping the text rule.',
      'The URL contains /faq as a substring of an unrelated slug.',
    ],
    fixes: [
      'First decide whether the page is genuinely a question-and-answer page. If it is, write FAQPage markup where each Question has an acceptedAnswer matching the visible text.',
      'If the page is not really an FAQ, the honest fix is to reword decorative question headings or trim rhetorical question marks so the page stops matching the rule intentionally — not to add FAQ markup to non-questions.',
      'Keep each answer self-contained in one or two short paragraphs, since answer engines quote answers verbatim.',
      'Confirm the FAQPage type appears in served view-source before the next crawl.',
    ],
    verification: [
      'A new crawl must find FAQPage in the page JSON-LD, or the page must no longer match the FAQ-like rule, for the flag to clear.',
      'Validate the block with the Rich Results Test FAQ report, which checks the Question and acceptedAnswer pairing.',
      'Confirm the visible questions and answers still match the markup after any rewording.',
    ],
    cautions: [
      'Never add FAQPage markup to a page with no real questions just to clear the flag. Google notes that markup must reflect visible content, and mismatched FAQ markup can lose rich-result eligibility.',
      'Do not mark up advertising or promotional copy as questions. Keep the FAQ to genuine user questions with direct answers.',
      'If the page intentionally keeps its question style without FAQ markup (for example a narrative essay), that is a legitimate editorial choice; the flag then documents a trade-off, not an error.',
    ],
    example: {
      label: 'FAQPage block matching visible questions',
      code: `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How often should I bleed hydraulic brakes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Once a year, or whenever the lever feels spongy."
      }
    }
  ]
}`,
    },
    references: [
      { label: 'Google: FAQ structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage' },
      { label: 'schema.org: FAQPage', url: 'https://schema.org/FAQPage' },
    ],
    relatedIssueTypes: ['missing_structured_data', 'article_missing_article_schema', 'generic_structured_data_only'],
  },
  {
    issueType: 'missing_author_signal',
    pillar: 'aeo',
    bucket: 'expertise',
    title: 'Article-like page has no author signal',
    summary:
      'An article-like page exposes no author attribution anywhere the crawler looks: no stored author, and no author in Open Graph tags.',
    scope: 'page',
    explanation: [
      'Author attribution is the expertise signal answer engines use to credit people rather than anonymous sites. A named author with a track record lets machines and readers judge whether the writer is qualified.',
      'The crawler builds the stored author from metadata first, then JSON-LD: it walks the `meta[name]` and `meta[property]` tags in document order and takes the first non-empty content from a `meta[name=author]` or `meta[property=article:author]` tag, whichever comes first. Only when no meta tag yields a name does it fall back to the author name from JSON-LD Article, BlogPosting, NewsArticle, TechArticle, or WebPage nodes (first match, @graph aware).',
      'The detector additionally reads the OG keys `og:author` and `article:author`. One subtlety: the extractor only persists `meta[property]` values starting with `og:` into stored OG tags, so an `article:author` meta tag reaches the detector through the stored author field, not through the OG tag map.',
      'Only article-like pages are checked. A 250-word /blog/ post or a 900-word /pricing/ page without article schema skips this check entirely, as described in the article-like gate.',
    ],
    detection: [
      'The detector flags an article-like page when the stored author is empty and both OG author keys (`og:author` and `article:author`) are empty.',
      'An author value that is only whitespace counts as empty after trimming.',
      'The visible byline text on the page is not read directly; only the metadata, OG, and schema sources above feed the check.',
    ],
    causes: [
      'The template renders a visible byline as plain text but never writes it into a meta author tag or JSON-LD author field.',
      'Guest posts or migrated content lost their author metadata during import.',
      'The theme shows a generic site name where the author should be, but even that generic value is missing here (a generic value would raise weak_author_signal instead).',
      'Author output is injected by JavaScript and never reaches the served HTML the crawler stores.',
    ],
    fixes: [
      'Add a visible byline naming the actual writer on the article page, near the headline or the end of the article.',
      'Write the same name into the `meta[name=author]` tag and into the JSON-LD author field so all three sources agree.',
      'Give the author a short bio or an author archive page showing their background, so the attribution carries real expertise weight.',
      'For staff-written pieces, name the person, not the desk. A real name is the point of the signal.',
    ],
    verification: [
      'A new crawl must store a non-empty author signal and stop emitting this issue type for the URL.',
      'Confirm in view-source that the meta author tag or JSON-LD author name is present in the served HTML.',
      'Confirm the visible byline matches the metadata name so the schema-match check passes as well.',
    ],
    cautions: [
      'Do not invent an author name for content nobody wrote or reviewed. False attribution is worse than none.',
      'A placeholder such as Admin, Team, Staff, or Editor clears this flag but immediately raises weak_author_signal. Use a specific credible person or source instead.',
      'Reporting content views never return the stored author value, so verify through view-source or CMS fields rather than the content preview.',
    ],
    example: {
      label: 'Author in metadata and schema together',
      code: `<meta name="author" content="Ada Nowak" />

{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Bleeding hydraulic disc brakes",
  "author": { "@type": "Person", "name": "Ada Nowak" }
}`,
    },
    references: [
      { label: 'Google: Article structured data (author)', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
      { label: 'MDN: meta name=author', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name' },
    ],
    relatedIssueTypes: ['weak_author_signal', 'author_signal_not_supported_by_schema', 'article_missing_publisher_identity'],
  },
  {
    issueType: 'weak_author_signal',
    pillar: 'aeo',
    bucket: 'expertise',
    title: 'Article-like page has a generic author name',
    summary:
      'The article names an author, but the name is a generic placeholder such as Admin, Team, Staff, or Editor, which carries no expertise.',
    scope: 'page',
    explanation: [
      'A generic author label tells readers and answer engines that nobody in particular stands behind the content. Expertise cannot attach to a role name shared by the whole site.',
      'The detector matches only four exact single tokens after lowercasing and trimming: admin, team, staff, and editor. Any of these in the stored author or either OG author key raises the flag.',
      'The match is deliberately narrow: renaming Admin to admin team clears the row because the two-word string is not in the set, but it remains weak attribution in substance. Treat a cleared row and a genuinely fixed page as different things.',
      'This is a low-severity flag because some attribution exists. It marks an opportunity to strengthen credibility, not a complete absence.',
    ],
    detection: [
      'The detector checks the stored author plus the OG `og:author` and `article:author` values, lowercases and trims each, and flags the page when any equals exactly admin, team, staff, or editor.',
      'Empty values are skipped, so this flag implies a non-empty but generic value.',
      'Only article-like pages are evaluated; other pages are never flagged here.',
    ],
    causes: [
      'The CMS defaults new posts to an admin or editor account and nobody changed the author on publish.',
      'A migration mapped all legacy authors to a single Team account.',
      'The theme prints the site role (for example Staff) where the writer name should go.',
    ],
    fixes: [
      'Attribute the piece to the specific person who wrote or reviewed it, using their real name.',
      'Update the value everywhere it appears: the visible byline, the meta author tag, and the JSON-LD author field, keeping the spelling identical so the schema-match check passes.',
      'If the true author is unknown for legacy content, assign the editor who reviewed it and note the review, rather than leaving a role name.',
      'Add an author bio or archive page so the name resolves to a real background.',
    ],
    verification: [
      'A new crawl must store an author value outside the generic set and stop emitting this issue type for the URL.',
      'Confirm the byline, meta tag, and schema all show the same specific name.',
      'Resist the cosmetic fix: a two-word variant of a placeholder clears the detector without fixing the underlying weakness.',
    ],
    cautions: [
      'Do not attribute content to a real person who did not write or review it. Misattribution harms credibility and the person named.',
      'Do not evade the check with a near-synonym placeholder such as administration or editorial team. The goal is genuine accountability, not string avoidance.',
      'For content genuinely produced by a group with no individual owner, a named editorial desk with a described review process is more honest than a fake personal name.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
      { label: 'Google: Article structured data (author)', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
    ],
    relatedIssueTypes: ['missing_author_signal', 'author_signal_not_supported_by_schema', 'article_missing_publisher_identity'],
  },
  {
    issueType: 'article_missing_publisher_identity',
    pillar: 'aeo',
    bucket: 'expertise',
    title: 'Article schema lacks publisher identity',
    summary:
      'An article-like page has JSON-LD, but none of its article nodes names an author, publisher, or main entity page, leaving the content publisher unidentified.',
    scope: 'page',
    explanation: [
      'Publisher identity tells answer engines who stands behind an article: the author who wrote it, the organization publishing it, or the canonical page it belongs to. Without any of the three, the article floats without provenance.',
      'The check looks at article-like nodes only (Article, BlogPosting, NewsArticle, TechArticle) and passes when at least one such node carries a non-empty author, publisher, or mainEntityOfPage field.',
      'Unlike the narrow article-like page gate, this identity search walks all nested objects, arrays, @graph entries, and embedded JSON strings. A publisher nested deep inside a graph still counts.',
      'A field counts when it holds a non-empty string, an array with a content entry, or any non-empty object. Even an object like {"@type": "Person"} with no name inside counts as content to this detector, though real consumers prefer a named entity.',
    ],
    detection: [
      'The detector requires an article-like page with JSON-LD present, then searches every article-like node for the three identity fields.',
      'Article-like pages with no JSON-LD at all are not flagged here; they raise missing_structured_data instead.',
      'An identity field on a non-article node (for example publisher on a bare WebPage node) does not satisfy the check; the field must sit on an article-like node.',
    ],
    causes: [
      'A minimal article template emits headline and date but no author or publisher block.',
      'The publisher organization is defined on a separate WebSite node but never repeated or referenced on the article node.',
      'A plugin update dropped the publisher logo or name setting, emptying the publisher object.',
    ],
    fixes: [
      'Add an author object with the writer name to the article node, since the same name should already appear in the byline and meta author tag.',
      'Add a publisher object naming the organization, ideally with its logo, so the brand behind the article is explicit.',
      'Alternatively or additionally, set mainEntityOfPage to the canonical article URL so the article points at its home page.',
      'Keep names spelled identically across byline, meta tag, and schema so the schema-match check passes too.',
    ],
    verification: [
      'A new crawl must find at least one of the three fields on an article-like node and stop emitting this issue type for the URL.',
      'Confirm in view-source that the field sits inside the article object, not only in a sibling node.',
      'Validate the block with the Rich Results Test to confirm the author and publisher parse as entities.',
    ],
    cautions: [
      'Do not attach a publisher the site does not belong to, and do not invent an author. Identity markup must be true.',
      'A logo-only publisher without a name is weak; always include the organization name as text.',
      'If the site republishes third-party content, the publisher should reflect the actual publishing arrangement rather than claiming authorship it does not hold.',
    ],
    example: {
      label: 'Article node with author, publisher, and home page',
      code: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Bleeding hydraulic disc brakes",
  "author": { "@type": "Person", "name": "Ada Nowak" },
  "publisher": {
    "@type": "Organization",
    "name": "Example Cycles",
    "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" }
  },
  "mainEntityOfPage": "https://example.com/guides/bleed-hydraulic-disc-brakes/"
}`,
    },
    references: [
      { label: 'Google: Article structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
      { label: 'schema.org: publisher', url: 'https://schema.org/publisher' },
    ],
    relatedIssueTypes: ['missing_author_signal', 'author_signal_not_supported_by_schema', 'article_missing_article_schema'],
  },
  {
    issueType: 'author_signal_not_supported_by_schema',
    pillar: 'aeo',
    bucket: 'expertise',
    title: 'Visible author is not backed by schema',
    summary:
      'The page names an author in its metadata, but the JSON-LD names nobody matching, so the visible attribution has no machine-readable backing.',
    scope: 'page',
    explanation: [
      'Two parallel attributions exist on a well-built article: the human-readable byline and metadata, and the machine-readable author or publisher in JSON-LD. Answer engines trust the claim most when both agree.',
      'The detector collects the plain names (stored author plus OG `og:author` and `article:author`) and the schema identity names (every author and publisher name found recursively in the JSON-LD), normalizes both by lowercasing and trimming, and requires at least one exact match.',
      'A near-match is not a match: Ada Nowak in the byline and A. Nowak in the schema do not satisfy the check, because comparison is on normalized full strings.',
      'This flag therefore means the two systems disagree or one is missing, not that authorship is absent. Adding an unrelated organization name to the schema while the byline names someone else does not fix it.',
    ],
    detection: [
      'The detector requires an article-like page with a non-empty plain author signal and JSON-LD present, then compares the two normalized name sets.',
      'If either set is empty (no plain names, or no schema identity names at all), the page is flagged.',
      'Schema names are collected from author and publisher keys at any nesting depth, including @graph entries and embedded JSON strings.',
    ],
    causes: [
      'The byline was updated to a new writer but the JSON-LD template still emits the previous author.',
      'The schema names an organization while the byline names a person, with no person entry in the schema to match.',
      'Spelling differs between the two places (full name versus initials, maiden versus married name, with or without a middle name).',
      'The JSON-LD author is a bare object without a name, so the schema name set is empty despite an author key existing.',
    ],
    fixes: [
      'Decide the canonical author name and spell it identically in the visible byline, the meta author tag, and the JSON-LD author name.',
      'If the schema carries only an organization publisher, add the person as the article author alongside it rather than replacing the publisher.',
      'Give bare author or publisher objects a text name; an object without a name contributes no match.',
      'After the edit, compare the two strings character for character, ignoring only case and surrounding spaces.',
    ],
    verification: [
      'A new crawl must find a normalized name present in both sets and stop emitting this issue type for the URL.',
      'Confirm in view-source that the exact same name appears in the meta tag and inside the JSON-LD author or publisher.',
      'Check that fixing this flag did not introduce or leave behind missing_author_signal or article_missing_publisher_identity on the same page.',
    ],
    cautions: [
      'Do not paper over the mismatch by copying the byline name into an unrelated schema node. The schema author should describe the actual author.',
      'Pen names are acceptable only if used consistently in both places; a byline pen name paired with a legal name in schema still mismatches.',
      'Automated author rotation (guest author of the month) needs the schema template to read the same field as the byline, or the two will drift apart again.',
    ],
    references: [
      { label: 'Google: Article structured data (author)', url: 'https://developers.google.com/search/docs/appearance/structured-data/article' },
      { label: 'schema.org: author', url: 'https://schema.org/author' },
    ],
    relatedIssueTypes: ['missing_author_signal', 'weak_author_signal', 'article_missing_publisher_identity'],
  },
  {
    issueType: 'missing_external_citations',
    pillar: 'aeo',
    bucket: 'authoritativeness',
    title: 'Article-like page cites no external sources',
    summary:
      'An article-like page links to no external pages at all, so none of its claims point at supporting sources a reader or answer engine could check.',
    scope: 'page',
    explanation: [
      'External citations are how editorial content shows its work. Linking to primary sources, standards, documentation, or original research lets readers verify claims and lets answer engines see the article participating in a sourced conversation.',
      'The stored external-link count covers every link in the full document, including header and footer, whose normalized URL is outside the crawl root host. There is no exclusion for nofollow links, no boilerplate exclusion, and no per-target deduplication: repeated links to the same external URL each count.',
      'That generosity cuts both ways. A footer social icon satisfies the count for the detector even when it is not a real editorial citation, so a passing count proves detector satisfaction, not citation quality.',
      'This flag is the short-article end of the citation ladder: it fires for article-like pages below the long-article word gates when the external count is zero.',
    ],
    detection: [
      'The detector flags an article-like page when its stored external-link count is below 1, after the longer-article cases have been evaluated first.',
      'Evaluation order matters: a page with 800 or more words and zero external links raises long_article_has_no_citations instead, and a 1200-plus-word page with one link raises long_article_has_weak_citations.',
      'The issue-row details carry the only stored-count evidence. Reporting content views show link text and URLs but never the stored count, so the two cannot be reconciled by hand.',
    ],
    causes: [
      'The writer never linked out, either from habit or from a mistaken belief that external links leak value.',
      'External links were stripped during migration to a new editor or CMS.',
      'A link policy adds `rel=nofollow` to external links, which is fine for readers but changes nothing for this count since nofollow links still count.',
      'All references sit in a bibliography as plain text without actual links.',
    ],
    fixes: [
      'Add links to credible external sources behind the article most important claims: primary documentation, standards, papers, or original reporting.',
      'Place citations inline near the claim they support rather than collecting them in an unlinked list at the end.',
      'Link the source, not a middleman: prefer the original document over an article about the document.',
      'Do not inflate the count with footer, navigation, or repeated social links. Those satisfy the detector without helping a single reader.',
    ],
    verification: [
      'A new crawl must store an external-link count of at least 1 and stop emitting this citation flag for the URL.',
      'Confirm the new links point at genuinely supporting sources, not at social profiles or partner badges.',
      'Re-check quoting accuracy: each cited claim should be verifiable at the linked destination.',
    ],
    cautions: [
      'Never link to a source that contradicts the claim or that you have not read. A citation is an endorsement of the evidence.',
      'Affiliate or sponsored links are not citations. Mark them appropriately and do not count them as source support.',
      'Link rot is real: prefer stable canonical URLs for standards and documentation so citations survive.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['weak_external_citations', 'long_article_has_no_citations', 'long_article_has_weak_citations'],
  },
  {
    issueType: 'weak_external_citations',
    pillar: 'aeo',
    bucket: 'authoritativeness',
    title: 'Article shows thin citation support',
    summary:
      'A substantial article of 600 words or more has at most one external link, which is thin sourcing for content of that length.',
    scope: 'page',
    explanation: [
      'Longer articles make more claims, and each significant claim benefits from a checkable source. One link across a long piece suggests the research behind it is shallow or the writer kept sources to themselves.',
      'The exact gate is a word count of 600 or more with an external-link count of 1 or fewer. Shorter article-like pages with one link are not flagged here.',
      'The same counting generosity applies as elsewhere: every link in the full document counts, including header and footer, with no nofollow exclusion and no deduplication. A single footer social link both triggers this flag shape and fails to serve as a citation.',
      'This is a low-severity flag. It points at an article that is sourced but thinly, where a modest round of citation work raises its standing.',
    ],
    detection: [
      'The detector flags an article-like page with 600 or more words and at most 1 external link, evaluated after the no-citation and long-article cases.',
      'A 900-word page with exactly 1 link lands here rather than under the long-article weak-citations flag, whose word gate starts at 1200.',
      'The stored count is the only evidence; content views cannot reproduce it because they show link text without the stored totals.',
    ],
    causes: [
      'The article links one flagship source (for example the official docs homepage) but never links the specific pages behind individual claims.',
      'The single external link is chrome, such as a social icon or theme credit, rather than an editorial citation.',
      'The piece was expanded over time from a short post to a long guide without revisiting its sourcing.',
      'Editors trimmed links during review out of caution about sending readers away.',
    ],
    fixes: [
      'Walk through the article claim by claim and attach the strongest supporting source to each significant factual statement.',
      'Replace the single generic link with deep links to the exact sections or pages that support each point.',
      'Remove or discount chrome links from your own assessment: aim for several genuine editorial citations, not a count of one plus a footer.',
      'Keep links fresh and specific; a deep link to the relevant section beats a homepage link every time.',
    ],
    verification: [
      'A new crawl must store an external-link count above 1 for a 600-plus-word article and stop emitting this issue type for the URL.',
      'Audit the links as a reader would: each major claim should have a nearby source that actually supports it.',
      'Confirm the count genuinely rose from editorial links rather than from added footer or navigation links.',
    ],
    cautions: [
      'Do not pad the count with extra links to the same single source. Repeated links to one URL each count for the detector but add no breadth of evidence.',
      'More links are not always better. Every link should earn its place behind a claim; decorative linking dilutes trust.',
      'Avoid linking to competitors or low-quality aggregators when the primary source is available and linkable.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['missing_external_citations', 'long_article_has_weak_citations', 'long_article_has_no_citations'],
  },
  {
    issueType: 'long_article_has_no_citations',
    pillar: 'aeo',
    bucket: 'authoritativeness',
    title: 'Long article has zero citations',
    summary:
      'An article of 800 words or more links to no external sources whatsoever, which is the weakest sourcing posture a long-form piece can present.',
    scope: 'page',
    explanation: [
      'Eight hundred words is a developed article: an argument, a tutorial, or an analysis with many verifiable statements. Publishing that much text with zero outbound evidence asks readers and answer engines to take everything on trust.',
      'Answer engines deciding what to quote prefer content whose claims can be traced. An unsourced long article is quotable only at the engine risk, so it tends to lose out to sourced equivalents.',
      'The exact gate is a word count of 800 or more with an external-link count of exactly 0. Shorter article-like pages with zero links raise missing_external_citations instead.',
      'Remember the counting rules: header, footer, and repeated links all count, and nofollow changes nothing. Zero here means literally no external `href` anywhere in the document, not even a social icon.',
    ],
    detection: [
      'The detector evaluates this case first in the citation ladder: article-like, 800 or more words, external count equal to 0.',
      'Because it is checked before the weaker cases, a qualifying page always raises this flag and never the milder citation flags.',
      'The details string quotes the stored word count; that row is the stored-count evidence, since content views never return the count.',
    ],
    causes: [
      'A long opinion or experience piece was written entirely from personal knowledge with no source links added.',
      'A content program expanded short posts into long guides by adding unlinked text.',
      'All outbound links were removed at once by a theme, plugin, or migration that strips external `hrefs`.',
      'References exist only as plain-text mentions (publication names, report titles) without hyperlinks.',
    ],
    fixes: [
      'Identify the load-bearing claims in the article: statistics, specifications, dates, quotes, and how-to steps that depend on outside facts.',
      'Add inline links to primary sources for each: official documentation, standards bodies, papers, datasets, or original reporting.',
      'Convert plain-text mentions of sources into real links pointing at the specific supporting page.',
      'Review the whole document afterwards and confirm at least the zero is gone through genuine citations, then keep going toward thorough sourcing.',
    ],
    verification: [
      'A new crawl must store an external-link count above 0 and stop emitting this issue type for the URL.',
      'Read the article as a skeptic and confirm every statistic and specification now has a nearby source link.',
      'Do not verify by counting footer icons; verify by checking that claims resolve to evidence.',
    ],
    cautions: [
      'Do not fix a zero with a single footer social link. It clears the detector while leaving the article just as unsourced for readers.',
      'Never fabricate sources or link to pages that do not support the claim. False citations destroy the credibility the fix is meant to build.',
      'If the article is genuinely pure opinion or memoir with no external factual claims, say so in the text. Some pieces legitimately need fewer citations, though this detector still counts links mechanically.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['long_article_has_weak_citations', 'missing_external_citations', 'weak_external_citations'],
  },
  {
    issueType: 'long_article_has_weak_citations',
    pillar: 'aeo',
    bucket: 'authoritativeness',
    title: 'Very long article has almost no citations',
    summary:
      'An article of 1200 words or more has at most one external link, leaving a large body of claims supported by a single source at best.',
    scope: 'page',
    explanation: [
      'Twelve hundred words is a comprehensive piece: a definitive guide, a deep comparison, or a research-heavy analysis. Readers reasonably expect such a piece to show substantial research, and a single link cannot cover that surface area.',
      'The exact gate is a word count of 1200 or more with an external-link count of 1 or fewer. A 900-word page with one link does not qualify here; it falls to weak_external_citations because the word gate fails.',
      'This flag sits second in the evaluation order, right after the zero-citation case. A 1200-plus-word page with zero links raises long_article_has_no_citations instead.',
      'As with all citation checks, the count includes header, footer, and repeated links with no nofollow exclusion, so the single counted link may itself be chrome rather than evidence.',
    ],
    detection: [
      'The detector flags an article-like page with 1200 or more words and at most 1 external link, when the zero-citation case did not already match.',
      'The details string quotes both stored numbers, for example a word count and a count of 1 external citation link.',
      'Content views show link text and URLs but never the stored count, so the row details are the authoritative evidence.',
    ],
    causes: [
      'A flagship guide grew by accretion over many edits while its original one or two links stayed unchanged.',
      'Several shorter posts were merged into one definitive guide without merging their source lists.',
      'The writer leaned on a single reference (one manual, one paper) for the entire piece.',
      'The only counted link is boilerplate, and the article body itself links nowhere.',
    ],
    fixes: [
      'Section by section, attach the primary source behind each major claim, aiming for coverage across the whole piece rather than a cluster in the introduction.',
      'Diversify sources: documentation for specifications, papers or datasets for findings, original reporting for events, standards for compliance claims.',
      'Replace any single generic reference link with deep links to the exact supporting pages.',
      'Prune claims you cannot source. A shorter fully-supported article outperforms a longer half-supported one.',
    ],
    verification: [
      'A new crawl must store an external-link count above 1 and stop emitting this issue type for the URL.',
      'Spot-check several sections and confirm each substantial claim has a nearby link to a source that actually contains the supporting evidence.',
      'Confirm the new links are editorial citations in the body, not added chrome.',
    ],
    cautions: [
      'Do not split one source into many links to inflate the count. Repeated links to the same URL each count for the detector but demonstrate no breadth of research.',
      'Do not link to link farms, scraped copies, or AI-generated summaries when the primary source exists. Citation quality is judged by readers even when the detector only counts.',
      'Keep the piece maintainable: every added citation is a future link to check, so prefer stable canonical sources.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['long_article_has_no_citations', 'weak_external_citations', 'missing_external_citations'],
  },
  {
    issueType: 'missing_og_tags',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Page is missing Open Graph tags',
    summary:
      'The page exposes no Open Graph metadata, so link shares and previews on social platforms and chat apps render as bare URLs instead of titled cards.',
    scope: 'page',
    explanation: [
      'Open Graph tags are meta tags such as `og:title`, `og:description`, `og:image`, and `og:url` that tell any platform rendering a link preview what title, summary, and image to show.',
      'Rich previews earn more clicks and look more legitimate when shared. A bare-URL share next to a fully rendered card reads as less trustworthy, which is why this signal sits in the trust bucket.',
      'The extractor only keeps meta tags whose property starts with `og:` and whose content is non-empty. Tags from other vocabularies, notably `twitter:` cards, never satisfy this detector even when present and correct.',
      'This is a low-severity, per-page flag. It describes presentation quality, and fixing it is usually a few lines in the page head or one plugin setting.',
    ],
    detection: [
      'The detector flags the page when the stored OG bytes are empty, the literal null, or an empty object {}. Any stored non-empty OG map passes.',
      'Because only `og:`-prefixed properties with content are persisted, a page with only `twitter:` tags is stored as tagless and flagged.',
      'The check runs per page across all healthy HTML-like pages, independent of article status or length.',
    ],
    causes: [
      'The theme or template has no social-meta output and no SEO plugin fills the gap.',
      'An SEO plugin social module is disabled or lacks a default image, and per-page fields were never filled.',
      'OG tags are injected by JavaScript after load, so the served HTML the crawler stores contains none.',
      'A head-cleanup optimization removed meta tags it did not recognize.',
    ],
    fixes: [
      'Add the core tags to the page head: `og:title`, `og:description`, `og:image` with an absolute URL, and `og:url` with the canonical page URL.',
      'Keep the title and description consistent with the page title and meta description rather than writing separate marketing copy.',
      'Use an image that meets platform size guidance (large, absolute URL, accessible without login) so previews render everywhere.',
      'If a plugin generates the tags, fill in the default image and confirm output in served view-source, since script-injected tags do not count.',
    ],
    verification: [
      'A new crawl must store non-empty OG tags and stop emitting this issue type for the URL.',
      'Confirm in view-source that `meta property="og:..."` tags with content exist in the served head.',
      'Paste the URL into a social card debugger or simply share it privately to see the rendered preview.',
    ],
    cautions: [
      'Do not set `og:url` to a different page than the canonical. Mismatched share URLs split engagement and confuse crawlers.',
      'Do not use relative image paths or images blocked by authentication; previews fetch the image as an anonymous visitor.',
      'Twitter card tags are still worth keeping for that network, but they do not clear this flag. The `og:` tags must exist on their own.',
    ],
    example: {
      label: 'Core Open Graph tags in the page head',
      code: `<meta property="og:title" content="Bleeding hydraulic disc brakes" />
<meta property="og:description" content="Step-by-step guide to inspecting and servicing a hub bearing." />
<meta property="og:image" content="https://example.com/images/brake-bleed.jpg" />
<meta property="og:url" content="https://example.com/guides/bleed-hydraulic-disc-brakes/" />`,
    },
    references: [
      { label: 'The Open Graph protocol', url: 'https://ogp.me/' },
      { label: 'MDN: meta element', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta' },
    ],
    relatedIssueTypes: ['weak_open_graph_coverage', 'schema_missing_core_fields', 'missing_structured_data'],
  },
  {
    issueType: 'weak_open_graph_coverage',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Open Graph coverage is weak across the site',
    summary:
      'Fewer than half of the crawled pages expose Open Graph tags, so most shares of site content render as bare links.',
    scope: 'site',
    explanation: [
      'Per-page OG tags fix one share at a time; coverage below half means the sharing problem is systemic. Most URLs anyone posts from the site will render poorly.',
      'The exact gate is covered pages divided by total crawled pages below 0.5. Exactly half covered passes; anything under half is flagged.',
      'This is a site-wide finding attached to a single representative page (the shallowest crawled page, preferring the homepage), not a verdict on that page itself. Do not read it as that page failing.',
      'Fixing it is template work, not page work: one head change rolled out site-wide moves the ratio, while hand-editing individual pages barely shifts it.',
    ],
    detection: [
      'The detector counts pages with non-empty stored OG tags across the whole crawl and flags the site when the fraction is under one half.',
      'The issue attaches to the representative page, so its URL in the row identifies where the finding is filed, not which page caused it.',
      'Only healthy HTML-like crawled pages enter the denominator; error and non-HTML pages are not counted.',
    ],
    causes: [
      'OG output was configured for posts but never for pages, archives, or custom post types that form most of the crawl.',
      'A theme change dropped the social-meta partial from some templates while leaving it in others.',
      'New sections launched with a different template that omits OG tags, dragging the site ratio down as they grew.',
    ],
    fixes: [
      'Move OG output into the shared head template or plugin default so every page type emits core tags automatically.',
      'Set sensible fallbacks: site name as title suffix, the meta description or excerpt as `og:description`, and a default share image where no featured image exists.',
      'Backfill the largest uncovered templates first (pages, then archives or custom types) to move the ratio fastest.',
      'Confirm output in served view-source for one page of each template, not just in plugin previews.',
    ],
    verification: [
      'A new crawl must show OG coverage at or above one half and stop emitting this issue type.',
      'Sample several previously uncovered URLs in view-source and confirm og: tags now appear in served HTML.',
      'Share a previously bare URL privately to confirm the rendered card improved.',
    ],
    cautions: [
      'Do not chase the ratio by excluding pages from the crawl or blocking templates. Coverage gaming leaves real shares broken.',
      'A default image is better than none, but page-specific images remain better. Fallbacks are a floor, not a target.',
      'Cached shares update slowly on some platforms; use their debuggers to refresh cached previews rather than assuming the tags failed.',
    ],
    references: [
      { label: 'The Open Graph protocol', url: 'https://ogp.me/' },
    ],
    relatedIssueTypes: ['missing_og_tags', 'missing_website_schema', 'missing_org_identity_schema'],
  },
  {
    issueType: 'missing_website_schema',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Site has no WebSite schema',
    summary:
      'No crawled page declares WebSite structured data, so the site never formally identifies itself as a website entity to answer engines.',
    scope: 'site',
    explanation: [
      'WebSite schema is the site-level counterpart of page-level markup: a small JSON-LD node, usually on the homepage, that names the site and gives its URL. It lets machines treat the domain as one identified entity rather than a bag of pages.',
      'It also hosts site-level features such as a potential-action search box definition, though the identity function alone justifies it.',
      'The type search walks nested objects, arrays, @graph entries, and embedded JSON strings on every crawled page, so a WebSite node anywhere in the crawl satisfies the check.',
      'This is a site-wide finding attached to the representative page. Its absence says nothing about any single page content; it says the site never introduced itself.',
    ],
    detection: [
      'The detector collects @type values from every crawled page stored JSON-LD and flags the site when no page carries the WebSite type.',
      'One page with the type clears the whole site flag, which is why the homepage is the natural home for it.',
      'Malformed JSON-LD contributes no types, so broken markup anywhere does not help; the node must parse.',
    ],
    causes: [
      'No template or plugin was ever configured to emit site-level schema; all markup effort went to per-post article blocks.',
      'A homepage redesign replaced the template carrying the WebSite block.',
      'The WebSite node exists but with a typo in the type name, making it an unknown string rather than the recognized type.',
    ],
    fixes: [
      'Add a WebSite node to the homepage JSON-LD with the site name and canonical site URL.',
      'Keep the node minimal but accurate: name, url, and optionally a publisher reference to the organization node.',
      'Spell the type exactly WebSite with that capitalization; schema type names are case-sensitive strings to this detector.',
      'Confirm the node appears in served homepage view-source before the next crawl.',
    ],
    verification: [
      'A new crawl must find a WebSite type on at least one page and stop emitting this issue type.',
      'Confirm the exact string WebSite in the served JSON-LD and validate the block with the Schema Markup Validator.',
      'Check that the site name and URL in the node match the live homepage title and canonical address.',
    ],
    cautions: [
      'Do not add WebSite nodes to every page as separate competing site identities. One canonical site node, normally on the homepage, is the clean pattern.',
      'The search-box potential action is optional and has strict eligibility rules; do not add it unless the site search genuinely qualifies.',
      'A site name in schema that differs from the real brand name creates confusion rather than identity. Use the actual name.',
    ],
    example: {
      label: 'Minimal WebSite node for the homepage',
      code: `{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Example Cycles",
  "url": "https://example.com/"
}`,
    },
    references: [
      { label: 'Google: Site names and organization info', url: 'https://developers.google.com/search/docs/appearance/site-names' },
      { label: 'schema.org: WebSite', url: 'https://schema.org/WebSite' },
    ],
    relatedIssueTypes: ['missing_org_identity_schema', 'homepage_missing_org_contact_trust_signals', 'generic_structured_data_only'],
  },
  {
    issueType: 'missing_org_identity_schema',
    pillar: 'aeo',
    bucket: 'authoritativeness',
    title: 'Site has no organization or person identity schema',
    summary:
      'No crawled page declares Organization, LocalBusiness, Person, or Corporation schema, so the entity behind the site is never formally identified.',
    scope: 'site',
    explanation: [
      'Every site is published by someone: a company, a local business, or an individual. Identity schema states that plainly in machine-readable form with a name, URL, and optionally logo and contact details.',
      'This is the site-level authoritativeness anchor. Individual articles can name authors, but without an entity behind the whole site, answer engines cannot connect those authors to a real publisher.',
      'Any one of the four accepted types (Organization, LocalBusiness, Person, Corporation) on any crawled page satisfies the check; the search walks nested objects, arrays, @graph entries, and embedded JSON strings across the whole crawl.',
      'This is a site-wide finding attached to the representative page. Fix it once in a shared template or homepage block rather than per page.',
    ],
    detection: [
      'The detector collects @type values from all crawled pages and flags the site when none of the four identity types appears.',
      'Type names are matched as exact trimmed strings, so a typo creates an unknown type that does not satisfy the check.',
      'Unparseable JSON-LD contributes no types anywhere, so broken markup cannot clear this flag.',
    ],
    causes: [
      'Schema work focused on article markup while nobody defined the publishing entity itself.',
      'An organization node existed but used a non-accepted type name, or a typo broke the recognized string.',
      'A rebrand changed the business name and the schema block was removed pending new branding instead of updated.',
      'For personal sites, nobody realized a Person node is an accepted answer; the site waited on company-style markup it will never need.',
    ],
    fixes: [
      'Choose the fitting type: Organization or Corporation for companies, LocalBusiness with address and opening details for physical premises, Person for individual publishers.',
      'Add the node with name, url, and logo, plus sameAs links to official profiles so the entity resolves to real places.',
      'Place it in the shared homepage or site-wide schema so it ships on the most crawled URL.',
      'Keep the name identical to the brand used in visible content and publisher fields on article nodes.',
    ],
    verification: [
      'A new crawl must find one of the four types on at least one page and stop emitting this issue type.',
      'Confirm the exact type string in served view-source and validate with the Schema Markup Validator.',
      'Confirm the named entity matches the real publisher: correct legal or brand name, correct URL, working logo.',
    ],
    cautions: [
      'Do not claim an organization the site is not part of, and do not copy a manufacturer or partner identity as your own.',
      'LocalBusiness markup carries expectations of accurate address and hours. Only use it when the details are true and maintained.',
      'sameAs links should point at profiles the entity controls. Linking to unrelated or fan-run pages muddies identity.',
    ],
    example: {
      label: 'Organization identity node',
      code: `{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Example Cycles",
  "url": "https://example.com/",
  "logo": "https://example.com/logo.png",
  "sameAs": ["https://www.wikidata.org/wiki/Q123456"]
}`,
    },
    references: [
      { label: 'Google: Organization info (logo)', url: 'https://developers.google.com/search/docs/appearance/structured-data/logo' },
      { label: 'schema.org: Organization', url: 'https://schema.org/Organization' },
    ],
    relatedIssueTypes: ['missing_website_schema', 'homepage_missing_org_contact_trust_signals', 'article_missing_publisher_identity'],
  },
  {
    issueType: 'missing_https',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Page is not served over HTTPS',
    summary:
      'The crawled page URL uses plain HTTP, so visitors get no transport encryption and platforms treat the page as less trustworthy.',
    scope: 'page',
    explanation: [
      'HTTPS encrypts traffic between the visitor and the server, protecting logins, forms, and browsing from interception. Browsers label HTTP pages not secure, which directly erodes visitor trust.',
      'Search and answer platforms treat HTTPS as a baseline trust signal. An HTTP page starts from a deficit no amount of good content fully offsets.',
      'The check is a simple string test: after trimming and lowercasing, the stored page URL begins with http://. There is no live connection test and no certificate validation involved.',
      'Migrating to HTTPS is well-trodden ground: certificates are free and automated, and the remaining work is updating internal references and redirects.',
    ],
    detection: [
      'The detector flags any healthy page whose stored URL starts with http:// after trimming whitespace and lowercasing.',
      'HTTPS pages are never flagged here regardless of certificate quality; certificate problems surface elsewhere or not at all.',
      'Both www and bare-host HTTP variants match; the scheme prefix alone decides.',
    ],
    causes: [
      'The site never migrated and still serves everything over HTTP.',
      'The site supports HTTPS but internal links, sitemaps, or canonicals still point at HTTP URLs that got crawled.',
      'A staging or legacy subdomain was crawled that was never included in the certificate rollout.',
    ],
    fixes: [
      'Serve the site over HTTPS with a valid certificate, redirecting all HTTP traffic to HTTPS with permanent (301) redirects.',
      'Update internal links, canonicals, sitemaps, and schema URLs to the HTTPS versions so crawlers stop discovering HTTP addresses.',
      'Fix mixed content: ensure images, scripts, and stylesheets load over HTTPS so browsers show the page as fully secure.',
      'Re-crawl after the migration so stored URLs reflect the HTTPS addresses.',
    ],
    verification: [
      'A new crawl must store https:// URLs and stop emitting this issue type for the pages.',
      'Load the page and confirm the browser shows a secure indicator with no mixed-content warnings in developer tools.',
      'Confirm the HTTP URL returns a 301 redirect to the HTTPS version rather than serving content directly.',
    ],
    cautions: [
      'Do not mix schemes across canonicals and sitemaps during migration; pick HTTPS everywhere at once to avoid redirect chains.',
      'Renewal automation matters more than the first certificate. An expired certificate breaks trust harder than plain HTTP did.',
      'If some HTTP URLs must stay reachable (legacy integrations), that is an intentional exception to document, not a reason to skip the migration.',
    ],
    references: [
      { label: 'Google: Why HTTPS matters (and securing with TLS)', url: 'https://developers.google.com/search/docs/crawling-indexing/https' },
      { label: 'MDN: Transport Layer Security', url: 'https://developer.mozilla.org/en-US/docs/Glossary/TLS' },
    ],
    relatedIssueTypes: ['homepage_missing_org_contact_trust_signals', 'missing_website_schema', 'missing_org_identity_schema'],
  },
  {
    issueType: 'missing_llms_txt',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Site has no /llms.txt file',
    summary:
      'The site exposes no /llms.txt file at its root, missing the simple convention that helps AI answer engines discover and cite key content.',
    scope: 'site',
    explanation: [
      '/llms.txt is a community convention documented at llmstxt.org: a Markdown file at the site root that lists and summarizes the site most important pages so language models can find, understand, and cite them.',
      'It complements robots.txt rather than replacing it. Where robots.txt tells crawlers where they may go, /llms.txt tells answer engines what matters most once they arrive.',
      'Typical content is a short site description followed by grouped Markdown links to cornerstone guides, documentation, and reference pages, sometimes with one-line summaries per link.',
      'This is a site-wide finding attached to the representative page. One file at the root resolves it for the whole site.',
    ],
    detection: [
      'During the crawl the site facts record whether /llms.txt is known present. The detector flags the site only when that value is known-false.',
      'The file must live at the site root path /llms.txt. A similar file at a nested path does not count.',
      'If the probe result is unknown rather than false, the flag is not raised; absence of evidence is not treated as evidence of absence.',
    ],
    causes: [
      'Nobody on the team has heard of the convention yet; it is newer and less known than robots.txt or sitemaps.',
      'A Markdown overview exists but lives at a nested URL such as /docs/index.md instead of the root /llms.txt path.',
      'The file was added but blocked by server rules, authentication, or a redirect that breaks the probe.',
    ],
    fixes: [
      'Create a Markdown file served at exactly /llms.txt on the site root host.',
      'Start with a one-paragraph site description, then grouped sections linking the most-cited pages with stable absolute URLs and one-line summaries.',
      'Keep it maintained alongside major content changes: add new cornerstone pages, remove retired ones, and keep summaries accurate.',
      'Serve it as plain text or Markdown with a successful status code and no login requirement.',
    ],
    verification: [
      'A new crawl must record the /llms.txt probe as true and stop emitting this issue type.',
      'Fetch https://your-domain/llms.txt in a browser or with curl and confirm the Markdown content loads without redirects to another path.',
      'Confirm the listed links resolve and describe pages that still exist.',
    ],
    cautions: [
      'Do not stuff the file with every URL on the site. A curated map of key pages is useful; a sitemap dump is noise.',
      'Do not include URLs meant to stay private. Anything listed here is an invitation to fetch and cite it.',
      'The convention is young and tool support varies; treat the file as helpful guidance to answer engines, not as a control mechanism with guaranteed effects.',
    ],
    example: {
      label: 'Small /llms.txt in Markdown',
      code: `# Example Cycles

Independent workshop guides for bicycle maintenance and repair.

## Guides
- [Bleeding hydraulic disc brakes](https://example.com/guides/bleed-hydraulic-disc-brakes/): yearly service and spongy-lever fixes.
- [Torque settings for alloy stems](https://example.com/blog/torque-settings-alloy-stems/): values and tightening order.
`,
    },
    references: [
      { label: 'llms.txt specification proposal', url: 'https://llmstxt.org/' },
    ],
    relatedIssueTypes: ['missing_website_schema', 'missing_org_identity_schema', 'weak_open_graph_coverage'],
  },
  {
    issueType: 'missing_about_page',
    pillar: 'aeo',
    bucket: 'experience',
    title: 'Site has no discoverable about page',
    summary:
      'No crawled URL looks like an about page, so visitors and answer engines cannot find a page explaining who is behind the site.',
    scope: 'site',
    explanation: [
      'An about page answers the most basic trust question: who publishes this? It names the people or organization, states what the site does, and gives its background in a few paragraphs.',
      'For answer engines assembling attributed answers, a clear about page is the human-readable counterpart of organization schema: the place a who-is-this claim can be checked.',
      'The detector matches purely on URL substrings after lowercasing: /about, /company, or /team anywhere in the crawled URLs. Page titles and content are not examined.',
      'Because matching is URL-only, an existing story page at /our-story does not satisfy the check even if its content is a perfect about page.',
    ],
    detection: [
      'The detector scans every crawled URL lowercased and flags the site when none contains /about, /company, or /team.',
      'Only crawled pages count. An about page that exists but is unlinked, blocked, or otherwise uncrawled does not clear the flag.',
      'This is a site-wide finding attached to the representative page, not a verdict on any individual page.',
    ],
    causes: [
      'The site genuinely has no about page; the story lives only on the homepage or social profiles.',
      'An about page exists at an unmatched path such as /our-story, /who-we-are, or /manifesto.',
      'The about page is excluded from crawling by robots rules or sits orphaned with no internal links pointing at it.',
    ],
    fixes: [
      'Publish an about page at a matching path (for example /about/) that names who runs the site, what it publishes, and why readers should trust it.',
      'Include real specifics: names, location, history, editorial standards, and a contact route. Vague mission statements alone answer little.',
      'Link the page from site navigation or the footer so both visitors and crawlers reach it reliably.',
      'If the page already exists at an unmatched URL, either move it to a matching path with a redirect or accept the flag as a naming trade-off.',
    ],
    verification: [
      'A new crawl must discover a URL containing one of the three fragments and stop emitting this issue type.',
      'Confirm the page is linked from navigation and loads without login or blocking rules.',
      'Read the page as a stranger and check it actually explains who is behind the site.',
    ],
    cautions: [
      'Do not create a thin /about/ stub that only says welcome to our site. A stub satisfies the detector while failing every human reader.',
      'Keep the page current after team or ownership changes. A stale about page misleads more than none at all.',
      'If the brand deliberately uses an unconventional slug for editorial reasons, document the choice; the flag then records a trade-off rather than an oversight.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['missing_contact_page', 'missing_policy_page', 'homepage_missing_org_contact_trust_signals'],
  },
  {
    issueType: 'missing_contact_page',
    pillar: 'aeo',
    bucket: 'experience',
    title: 'Site has no discoverable contact page',
    summary:
      'No crawled URL looks like a contact page, so visitors and answer engines cannot find a reliable way to reach the people behind the site.',
    scope: 'site',
    explanation: [
      'A contact page gives every visitor a working route to a human: a form, an email address, a phone number, or a staffed support channel. Reachability is one of the simplest trust signals a site can offer.',
      'Answer engines treat contactability as evidence that a publisher stands behind its content. Anonymous sites with no contact route read as less accountable.',
      'The detector matches purely on URL substrings after lowercasing: /contact or /support anywhere in the crawled URLs. Content and link targets outside crawled URLs are not examined.',
      'A contact link pointing to an external helpdesk or a social profile does not satisfy the check unless a matching URL was itself crawled as part of the site.',
    ],
    detection: [
      'The detector scans every crawled URL lowercased and flags the site when none contains /contact or /support.',
      'Only crawled pages count, so an unlinked, blocked, or uncrawled contact page leaves the flag in place.',
      'This is a site-wide finding attached to the representative page.',
    ],
    causes: [
      'Contact details live only in the footer or on social profiles with no dedicated page.',
      'A contact page exists at an unmatched path such as /get-in-touch, /hello, or /help.',
      'A support portal on a subdomain was never part of the crawled scope.',
      'The contact page requires login or sits behind rules that keep it out of the crawl.',
    ],
    fixes: [
      'Publish a contact page at a matching path (for example /contact/) with at least one monitored contact route and a stated response expectation.',
      'Test the route genuinely: submit the form or write to the address and confirm a reply arrives.',
      'Link the page from the footer and, where relevant, the main navigation so it is reachable within one click from anywhere.',
      'If support lives externally, keep the on-site contact page as the front door that routes visitors there.',
    ],
    verification: [
      'A new crawl must discover a URL containing /contact or /support and stop emitting this issue type.',
      'Confirm the page loads publicly and every listed contact route works.',
      'Confirm the page is linked from the site chrome rather than orphaned.',
    ],
    cautions: [
      'Do not list an unmonitored inbox or a broken form. A contact page that never answers is worse than none.',
      'Protect listed addresses with basic spam defenses, but keep the route usable without an account where possible.',
      'If the business intentionally centralizes contact on an external portal, document the choice; the flag then records a scoping trade-off.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['missing_about_page', 'missing_policy_page', 'homepage_missing_org_contact_trust_signals'],
  },
  {
    issueType: 'missing_policy_page',
    pillar: 'aeo',
    bucket: 'experience',
    title: 'Site has no discoverable policy pages',
    summary:
      'No crawled URL looks like a privacy, terms, or policy page, leaving the site rules and data practices unstated where visitors would look.',
    scope: 'site',
    explanation: [
      'Policy pages state the terms of the relationship: what data is collected and why, what rules govern use of the site, and what buyers or users can expect. Their presence signals an accountable publisher.',
      'For sites with forms, accounts, analytics, or commerce, a privacy notice is often a legal requirement as well as a trust signal; terms pages set expectations before disputes arise.',
      'The detector matches purely on URL substrings after lowercasing: /privacy, /terms, /policy, or /policies anywhere in the crawled URLs.',
      'Matching is URL-only and low severity. One matching page clears the flag, but genuine coverage usually means both a privacy notice and terms.',
    ],
    detection: [
      'The detector scans every crawled URL lowercased and flags the site when none contains any of the four fragments.',
      'Only crawled pages count; an unlinked or uncrawled policy page does not clear the flag.',
      'This is a site-wide finding attached to the representative page.',
    ],
    causes: [
      'Policy pages were never written, which is common on young brochure sites.',
      'Policies exist at unmatched paths or inside a PDF or external generator link that was never crawled as a site page.',
      'A redesign dropped the footer policy links, orphaning pages that still exist.',
    ],
    fixes: [
      'Publish a privacy notice describing what data is collected, why, how long it is kept, and how visitors can request changes or deletion.',
      'Publish terms covering acceptable use, purchase or service terms where relevant, and a contact route for questions.',
      'Place both at matching paths (for example /privacy/ and /terms/) and link them from the footer of every page.',
      'Have the texts reviewed for the jurisdictions the site actually serves rather than copying a stranger template verbatim.',
    ],
    verification: [
      'A new crawl must discover a matching URL and stop emitting this issue type.',
      'Confirm the footer links reach the policies from an arbitrary page and that the pages load publicly.',
      'Review the content for accuracy: named services, retention periods, and contact details must be true.',
    ],
    cautions: [
      'A copied policy that misdescribes actual practices creates legal exposure, not compliance. Write what the site truly does.',
      'Keep policies updated when analytics, processors, or data practices change. A dated policy quietly becomes a false statement.',
      'This flag checks discoverability, not legal sufficiency. Clearing it does not mean the policies meet any particular law.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
    ],
    relatedIssueTypes: ['missing_about_page', 'missing_contact_page', 'homepage_missing_org_contact_trust_signals'],
  },
  {
    issueType: 'homepage_missing_org_contact_trust_signals',
    pillar: 'aeo',
    bucket: 'trust',
    title: 'Homepage shows no core trust identity signals',
    summary:
      'The homepage fails every basic identity check at once: no organization schema anywhere, no about or contact coverage, and no publisher identity in its own markup.',
    scope: 'site',
    explanation: [
      'The homepage is where most visitors and many answer engines first meet the publisher. When it carries no identifiable entity, no route to about or contact pages, and no publisher markup, the whole site reads as anonymous.',
      'The flag requires all four conditions to hold together: no organization identity schema on any crawled page, no about page discovered, no contact page discovered, and the homepage own JSON-LD lacking article publisher identity (no non-empty author, publisher, or mainEntityOfPage on an article-like node).',
      'Breaking any single condition intentionally clears the flag, which makes this a composite tripwire: each missing signal alone is reported by its own issue type, and this one fires only when everything is missing at once.',
      'The finding is still sitewide: it depends on crawl-wide facts and clears when any one condition breaks anywhere. It attaches to the homepage row because the homepage is the page a visitor would judge.',
    ],
    detection: [
      'The detector first identifies the homepage as a crawled page with zero URL path segments, then tests the four conditions together.',
      'If no homepage was crawled, the flag cannot fire at all, regardless of the other signals.',
      'Because it depends on site-wide facts (org schema, about and contact discovery), it can only be evaluated across a full crawl, not from one page in isolation.',
    ],
    causes: [
      'A new or minimal site launched with a bare homepage and deferred all identity work.',
      'A one-page or landing-style homepage carries no schema and links to no about or contact pages.',
      'A redesign removed the organization block and the about and contact links in one pass.',
    ],
    fixes: [
      'Add an organization identity node (Organization with name, url, and logo) to the homepage or site-wide schema.',
      'Publish about and contact pages at discoverable paths and link them from the homepage or site footer.',
      'Give the homepage own JSON-LD a publisher identity so the page introduces its publisher directly.',
      'Any one of these clears the composite flag, but doing all three is the actual goal; the flag is a tripwire, not a checklist of one.',
    ],
    verification: [
      'A new crawl must break at least one of the four conditions and stop emitting this issue type for the homepage.',
      'Confirm each added signal independently: schema in view-source, about and contact URLs discovered, publisher field present.',
      'Check the companion flags too; clearing this composite while siblings remain means identity work is only partly done.',
    ],
    cautions: [
      'Do not clear this with the cheapest single condition (for example a stub about page) and declare identity solved. Each signal should genuinely exist.',
      'Intentional anonymity is a legitimate choice for some sites, but it trades away the trust these signals build. Make it a decision, not an accident.',
      'Keep every added signal truthful and maintained; a fabricated organization or dead contact route harms more than absence.',
    ],
    references: [
      { label: 'Google: Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
      { label: 'schema.org: Organization', url: 'https://schema.org/Organization' },
    ],
    relatedIssueTypes: ['missing_org_identity_schema', 'missing_about_page', 'missing_contact_page'],
  },
];
