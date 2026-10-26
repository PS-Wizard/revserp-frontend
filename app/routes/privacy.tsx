import { Link } from "react-router"

import { RevserpLogoLink } from "~/components/revserp-logo"

const LAST_UPDATED = "October 26, 2026"

type PrivacySection = {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

const sections: PrivacySection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      "This Privacy Policy describes how RevSerp (“RevSerp”, “we”, “us”) collects, uses, stores, and deletes personal data when you use our website, application, APIs, and related services (collectively, the “Service”).",
      "RevSerp is a workspace-based website analysis platform. Depending on your plan, the Service may include project management, website crawls, SEO scoring, issue tracking, optional Google Search Console reporting, optional Google Analytics reporting, and AI chat grounded in your project data.",
    ],
  },
  {
    id: "data-we-collect",
    title: "Data we collect",
    paragraphs: [
      "We collect only data needed to operate the Service:",
    ],
    bullets: [
      "Account data: email address, user ID, and workspace membership from our authentication provider.",
      "Project data: URLs you submit, crawl results, issues, scores, business-profile data, and AI conversation records.",
      "Google account data: your Google account email, Google subject ID, OAuth tokens, granted scopes, and connection status, when you connect Google.",
      "Google API data: Search Console metrics (clicks, impressions, CTR, position, queries, pages) and Google Analytics metrics (read-only), only for properties you select.",
      "Operational data: logs, quotas, and error records needed for security and reliability.",
    ],
  },
  {
    id: "google-data",
    title: "Google data use",
    paragraphs: [
      "If you connect Google, RevSerp requests read-only access with the scopes https://www.googleapis.com/auth/webmasters.readonly and https://www.googleapis.com/auth/analytics.readonly, plus openid and email for sign-in identity.",
      "We use Google data only to display SEO reports inside your own workspace, such as Search Console clicks and impressions and Analytics summaries. We do not sell Google data. We do not share Google data with third parties except our authentication and hosting providers as needed to operate the Service. We do not use Google data for advertising.",
      "Access is limited to members of your workspace. You can disconnect Google at any time from App > Settings > Integrations or by revoking access at https://myaccount.google.com/permissions. Disconnecting stops new reads.",
    ],
  },
  {
    id: "how-we-use",
    title: "How we use data",
    paragraphs: [
      "We use data to provide, maintain, and improve the Service, to enforce quotas and security limits, and to communicate about your account.",
    ],
    bullets: [
      "Operate workspaces, projects, crawls, and reports you request.",
      "Show Google metrics only inside the workspace that connected them.",
      "Send prompts and relevant project context to configured AI model providers when you use AI features.",
      "Prevent abuse, debug errors, and protect the Service.",
    ],
  },
  {
    id: "sharing",
    title: "Sharing",
    paragraphs: [
      "We do not sell personal data. We share data only with service providers needed to run the Service, such as authentication, hosting, and AI model providers, and only for the purposes above. Third-party services apply their own terms.",
    ],
  },
  {
    id: "retention-deletion",
    title: "Retention and deletion",
    paragraphs: [
      "We keep data only while needed for the purposes above. Deleting a project or crawl removes associated project-scoped records, subject to database behavior. Deleting Google data: remove the project binding in RevSerp, delete the organization-level Google connection in Settings > Integrations, and revoke access at https://myaccount.google.com/permissions to invalidate tokens. Contact us to request deletion of account data where applicable law provides that right.",
    ],
  },
  {
    id: "security",
    title: "Security",
    paragraphs: [
      "Google OAuth tokens are encrypted at rest. Access tokens refresh server-side and are never exposed to the browser beyond what the product needs. We restrict access by workspace permissions and apply transport hardening.",
    ],
  },
  {
    id: "contact-changes",
    title: "Contact and changes",
    paragraphs: [
      "For privacy questions or deletion requests, contact us through the support channel in the product. We may update this policy from time to time and will post the updated version here with a new Last updated date.",
    ],
  },
]

function PrivacyHeader() {
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

export default function PrivacyPage() {
  return (
    <div className="min-h-svh bg-[#050505] text-white antialiased">
      <PrivacyHeader />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20 md:px-10 md:pt-32 md:pb-28">
        <div className="mb-12 border-b border-white/[0.08] pb-10">
          <p className="text-sm text-white/45">Legal</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-white/45">
            Last updated {LAST_UPDATED}
          </p>
          <p className="mt-6 text-base leading-relaxed text-white/58">
            This policy covers RevSerp and the Google Search Console and
            Google Analytics data you connect. We read that data only to
            show reports in your workspace.
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
