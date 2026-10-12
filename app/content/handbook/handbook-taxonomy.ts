import type { HandbookPillar } from "./handbook-types"

export const handbookPillars: HandbookPillar[] = [
  {
    id: "seo",
    title: "SEO",
    subtitle: "Make your pages easier to find.",
    description:
      "Help search engines understand, reach, and index your pages. Start with the signals in your crawl, then make changes that serve the people who visit your site.",
    buckets: [
      {
        id: "serp_metadata",
        title: "SERP metadata",
        description:
          "Titles and descriptions that explain each page before someone visits it.",
      },
      {
        id: "content_structure",
        title: "Content structure",
        description:
          "Headings that give your content a clear, useful reading order.",
      },
      {
        id: "content_quality",
        title: "Content quality",
        description:
          "Useful main content, with enough substance and a distinct purpose.",
      },
      {
        id: "indexability",
        title: "Indexability",
        description:
          "Canonical URLs and robots directives that express which pages belong in search.",
      },
      {
        id: "technical_seo",
        title: "Technical SEO",
        description:
          "Reliable responses, language settings, and a page that works on small screens.",
      },
      {
        id: "media_optimization",
        title: "Media optimization",
        description:
          "Images that are understandable, accessible, and stable as a page loads.",
      },
      {
        id: "internal_linking",
        title: "Internal linking",
        description:
          "Clear paths between pages, without broken destinations or needless detours.",
      },
    ],
  },
  {
    id: "aeo",
    title: "AEO",
    subtitle: "Make your answers easier to understand.",
    description:
      "Show who is behind your content, support your claims, and describe what each page means. These signals improve clarity; they do not guarantee a citation from an answer engine.",
    buckets: [
      {
        id: "experience",
        title: "Experience",
        description:
          "Site-level context that helps people and automated systems understand your presence.",
      },
      {
        id: "expertise",
        title: "Expertise",
        description:
          "Clear author attribution and publisher identity that agree with the page's structured data.",
      },
      {
        id: "authoritativeness",
        title: "Authoritativeness",
        description:
          "Sources and organizational identity that support the claims in your content.",
      },
      {
        id: "trust",
        title: "Trust",
        description:
          "Secure pages, consistent identity, sharing metadata, and accessible contact information.",
      },
      {
        id: "answerability",
        title: "Answerability",
        description:
          "Structured data that describes the actual content and purpose of your pages.",
      },
    ],
  },
  {
    id: "pagespeed",
    title: "PageSpeed",
    subtitle: "Make the experience feel faster.",
    description:
      "Separate what the crawler measured from what Google's performance report measured. Fix slow responses and oversized HTML, then use the right evidence to check the result.",
    buckets: [
      {
        id: "server_responsiveness",
        title: "Server responsiveness",
        description: "How long the crawler waits for your server to respond.",
      },
      {
        id: "page_weight",
        title: "Page weight",
        description:
          "The size of the downloaded page response, not every asset on the page.",
      },
      {
        id: "psi_cwv",
        title: "Google performance signals",
        description:
          "Origin-level Google PageSpeed Insights signals, with lab and field data kept distinct.",
      },
    ],
  },
]
