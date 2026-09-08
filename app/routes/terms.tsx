import { Link } from "react-router"

import { RevserpLogoLink } from "~/components/revserp-logo"

const LAST_UPDATED = "September 8, 2026"

type TermsSection = {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

const sections: TermsSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    paragraphs: [
      "These Terms of Service (“Terms”) govern access to and use of RevSerp, including our website, application, APIs, and related services (collectively, the “Service”). By creating an account, accepting an invite, or using the Service, you agree to these Terms.",
      "If you use the Service on behalf of an organization, you represent that you have authority to bind that organization, and “you” includes the organization and its authorized users.",
    ],
  },
  {
    id: "service",
    title: "The Service",
    paragraphs: [
      "RevSerp is a workspace-based website analysis platform. Depending on your plan and organization settings, the Service may include project management, website crawls, SEO/AEO/PageSpeed scoring, issue tracking, site-graph views, exports, optional Google Search Console reporting, optional Google PageSpeed Insights enrichment, AI chat grounded in your project data, AI question generation, visibility audits, and read-only API access.",
      "Feature availability, quotas, and limits may vary by organization, plan, and administrator configuration. We may change, limit, or discontinue parts of the Service.",
    ],
  },
  {
    id: "accounts",
    title: "Accounts, workspaces, and access",
    paragraphs: [
      "You sign in through our authentication provider. You are responsible for safeguarding your credentials and for activity under your account.",
      "Workspaces are shared environments. Workspace owners can create invite links, connect Google Search Console, and manage certain project settings. Members you invite may be able to view shared project data and perform actions permitted by the Service, including creating or deleting projects, crawls, and AI conversations where the product allows it.",
      "You must provide accurate account information and keep it current. You may not share accounts in a way that violates these Terms or your plan.",
    ],
    bullets: [
      "Invite links may be reusable until they expire, reach a use limit, or are revoked.",
      "Owners are responsible for people they invite into a workspace.",
      "Work reports and contributor information may be visible to authorized workspace users.",
    ],
  },
  {
    id: "your-responsibilities",
    title: "Your responsibilities",
    paragraphs: [
      "You are responsible for how you use the Service and for ensuring that your use complies with applicable law, third-party rights, and the terms of any site, service, or account you connect.",
    ],
    bullets: [
      "Do not submit targets you do not own or are not authorized to crawl, analyze, or process.",
      "Do not use the Service to test, disrupt, burden, evade protections of, or gain unauthorized access to any system.",
      "Do not submit private, internal, localhost, or restricted-network targets.",
      "Do not place passwords, API keys, tokens, or other secrets in project URLs, query strings, prompts, or business-profile fields.",
      "Do not use the Service for unlawful, deceptive, abusive, harassing, or harmful activity.",
      "Do not attempt to interfere with the Service, other users, providers, or target websites.",
      "Review AI output before relying on it or publishing it.",
    ],
  },
  {
    id: "crawling",
    title: "Website crawling and submitted targets",
    paragraphs: [
      "When you submit a project URL, you authorize RevSerp to access and process that site and related public resources needed to operate the Service. RevSerp does not verify domain ownership before crawling.",
      "Unless you enable robots.txt honoring for page crawling, page requests may proceed without applying robots rules. Even when robots honoring is enabled, it applies to normal page crawling only; support requests such as robots.txt discovery, sitemap retrieval, llms.txt checks, and soft-404 probes are not gated by robots rules. Parsed Crawl-delay values are not enforced.",
      "Crawls may use concurrent workers, follow public redirects across hosts within safety limits, fetch non-HTML resources for classification, and selectively render JavaScript through a browser-based renderer when plain HTML appears incomplete. Rendered pages may cause the browser to request scripts, styles, images, analytics, or other referenced resources.",
      "Crawl scope is generally limited to the configured hostname, with apex and www treated as equivalent. External links may be stored but are not normally followed as crawl targets. Query strings may create distinct stored URLs.",
      "We may queue, delay, throttle, cancel, or reject crawls to protect the Service, providers, target sites, and other users.",
    ],
  },
  {
    id: "ai",
    title: "AI features",
    paragraphs: [
      "AI chat, question generation, and visibility audits send prompts and relevant project context to third-party model providers configured for the Service, such as DeepSeek and OpenRouter-backed models. Depending on enabled tools, that context may include crawl results, issues, page content, business-profile data, issue-work records, Search Console metrics, and your messages.",
      "AI output may be incomplete, incorrect, outdated, biased, or unsuitable. It is not legal, financial, medical, security, or other professional advice. Scores, recommendations, and visibility results are heuristic product outputs and do not guarantee rankings, traffic, indexing, compliance, or business results.",
      "Authorized AI interactions may update a project business profile when a workspace owner clearly requests that change through the product flow. You remain responsible for reviewing and approving changes.",
      "AI usage is subject to organization quotas, concurrency limits, message-size limits, and provider availability. These controls are not a general API rate limit.",
    ],
  },
  {
    id: "third-parties",
    title: "Third-party services",
    paragraphs: [
      "The Service relies on third parties, which may include authentication providers, customer websites, Google OAuth and APIs, AI model providers, and browser-rendering components. Third-party services may change availability, impose limits, return incomplete data, or apply their own terms.",
      "If you connect Google Search Console, you authorize RevSerp to access the selected property using the granted read-only scope. Disconnecting a project removes the project selection but may not revoke the organization-level Google connection or delete stored tokens unless separately removed.",
      "If PageSpeed Insights is enabled, RevSerp may send your project’s public origin URL to Google for analysis. Google independently fetches and analyzes that URL.",
    ],
  },
  {
    id: "api-keys",
    title: "API keys",
    paragraphs: [
      "If you use the read-only API, you are responsible for protecting setup codes and API keys, revoking exposed keys, and all activity performed with your keys. API access is subject to workspace permissions, documented read endpoints, and any plan or safety limits we apply.",
    ],
  },
  {
    id: "data",
    title: "Data, retention, and deletion",
    paragraphs: [
      "The Service stores account, workspace, crawl, issue, AI, integration, and operational data needed to provide the features described here. Many records remain until you delete the parent project, crawl, conversation, or account-related object, or until we remove them under these Terms or applicable law.",
      "Deleting a project or crawl removes associated project-scoped records, subject to database behavior and preserved historical references where the product retains anonymized or delinked records. Administrative account actions may restrict access without immediately erasing all stored data.",
      "Exports available in the product are limited to the formats and scopes the Service provides. Additional privacy or data-subject requests may require separate processes described in our Privacy Policy when published.",
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    paragraphs: [
      "THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, REVSERP DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.",
      "We do not warrant that crawls, scores, AI output, integrations, or exports will be uninterrupted, error-free, complete, current, or suitable for any particular purpose.",
    ],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, REVSERP AND ITS SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS.",
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, REVSERP’S TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF THE AMOUNTS YOU PAID REVSERP FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR ONE HUNDRED U.S. DOLLARS.",
    ],
  },
  {
    id: "termination",
    title: "Suspension and termination",
    paragraphs: [
      "We may investigate, restrict, suspend, or terminate access to the Service if we reasonably believe you violated these Terms, created risk for RevSerp or others, or need to protect the Service, providers, or target systems.",
      "You may stop using the Service at any time. Provisions that by their nature should survive termination will survive, including ownership, disclaimers, limitations of liability, and governing provisions.",
    ],
  },
  {
    id: "changes",
    title: "Changes",
    paragraphs: [
      "We may update the Service and these Terms from time to time. If we make material changes, we will provide notice by posting the updated Terms and updating the “Last updated” date, or by another reasonable method. Continued use after the effective date of updated Terms constitutes acceptance, except where applicable law requires otherwise.",
    ],
  },
  {
    id: "general",
    title: "General",
    paragraphs: [
      "These Terms are the entire agreement between you and RevSerp regarding the Service, except for any separate written agreement that expressly overrides them.",
      "If any provision is held unenforceable, the remaining provisions remain in effect. Our failure to enforce a provision is not a waiver.",
      "Contact us through the support channel we make available in the product for questions about these Terms.",
    ],
  },
]

