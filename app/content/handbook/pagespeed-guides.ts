import type { HandbookGuide } from "./handbook-types";

export const pageSpeedHandbookGuides: HandbookGuide[] = [
  {
    issueType: "slow_response_time",
    pillar: "pagespeed",
    bucket: "server_responsiveness",
    title: "Slow server response time",
    summary:
      "The crawl fetched this page in over 1000 milliseconds. The delay is server or network time, not page content weight, so image compression alone will not fix it.",
    scope: "page",
    explanation: [
      "Response time is how long the crawl waited from sending the request until the full page body arrived. It covers the server thinking, the database answering, and the bytes travelling over the network. It does not measure how long a browser then takes to paint the page.",
      "Revserp flags a page when its stored response time is strictly over 1000 milliseconds. A page at exactly 1000 ms does not flag. The issue row states the measured milliseconds, so you can see how far over the line a page is.",
      "This is a single sample taken at crawl time, not an average or a percentile. One slow fetch can come from a busy moment on the server rather than a permanent problem, which is why comparing several pages and several crawls matters before you rebuild anything.",
    ],
    detection: [
      "Open the issue row and read the details line, which reports the measured time such as 1840ms. That number is the stored fetch duration for that page in that crawl.",
      "Compare response times across many pages before blaming one template. If every page is slow, the cause is likely the server or hosting. If only one section is slow, the cause is likely that section's queries or plugins.",
    ],
    causes: [
      "Slow application work: uncached database queries, heavy plugins or middleware, and unoptimized server code that runs on every request.",
      "Missing or misconfigured caching: pages rebuilt from scratch on each visit instead of served from a page cache, CDN cache, or object cache.",
      "Weak or distant hosting: an overloaded shared server, a server far from the visitor, or slow upstream APIs that block the response.",
    ],
    fixes: [
      "Find the slowest templates first using the issue details, then profile those routes on the server to see which query or call costs the most time.",
      "Add caching where it is missing: page cache for anonymous traffic, object cache for repeated queries, and CDN caching for static and semi-static pages.",
      "Move slow work out of the request path: queue emails, reports, and bulk updates as background jobs instead of running them while the visitor waits.",
      "Upgrade or move hosting only after measurement shows the server itself is the bottleneck rather than the application code.",
    ],
    verification: [
      "Run a new crawl after the change and check that the same URL no longer reports slow_response_time, with the details at or under 1000 ms.",
      "Old rows stay as history. A fixed page is only confirmed clear by the newer crawl, never by the act of changing the server.",
    ],
    cautions: [
      "Shrinking images does not fix this timer: payload size and response time are separate measurements, and a lighter page on a slow server still flags.",
      "A recrawl that returns an unchanged page can reuse the earlier stored timing, so verify against a crawl that actually refetched the page with new content or headers.",
      "Do not disable security checks, logging, or rate limiting just to shave milliseconds; a slightly slower safe page beats a fast exposed one.",
    ],
    references: [
      {
        label: "Google: Optimize Time to First Byte",
        url: "https://web.dev/articles/optimize-ttfb",
      },
      {
        label: "MDN: Response times and Time to First Byte",
        url: "https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work",
      },
    ],
    relatedIssueTypes: [
      "moderate_page_size",
      "large_page_size",
      "google_psi_mobile_performance",
      "google_psi_tti",
    ],
  },
  {
    issueType: "moderate_page_size",
    pillar: "pagespeed",
    bucket: "page_weight",
    title: "Moderately large page size",
    summary:
      "This page's fetched HTML body is over 1 MiB but under 3 MiB. It is a warning to trim weight now, before the page grows into the high-severity large-page flag.",
    scope: "page",
    explanation: [
      "Page size here means the raw fetched document body measured in bytes: the length of the response body as received, counted with Go len, which counts bytes rather than visible characters. It does not include images, stylesheets, or scripts loaded afterwards.",
      "Revserp flags moderate_page_size when the stored size is strictly over 1 MiB (1048576 bytes) and at or under 3 MiB. The details line shows megabytes with one decimal and the note recommended: under 1MB.",
      "The displayed megabytes are rounded to one decimal from a 1024-based conversion, while the flag uses the exact byte count. A page shown as 1.0MB can still flag if its exact size is just over the boundary, so trust the flag rather than the rounded display.",
    ],
    detection: [
      "Read the issue details for the reported size, then view the page source to see what dominates the document: inline scripts, embedded data, or long repetitive markup.",
      "Check whether the bulk is real content or machinery. A long article is legitimately large; a short article with a megabyte of inline tracking code is not.",
    ],
    causes: [
      "Heavy inline payloads: large inline scripts, embedded JSON state, or base64-encoded assets pasted directly into the HTML.",
      "Plugin and builder bloat: page builders and plugins that inject their full markup, styles, and settings into every page whether used or not.",
      "Legitimately long content: in-depth guides and documentation carry more markup, which can push an honest page just over the line.",
    ],
    fixes: [
      "Move large inline scripts and data blobs to external files with caching, keeping only the minimum boot code in the document.",
      "Remove plugins, widgets, and embeds the page does not use, and switch heavy builders to leaner templates where the weight comes from machinery rather than content.",
      "Split genuinely long content across linked pages or paginated sections only if readers benefit; do not cut useful content merely to satisfy the byte count.",
    ],
    verification: [
      "Run a new crawl and confirm the same URL no longer reports moderate_page_size, with the stored size at or under 1 MiB.",
      "Old rows stay as history. Only the newer crawl confirms the page is clear.",
    ],
    cautions: [
      "Lazy-loading below-the-fold images does not change this number, because the measurement covers the initial HTML body only.",
      "Do not strip content, structured data, or accessibility markup to chase the threshold; a useful heavier page is better than a thin fast one that serves nobody.",
      "A page over 3 MiB reports large_page_size instead, never both flags at once, so a missing moderate row on a huge page means escalation, not health.",
    ],
    references: [
      {
        label: "Lighthouse: Total byte weight",
        url: "https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight",
      },
      {
        label: "Google: Optimize resource loading",
        url: "https://web.dev/articles/fast",
      },
    ],
    relatedIssueTypes: ["large_page_size", "slow_response_time"],
  },
  {
    issueType: "large_page_size",
    pillar: "pagespeed",
    bucket: "page_weight",
    title: "Large page size",
    summary:
      "This page's fetched HTML body is over 3 MiB. That is a heavy document that slows every downstream step, and it takes precedence over the moderate-size warning.",
    scope: "page",
    explanation: [
      "Page size here means the raw fetched document body measured in bytes: the length of the response body as received, counted with Go len, which counts bytes rather than visible characters. It does not include images, stylesheets, or scripts loaded afterwards.",
      "Revserp flags large_page_size when the stored size is strictly over 3 MiB (3145728 bytes). Because the check is an either-or comparison, a page over 3 MiB emits only this high-severity flag and never the moderate one alongside it.",
      "The details line shows megabytes with one decimal and the note recommended: under 3MB, converted on a 1024 basis. A multi-megabyte HTML document is unusual and almost always means embedded payloads rather than prose: no article text alone reaches 3 MiB.",
    ],
    detection: [
      "Read the issue details for the reported megabytes, then download or view the page source and look for the largest blocks: inline scripts, embedded state objects, or base64 media.",
      "Search the source for very long lines or repeated injected blocks. A single inline payload of several megabytes usually stands out immediately by size.",
    ],
    causes: [
      "Embedded binaries or data: base64-encoded images, PDFs, fonts, or large JSON datasets pasted into the HTML instead of served as separate files.",
      "Duplicated framework state: client frameworks or builders serializing the whole page state inline on top of already-rendered markup.",
      "Stacked plugin output: several plugins each injecting their full libraries, settings, and markup into the same document.",
    ],
    fixes: [
      "Extract embedded binaries and datasets into separate cached files or API responses loaded on demand, leaving the document as markup plus references.",
      "Disable or replace the plugins and builder features responsible for the bulk, keeping only what the page visibly uses.",
      "Compress what remains: minify markup, drop dead code, and remove duplicated state so the document carries each fact once.",
    ],
    verification: [
      "Run a new crawl and confirm the same URL no longer reports large_page_size, with the stored size at or under 3 MiB.",
      "If the page drops under 1 MiB both size flags clear; between 1 and 3 MiB the moderate flag remains, which is progress but not completion.",
    ],
    cautions: [
      "Lazy-loading below-the-fold images does not change this number, because the measurement covers the initial HTML body only.",
      "Do not delete structured data, accessibility attributes, or content the page needs just to pass the byte check; fix the embedded payloads instead.",
      "There is no false positive beyond a genuinely heavy payload: the boundary is exact, so a flagged page really is that large.",
    ],
    example: {
      label: "Inline image replaced with a file reference",
      code: "<!-- Before: megabytes of base64 inside the document -->\n<!-- <img src=\"data:image/png;base64,iVBOR...\"> -->\n\n<!-- After: the document carries a reference instead -->\n<img src=\"/images/hero.png\" alt=\"Team at work\" width=\"1200\" height=\"630\">",
    },
    references: [
      {
        label: "Lighthouse: Total byte weight",
        url: "https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight",
      },
      {
        label: "MDN: Content-Length header",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Length",
      },
    ],
    relatedIssueTypes: ["moderate_page_size", "slow_response_time"],
  },
  {
    issueType: "google_psi_mobile_performance",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Google mobile PageSpeed score needs attention",
    summary:
      "Google's lab test of the site origin scored under 90 on mobile. This is an origin-level snapshot of the tested template, not a verdict on every page.",
    scope: "origin",
    explanation: [
      "When a PageSpeed API key is configured, Revserp asks Google PageSpeed Insights for one mobile run against the site origin, meaning the normalized origin root such as https://example.com/, and stores it with the crawl. The row's URL is that tested origin address, not each affected page.",
      "A score under 50 reports high severity and 50 to 89 reports medium; 90 or more emits no issue at all. The score is the Lighthouse performance category scaled to 0-100 and rounded, combining the individual lab metrics into one headline number.",
      "These are lab results from Google's simulated mobile device, not measurements from real visitors. Lab data is stable and reproducible, which makes it good for before-and-after checks, but it can differ from what field visitors experience on real networks and phones.",
    ],
    detection: [
      "Read the issue details for the reported score and the row URL, which names the PSI-tested origin address rather than every page you must fix.",
      "Open the same origin URL in Google PageSpeed Insights yourself to see the full lab report, including which individual metrics drag the headline score down.",
    ],
    causes: [
      "Whichever lab metric is worst dominates the score: usually slow paint, large payloads, render-blocking scripts, or layout instability on the tested template.",
      "Template-wide weight: themes, builders, and sitewide scripts load on the tested homepage and therefore drag the single origin run.",
      "Slow origin response during the lab run: Google's test fetches your site live, so a struggling server at test time lowers the score.",
    ],
    fixes: [
      "Treat the individual metric issues alongside this one, starting with the worst: paint timings, then interactivity, then stability.",
      "Slim the tested template first: remove unused sitewide scripts, defer non-critical JavaScript, and compress hero assets, since template fixes lift the origin run.",
      "Re-check server capacity and caching, because the lab run measures your live server and a slow response hour produces a low score for reasons outside the markup.",
    ],
    verification: [
      "Run a new crawl that includes a fresh PSI run, and confirm the mobile score reaches 90 or more so no performance row is emitted.",
      "Rerunning the crawl without a fresh PSI run does not re-verify the fix. Old rows stay as history either way.",
    ],
    cautions: [
      "Do not claim a site-wide PSI pass from this one origin run; it describes the tested template, and fixing an unrelated page will not clear the row.",
      "If the PSI run failed or no API key is configured, no score issue is emitted at all. A missing row can mean untested, not fast.",
      "Lab scores move with Google's test conditions, so compare runs on the same strategy and similar timing rather than chasing single-point swings.",
    ],
    references: [
      {
        label: "Google: About PageSpeed Insights",
        url: "https://developers.google.com/speed/docs/insights/v5/about",
      },
      {
        label: "Lighthouse performance scoring",
        url: "https://developer.chrome.com/docs/lighthouse/performance/performance-scoring",
      },
    ],
    relatedIssueTypes: [
      "google_psi_fcp",
      "google_psi_lcp",
      "google_psi_tti",
      "google_psi_speed_index",
      "slow_response_time",
    ],
  },
  {
    issueType: "google_psi_fcp",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Slow First Contentful Paint in lab test",
    summary:
      "Google's mobile lab test painted the first content later than 1.8 seconds. First paint is about when something appears, not when the page becomes usable.",
    scope: "origin",
    explanation: [
      "First Contentful Paint marks the moment the browser first renders any text, image, or canvas content. Until that moment the visitor stares at a blank screen, so slow first paint feels like the site is broken even when everything later works.",
      "Revserp flags the stored mobile run when FCP is strictly over 3.0 seconds at high severity or over 1.8 seconds at medium. Passing runs emit nothing. Values are stored in seconds with two decimals, converted from the Lighthouse millisecond audit.",
      "This issue is origin-level: the row's URL is the PSI-tested origin address, and the check runs only when the stored mobile run reports success. Template fixes on the tested page are what move this number.",
    ],
    detection: [
      "Read the issue details for the reported seconds, then run the same origin URL through Google PageSpeed Insights to see the filmstrip and which resources block the first paint.",
      "Check whether the delay is server wait or render blocking: a long gap before anything downloads points at the server, while downloaded-but-unpainted time points at blocking scripts and styles.",
    ],
    causes: [
      "Slow server response or redirects that delay the first byte, leaving the browser with nothing to paint.",
      "Render-blocking stylesheets and synchronous scripts in the document head that stall painting until they finish.",
      "Heavy web fonts or critical CSS delivered late, forcing the browser to wait before showing text.",
    ],
    fixes: [
      "Shorten server time for the tested template with caching and redirect cleanup, since nothing can paint before the document arrives.",
      "Inline critical CSS and defer non-critical styles and scripts so the browser can paint the first content early.",
      "Preload the hero font or use a system-font fallback with font-display: swap so text appears without waiting for font files.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm mobile FCP is at or under 1.8 seconds so no FCP row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the fix.",
    ],
    cautions: [
      "Improving one unrelated page does not clear this row, which belongs to the tested origin template.",
      "Do not remove styles or scripts the page needs just to paint earlier; a fast blank-looking paint that breaks layout is worse than a slightly slower correct one.",
      "Lab FCP is a simulated measurement, so confirm with real-device checks before declaring victory on visitor experience.",
    ],
    references: [
      {
        label: "web.dev: First Contentful Paint",
        url: "https://web.dev/articles/fcp",
      },
      {
        label: "web.dev: Optimize Time to First Byte",
        url: "https://web.dev/articles/optimize-ttfb",
      },
    ],
    relatedIssueTypes: [
      "google_psi_mobile_performance",
      "google_psi_lcp",
      "google_psi_speed_index",
      "slow_response_time",
    ],
  },
  {
    issueType: "google_psi_lcp",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Slow Largest Contentful Paint in lab test",
    summary:
      "Google's mobile lab test painted the largest content later than 2.5 seconds. The largest element, usually the hero image or headline, decides this metric.",
    scope: "origin",
    explanation: [
      "Largest Contentful Paint marks when the biggest visible element, often the hero image, headline block, or video poster, finishes rendering. Visitors judge loading speed by this moment: the page feels ready when its main content appears.",
      "Revserp flags the stored mobile run when LCP is strictly over 4.0 seconds at high severity or over 2.5 seconds at medium. Passing runs emit nothing. Values are stored in seconds with two decimals, converted from the Lighthouse millisecond audit.",
      "This issue is origin-level: the row's URL is the PSI-tested origin address, and the check runs only when the stored mobile run reports success. Find which element is the largest on the tested template before changing anything, because the fix depends on the element type.",
    ],
    detection: [
      "Read the issue details for the reported seconds, then run the same origin URL through Google PageSpeed Insights to see which element Lighthouse names as the largest.",
      "Check how that element loads: hero images delayed by lazy loading, headlines blocked by web fonts, or content injected late by scripts are the classic patterns.",
    ],
    causes: [
      "Slow-loading hero images: uncompressed files, wrong sizes, or lazy loading applied to the very image that should load first.",
      "Blocked rendering: slow server response or render-blocking scripts and styles that push the largest element's paint late.",
      "Late-injected content: hero content rendered by client-side scripts after the initial document, so the browser discovers it late.",
    ],
    fixes: [
      "Make the hero image fast: serve a correctly sized compressed format, preload it, and never lazy-load the largest above-the-fold image.",
      "Stabilize text-based LCP by preloading key fonts or using font-display: swap so the headline paints without waiting.",
      "Render the hero content in the initial server HTML rather than injecting it with client scripts after load.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm mobile LCP is at or under 2.5 seconds so no LCP row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the fix.",
    ],
    cautions: [
      "Improving one unrelated page does not clear this row, which belongs to the tested origin template.",
      "Do not shrink or remove the hero content just to pass the metric; the fix is faster delivery of the same content, not less content.",
      "Lab LCP uses a simulated device, so confirm the hero experience on a real mid-range phone before finishing.",
    ],
    example: {
      label: "Preload the hero image and keep it eager",
      code: "<link rel=\"preload\" as=\"image\" href=\"/images/hero-1200.webp\" fetchpriority=\"high\">\n<img src=\"/images/hero-1200.webp\" alt=\"Product overview\" width=\"1200\" height=\"630\" fetchpriority=\"high\">",
    },
    references: [
      {
        label: "web.dev: Largest Contentful Paint",
        url: "https://web.dev/articles/lcp",
      },
      {
        label: "web.dev: Optimize LCP",
        url: "https://web.dev/articles/optimize-lcp",
      },
    ],
    relatedIssueTypes: [
      "google_psi_mobile_performance",
      "google_psi_fcp",
      "google_psi_speed_index",
      "large_page_size",
    ],
  },
  {
    issueType: "google_psi_cls",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Layout shift in lab test",
    summary:
      "Google's mobile lab test measured layout shifting above 0.1. Shifting content makes visitors tap the wrong thing and reads as broken even when loading is fast.",
    scope: "origin",
    explanation: [
      "Cumulative Layout Shift measures how much visible content jumps around while the page loads. Images without sizes, late ads, and injected banners push text down after the visitor has started reading, which is frustrating out of proportion to the seconds involved.",
      "Revserp flags the stored mobile run when CLS is strictly over 0.25 at high severity or over 0.1 at medium. Passing runs emit nothing. CLS is a unitless score stored with three decimals, not a time in seconds.",
      "This issue is origin-level: the row's URL is the PSI-tested origin address, and the check runs only when the stored mobile run reports success. Shifts depend on the tested template's markup, so fixes land in the template rather than in any single article.",
    ],
    detection: [
      "Read the issue details for the reported score, then run the same origin URL through Google PageSpeed Insights to see the shift filmstrip and which elements move.",
      "Scroll the tested template slowly on a phone-sized viewport: images, embeds, and banners that resize or appear late are visible to the naked eye.",
    ],
    causes: [
      "Media without reserved space: images, videos, and iframes lacking width and height or aspect-ratio boxes, so each load reflows the page.",
      "Late-injected content: cookie banners, ads, related-post blocks, or notification bars inserted above existing content after load.",
      "Font and style swaps: web fonts or late stylesheets that change text metrics and reflow paragraphs after first paint.",
    ],
    fixes: [
      "Reserve space for every image, video, and embed with explicit dimensions or aspect-ratio boxes so loading fills a placeholder instead of pushing content.",
      "Place dynamic blocks such as banners and ads in pre-sized slots below the content start, or overlay them without moving the page.",
      "Match font fallbacks with size-adjust so the web-font swap does not reflow lines, and keep late style changes off the critical path.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm mobile CLS is at or under 0.1 so no CLS row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the fix.",
    ],
    cautions: [
      "Improving one unrelated page does not clear this row, which belongs to the tested origin template.",
      "Some shifts are intentional and user-initiated, such as expanding accordions on tap; CLS measures unexpected shifts during load, so do not remove interactive behavior to chase the score.",
      "Cookie consent and legal banners are required in many regions; reserve their space or overlay them instead of removing them.",
    ],
    example: {
      label: "Reserve space for images and embeds",
      code: "<img src=\"/images/hero-1200.webp\" alt=\"Product overview\" width=\"1200\" height=\"630\">\n<iframe src=\"https://www.youtube.com/embed/abc123\" width=\"560\" height=\"315\" title=\"Demo video\"></iframe>",
    },
    references: [
      {
        label: "web.dev: Cumulative Layout Shift",
        url: "https://web.dev/articles/cls",
      },
      {
        label: "web.dev: Optimize CLS",
        url: "https://web.dev/articles/optimize-cls",
      },
    ],
    relatedIssueTypes: ["google_psi_mobile_performance", "google_psi_lcp"],
  },
  {
    issueType: "google_psi_fid",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Input delay estimate in lab test",
    summary:
      "Google's mobile lab test estimated first-input delay above 100 milliseconds from the max-potential-fid audit. This is a lab estimate, and the underlying data is often unavailable.",
    scope: "origin",
    explanation: [
      "First Input Delay measures the gap between a visitor's first tap or keypress and the browser's response. Long main-thread tasks from heavy JavaScript make the page feel frozen even when it looks fully loaded.",
      "Revserp reads the max-potential-fid Lighthouse audit and flags the stored mobile run when the delay is strictly over 300 ms at high severity or over 100 ms at medium. The details line shows whole milliseconds, converted from the stored seconds value. Passing runs emit nothing.",
      "This data is conditional: max-potential-fid is legacy lab data that Google often no longer returns, and a missing value emits no issue at all. A missing FID row means unmeasured, never fast. This issue is origin-level and runs only when the stored mobile run reports success.",
    ],
    detection: [
      "Read the issue details for the reported milliseconds, then run the same origin URL through Google PageSpeed Insights to see the long-task breakdown behind the estimate.",
      "Check which scripts run longest in the lab report's main-thread work: framework bundles, third-party trackers, and hydration work are the usual suspects.",
    ],
    causes: [
      "Heavy JavaScript bundles that monopolize the main thread during startup, so the first tap waits behind parsing and execution.",
      "Third-party scripts for chat, analytics, and ads that run long tasks before the visitor interacts.",
      "Client-side hydration that re-renders server HTML in the browser, blocking input during the busiest startup seconds.",
    ],
    fixes: [
      "Split bundles and defer non-critical scripts so the main thread is free to answer the first interaction quickly.",
      "Delay third-party widgets until after first interaction or load them on user intent rather than unconditionally at startup.",
      "Reduce hydration cost by shipping static HTML for content areas and hydrating only the interactive components.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm the FID estimate is at or under 100 ms, or that the audit is unavailable, so no FID row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the current state. Never fabricate a current metric when the data is missing.",
    ],
    cautions: [
      "Do not present the absence of an FID row as proof of fast interaction when max-potential-fid data was simply unavailable.",
      "Google's current field metric for responsiveness is Interaction to Next Paint, but this detector reads the legacy max-potential-fid lab audit; interpret the row as a lab signal, not as a field INP verdict.",
      "Do not remove analytics, consent handling, or accessibility scripts just to free the main thread; defer and split them instead.",
    ],
    references: [
      {
        label: "web.dev: First Input Delay",
        url: "https://web.dev/articles/fid",
      },
      {
        label: "web.dev: Interaction to Next Paint",
        url: "https://web.dev/articles/inp",
      },
    ],
    relatedIssueTypes: [
      "google_psi_mobile_performance",
      "google_psi_tti",
      "large_page_size",
    ],
  },
  {
    issueType: "google_psi_speed_index",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Slow Speed Index in lab test",
    summary:
      "Google's mobile lab test filled the visible screen later than 3.4 seconds. Speed Index watches how quickly the whole viewport becomes visually complete.",
    scope: "origin",
    explanation: [
      "Speed Index measures how fast the visible portion of the page fills in, frame by frame. Unlike first paint, which marks the first pixel, Speed Index rewards pages whose above-the-fold content arrives early and together rather than in drips.",
      "Revserp flags the stored mobile run when Speed Index is strictly over 5.8 seconds at high severity or over 3.4 seconds at medium. Passing runs emit nothing. Values are stored in seconds with two decimals, converted from the Lighthouse millisecond audit.",
      "This issue is origin-level: the row's URL is the PSI-tested origin address, and the check runs only when the stored mobile run reports success. Because it reflects the whole viewport, fixes usually span several resource types rather than one image.",
    ],
    detection: [
      "Read the issue details for the reported seconds, then run the same origin URL through Google PageSpeed Insights to watch the loading filmstrip and spot which area fills last.",
      "Compare the filmstrip against the network waterfall: late-finishing regions usually trace to a slow font, a deferred hero, or a blocking script chain.",
    ],
    causes: [
      "Render-blocking chains: stylesheets and scripts that must each finish before the next starts, stretching the visual fill over seconds.",
      "Oversized or excess above-the-fold resources: large hero media, multiple fonts, and carousels that all compete for early bandwidth.",
      "Slow server start combined with late discovery: the document arrives late and then references critical assets the browser only finds afterwards.",
    ],
    fixes: [
      "Break blocking chains by inlining critical CSS, deferring the rest, and loading non-critical scripts after the viewport is complete.",
      "Trim the above-the-fold payload: compress hero media, limit font families and weights, and postpone below-fold components.",
      "Preload the two or three assets the viewport truly needs so the browser fetches them with the document instead of discovering them late.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm mobile Speed Index is at or under 3.4 seconds so no Speed Index row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the fix.",
    ],
    cautions: [
      "Improving one unrelated page does not clear this row, which belongs to the tested origin template.",
      "Do not hide slow content with placeholders that never resolve; Speed Index rewards genuinely complete viewports, and tricks that fool the metric hurt visitors.",
      "Lab Speed Index is simulated, so sanity-check the visual load on a real mid-range phone before finishing.",
    ],
    references: [
      {
        label: "web.dev: Speed Index",
        url: "https://web.dev/articles/speed-index",
      },
      {
        label: "Lighthouse performance scoring",
        url: "https://developer.chrome.com/docs/lighthouse/performance/performance-scoring",
      },
    ],
    relatedIssueTypes: [
      "google_psi_mobile_performance",
      "google_psi_fcp",
      "google_psi_lcp",
      "moderate_page_size",
    ],
  },
  {
    issueType: "google_psi_tti",
    pillar: "pagespeed",
    bucket: "psi_cwv",
    title: "Slow Time to Interactive in lab test",
    summary:
      "Google's mobile lab test found the page usable later than 3.8 seconds. Interactive means taps reliably work, which can lag well behind visual completeness.",
    scope: "origin",
    explanation: [
      "Time to Interactive marks when the page is both visually rendered and responsive: the main thread is quiet enough that taps and typing get prompt answers. A page can look finished yet ignore input for seconds while scripts still run.",
      "Revserp flags the stored mobile run when TTI is strictly over 7.3 seconds at high severity or over 3.8 seconds at medium. Passing runs emit nothing. Values are stored in seconds with two decimals, converted from the Lighthouse interactive audit.",
      "This data is conditional: the interactive audit is legacy lab data that Google often no longer returns, and a missing value emits no issue at all. A missing TTI row means unmeasured, never fast. This issue is origin-level and runs only when the stored mobile run reports success.",
    ],
    detection: [
      "Read the issue details for the reported seconds, then run the same origin URL through Google PageSpeed Insights to see the main-thread work and long tasks delaying interactivity.",
      "Test the tested template on a mid-range phone: buttons that visibly exist but ignore taps during load confirm the metric with your own hands.",
    ],
    causes: [
      "Large JavaScript bundles that parse, compile, and execute for seconds before the page can respond.",
      "Long third-party chains where each tracker or widget delays the quiet-main-thread moment the metric waits for.",
      "Excessive startup work: hydration, feature detection, and eager initialization running before the visitor needs any of it.",
    ],
    fixes: [
      "Ship less JavaScript to the tested template: remove unused code, split routes, and defer everything not needed for the first interaction.",
      "Defer third-party scripts and load heavy widgets on demand so they cannot hold interactivity hostage.",
      "Move startup work later: initialize features lazily and hydrate interactive components only when they approach the viewport or receive focus.",
    ],
    verification: [
      "Run a new crawl with a fresh PSI run and confirm TTI is at or under 3.8 seconds, or that the audit is unavailable, so no TTI row is emitted.",
      "Old rows stay as history; only the newer PSI run confirms the current state. Never fabricate a current metric when the data is missing.",
    ],
    cautions: [
      "Do not present the absence of a TTI row as proof of fast interaction when the interactive audit data was simply unavailable.",
      "Improving one unrelated page does not clear this row, which belongs to the tested origin template.",
      "Do not remove consent, security, or accessibility scripts to reach interactivity sooner; defer and split them instead.",
    ],
    references: [
      {
        label: "web.dev: Time to Interactive",
        url: "https://web.dev/articles/tti",
      },
      {
        label: "web.dev: Reduce JavaScript payloads",
        url: "https://web.dev/articles/reduce-javascript-payloads-with-code-splitting",
      },
    ],
    relatedIssueTypes: [
      "google_psi_mobile_performance",
      "google_psi_fid",
      "google_psi_speed_index",
      "slow_response_time",
    ],
  },
];
