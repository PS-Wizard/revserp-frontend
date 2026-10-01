import { useState } from "react";

import type { AuditPdfData } from "~/components/audit-pdf/AuditPdfDocument";

export const handle = { hideFromNav: true };

const MOCK_DATA: AuditPdfData = {
  baseUrl: "https://example.com",
  commentary: {
    aeo: {
      concerns: ["FAQ schema missing on 6 key pages."],
      recommendations: [
        "Add FAQPage structured data to top 10 question-led pages.",
        "Draft concise 40-word answers for featured-snippet targets.",
      ],
      strengths: ["Brand queries return correct entity info."],
      summary: "AEO is close behind SEO with schema gaps as the main drag.",
    },
    overall: {
      concerns: ["Thin content on 12 indexed pages."],
      recommendations: [
        "Consolidate thin pages into pillar guides.",
        "Fix the 4 slowest templates flagged by PageSpeed.",
      ],
      strengths: ["Crawl health is solid across 148 URLs."],
      summary: "Overall 78 — healthy crawl, content depth is the lever.",
    },
    pagespeed: {
      concerns: ["LCP over 2.5s on mobile for listing pages."],
      recommendations: [
        "Preload hero images and defer below-fold scripts.",
      ],
      strengths: ["CLS passes on all sampled pages."],
      summary: "PageSpeed 71 — interactivity is fine, LCP needs work.",
    },
    seo: {
      concerns: ["Duplicate titles on paginated archives."],
      recommendations: [
        "Add self-referencing canonicals to paginated series.",
      ],
      strengths: ["Titles and H1s are unique on money pages."],
      summary: "SEO 82 — metadata is strong, pagination needs canonicals.",
    },
  },
  model: "spike-mock",
  pillars: [
    {
      buckets: [
        { id: "titles", label: "Titles", score: 88 },
        {
          affectedUrlCount: 9,
          id: "meta",
          label: "Meta descriptions",
          score: 74,
        },
      ],
      id: "seo",
      label: "SEO",
      score: 82,
    },
    {
      buckets: [
        {
          affectedUrlCount: 6,
          id: "schema",
          label: "Schema coverage",
          score: 69,
        },
      ],
      id: "aeo",
      label: "AEO",
      score: 76,
    },
  ],
  projectName: "Example Audit",
  quarter: "Q3 2026",
  reportDate: "September 30, 2026",
  scores: { aeo: 76, overall: 78, pagespeed: 71, seo: 82 },
  urlsCrawled: 148,
};

export default function DevAuditPdfRoute() {
  const [status, setStatus] = useState("idle");

  const handleDownload = async () => {
    setStatus("rendering…");
    try {
      const { renderAuditPdf } = await import(
        "~/components/audit-pdf/AuditPdfDocument"
      );
      const bytes = await renderAuditPdf(MOCK_DATA);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "audit-spike.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`done — ${(bytes.length / 1024).toFixed(1)} KB`);
    } catch (error) {
      setStatus(`error — ${error instanceof Error ? error.message : error}`);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", margin: "48px auto", maxWidth: 560 }}>
      <h1>Audit PDF spike (dev only)</h1>
      <p>
        Renders the Takumi <code>AuditPdfDocument</code> with mock data and
        downloads <code>audit-spike.pdf</code>.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === "rendering…"}
      >
        Download PDF
      </button>
      <p>
        Status: <code>{status}</code>
      </p>
    </div>
  );
}