function TermsHeader() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-b border-white/[0.06] bg-[#050505]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10">
        <RevserpLogoLink />
        <nav className="flex items-center gap-6 text-sm">
          <Link
            to="/"
            className="text-white/55 transition-colors hover:text-white/90"
          >
            Home
          </Link>
          <Link
            to="/login"
            prefetch="intent"
            className="text-white/55 transition-colors hover:text-white/90"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  )
}

export default function TermsPage() {
  return (
    <div className="min-h-svh bg-[#050505] text-white antialiased">
      <TermsHeader />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20 md:px-10 md:pt-32 md:pb-28">
        <div className="mb-12 border-b border-white/[0.08] pb-10">
          <p className="text-sm text-white/45">Legal</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-white/45">
            Last updated {LAST_UPDATED}
          </p>
          <p className="mt-6 text-base leading-relaxed text-white/58">
            These Terms describe how you may use RevSerp. They are written for
            customers and workspace users. A separate Privacy Policy may apply
            to personal data processing.
          </p>
        </div>

        <div className="space-y-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="text-xl font-medium tracking-[-0.02em] text-white/92">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/56 md:text-[0.95rem]">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-5 text-white/52">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-white/[0.08] pt-8">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 text-sm text-white/70"
          >
            <span
              aria-hidden
              className="transition-transform group-hover:-translate-x-0.5"
            >
              ←
            </span>
            <span className="border-b border-white/25 pb-0.5 transition-colors group-hover:border-white/50">
              Back to home
            </span>
          </Link>
        </div>
      </main>
    </div>
  )
}
