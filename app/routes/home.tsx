import { useEffect, useRef, type ReactNode } from "react"
import { Link } from "react-router"

import { LandingHeroBackground } from "~/components/landing/landing-hero-background"
import { RevserpLogoLink } from "~/components/revserp-logo"
import { cn } from "~/lib/utils"
import { redirectAuthenticatedUser } from "~/lib/auth.server"

export async function loader({ request }: { request: Request }) {
  return redirectAuthenticatedUser(request)
}

const features = [
  {
    title: "Full-site crawl",
    description:
      "Drop in a URL. Revserp maps pages, links, and structure automatically — no config sprawl.",
  },
  {
    title: "SEO, AEO & PageSpeed",
    description:
      "Three scored pillars with bucket breakdowns, trends, and immutable snapshots for every crawl.",
  },
  {
    title: "AI visibility audits",
    description:
      "See how models answer questions about your business — model-by-model, with a rank matrix.",
  },
  {
    title: "Revbot",
    description:
      "Ask your crawl data anything. Scoped answers from real issues, not generic SEO advice.",
  },
  {
    title: "Site graph",
    description:
      "Explore internal link structure interactively — where authority flows and where it stalls.",
  },
  {
    title: "Search Console",
    description:
      "OAuth-connected organic metrics alongside audit scores, in the same view.",
  },
  {
    title: "Compare",
    description:
      "Stack your scores against competitors across projects without a $500/mo tool chain.",
  },
  {
    title: "Export",
    description:
      "Ship CSV, XLSX, or client-ready PDF audit reports from the browser.",
  },
]

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-visible")
          observer.unobserve(el)
        }
      },
      { threshold: 0.12 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("reveal-hidden", className)}
    >
      {children}
    </div>
  )
}

function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10">
        <RevserpLogoLink />

        <nav className="flex items-center gap-6 text-sm">
          <a
            href="#features"
            className="hidden text-white/55 transition-colors hover:text-white/90 sm:inline"
          >
            Features
          </a>
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

function Hero() {
  return (
    <section className="relative min-h-svh overflow-hidden">
      <div className="absolute inset-0 z-0">
        <LandingHeroBackground />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh max-w-6xl flex-col justify-end px-6 pb-20 pt-28 md:px-10 md:pb-28 md:pt-32">
        <div className="max-w-xl">
          <h1 className="text-[2.35rem] leading-[1.08] font-medium tracking-[-0.03em] text-white md:text-[3.25rem] lg:text-[3.75rem]">
            Fix what search sees before your rankings slip.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-white/58 md:text-[1.05rem]">
            Crawl. Score. Fix. Ask your site anything — across traditional SEO
            and the answer engines rewriting how people discover you.
          </p>

          <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              prefetch="intent"
              className="group inline-flex items-center gap-2 text-sm text-white/90"
            >
              <span className="border-b border-white/35 pb-0.5 transition-colors group-hover:border-white/70">
                Start your first crawl
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <p className="text-sm text-white/45">
              Immutable score snapshots on every audit.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section
      id="features"
      className="border-t border-white/[0.06] bg-[#050505] px-6 py-24 md:px-10 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-16 max-w-lg md:mb-20">
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-white md:text-4xl">
              One workspace for crawl data, scores, and answers.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/48">
              Traditional SEO tools tell you what&apos;s missing. AI search is
              rewriting the rules. Revserp audits both — so you don&apos;t
              optimize for yesterday&apos;s algorithm.
            </p>
          </div>
        </Reveal>

        <div className="divide-y divide-white/[0.06]">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 40}>
              <article className="grid gap-3 py-8 md:grid-cols-[7rem_1fr] md:gap-10 md:py-10">
                <p className="text-sm tabular-nums text-white/28">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-12">
                  <h3 className="text-lg font-medium tracking-[-0.01em] text-white/92">
                    {feature.title}
                  </h3>
                  <p className="max-w-xl text-sm leading-relaxed text-white/46 md:text-[0.95rem]">
                    {feature.description}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-20 md:mt-24" delay={120}>
          <div className="flex flex-col items-start justify-between gap-8 border-t border-white/[0.06] pt-12 md:flex-row md:items-center">
            <p className="max-w-md text-lg leading-snug font-medium tracking-[-0.02em] text-white/88">
              Know what&apos;s broken before Google — and before ChatGPT answers
              without you.
            </p>
            <Link
              to="/signup"
              prefetch="intent"
              className="group inline-flex items-center gap-2 text-sm text-white/90"
            >
              <span className="border-b border-white/35 pb-0.5 transition-colors group-hover:border-white/70">
                Audit your site for free
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/[0.06] bg-[#050505] px-6 py-10 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <RevserpLogoLink className="text-white/75" />
          <p className="max-w-xs text-sm leading-relaxed text-white/38">
            Crawl. Score. Fix. Ask your site anything.
          </p>
        </div>

        <div className="flex flex-col gap-4 text-sm md:items-end">
          <div className="flex items-center gap-5">
            <Link
              to="/login"
              prefetch="intent"
              className="text-white/45 transition-colors hover:text-white/80"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              prefetch="intent"
              className="text-white/45 transition-colors hover:text-white/80"
            >
              Sign up
            </Link>
          </div>
          <p className="text-xs text-white/28">© {year} Revserp</p>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <div className="min-h-svh bg-[#050505] text-white antialiased">
      <Header />
      <main>
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  )
}
