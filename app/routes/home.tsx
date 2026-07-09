import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"
import {
  Asterisk,
  BarChart3,
  Bot,
  Check,
  Globe,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { redirectAuthenticatedUser } from "~/lib/auth.server"

export async function loader({ request }: { request: Request }) {
  return redirectAuthenticatedUser(request)
}

const integrations = [
  "Google Search Console",
  "Google Analytics",
  "WordPress",
  "Shopify",
  "Webflow",
  "Contentful",
]

const solutions = [
  {
    icon: Search,
    title: "Crawl & Audit",
    description:
      "Run deep technical audits across every page. Surface SEO, AEO, and PageSpeed issues with precise evidence and fix guidance.",
  },
  {
    icon: BarChart3,
    title: "Search Console Sync",
    description:
      "Connect Google Search Console to compare crawl findings with real search performance — no more guessing what matters.",
  },
  {
    icon: Bot,
    title: "AI-Guided Fixes",
    description:
      "Turn audit findings into prioritized action plans. Ask Revserp AI scoped questions and get clear, practical answers.",
  },
  {
    icon: Sparkles,
    title: "Answer Engine Optimization",
    description:
      "Optimize how AI answer engines cite your brand. Structure content so it wins in the new wave of generative search.",
  },
]

const steps = [
  {
    title: "Discover",
    description:
      "Map your site architecture and connect the data sources that matter.",
  },
  {
    title: "Diagnose",
    description:
      "Run comprehensive audits that connect technical issues to business impact.",
  },
  {
    title: "Resolve",
    description:
      "Prioritize fixes and use AI guidance to move from insight to action faster.",
  },
  {
    title: "Monitor",
    description:
      "Track changes over time and catch new issues before they hurt visibility.",
  },
]

const faqs = [
  {
    question: "What makes Revserp different from a standard SEO tool?",
    answer:
      "Most tools report metrics. Revserp connects crawl data, Search Console, and AI reasoning into one workflow — so you see why something matters and what to do about it.",
  },
  {
    question: "Do I need an engineering team to use Revserp?",
    answer:
      "No. The interface is built for operators, marketers, and technical leads alike. Complex findings are explained in plain language with prioritized next steps.",
  },
  {
    question: "How does AEO fit into the platform?",
    answer:
      "Answer Engine Optimization is built in from the start. We audit how your content is structured for featured snippets, knowledge panels, and generative AI citations.",
  },
  {
    question: "Can I connect multiple sites and team members?",
    answer:
      "Yes. Revserp is workspace-based. Invite your team, connect multiple properties, and keep everyone aligned on the same visibility data.",
  },
]

function Reveal({
  children,
  className,
  direction,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  direction?: "up" | "left" | "right"
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
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "reveal-hidden",
        direction === "left" && "reveal-left",
        direction === "right" && "reveal-right",
        className
      )}
    >
      {children}
    </div>
  )
}

function HeroBounce({
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
    const timer = setTimeout(() => el.classList.add("is-visible"), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div ref={ref} className={cn("heading-bounce", className)}>
      {children}
    </div>
  )
}

function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-medium">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Asterisk className="size-4" />
          </div>
          Revserp
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#solutions"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Solutions
          </a>
          <a
            href="#method"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Method
          </a>
          <a
            href="#faq"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            render={<Link to="/login" prefetch="intent" />}
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Log in
          </Button>
          <Button render={<Link to="/signup" prefetch="intent" />} size="sm">
            Get started
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-24 md:pt-48 md:pb-32">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <HeroBounce delay={100}>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              AI search visibility
            </span>
          </div>
        </HeroBounce>

        <HeroBounce delay={200}>
          <h1 className="max-w-4xl text-4xl font-medium tracking-tight md:text-6xl lg:text-7xl">
            Gain complete SEO / AEO visibility across your sites.
          </h1>
        </HeroBounce>

        <HeroBounce delay={350}>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Audit, monitor, and improve how search and answer engines understand
            your brand. One workspace for crawls, Search Console, and AI-guided
            fixes.
          </p>
        </HeroBounce>

        <HeroBounce delay={450}>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button render={<Link to="/signup" prefetch="intent" />} size="lg">
              Start free trial
            </Button>
            <a
              href="#solutions"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              <Play className="size-4" />
              See how it works
            </a>
          </div>
        </HeroBounce>

        <Reveal className="mt-16 w-full max-w-4xl" delay={600}>
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-muted/10 p-1 shadow-2xl">
            <div className="rounded-xl border border-border/50 bg-card p-6 text-left">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Site Visibility Score</p>
                  <p className="text-xs text-muted-foreground">
                    Crawl completed just now
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium">
                  <ShieldCheck className="size-3.5" />
                  Healthy
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Technical SEO", status: "No critical issues" },
                  { label: "AEO Readiness", status: "Well structured" },
                  { label: "PageSpeed", status: "Passing Core Web Vitals" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border/60 bg-background/60 p-4"
                  >
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-medium">{item.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function LogoCarousel() {
  return (
    <section className="border-y border-border/50 py-14">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <p className="mb-8 text-center text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Works with your stack
          </p>
        </Reveal>
        <div className="mask-fade-edges relative overflow-hidden">
          <div className="animate-carousel flex items-center gap-16 whitespace-nowrap">
            {integrations.flatMap((name) => [
              <span
                key={`${name}-a`}
                className="text-lg font-medium tracking-tight text-muted-foreground/40"
              >
                {name}
              </span>,
              <span
                key={`${name}-b`}
                className="text-lg font-medium tracking-tight text-muted-foreground/40"
              >
                {name}
              </span>,
            ])}
          </div>
        </div>
      </div>
    </section>
  )
}

function Solutions() {
  const [active, setActive] = useState(0)

  return (
    <section id="solutions" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <Reveal>
            <h2 className="text-3xl font-medium tracking-tight md:text-5xl">
              Our Core Solutions
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              A complete visibility stack for the next generation of search.
            </p>
          </Reveal>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            {solutions.map((solution, index) => {
              const Icon = solution.icon
              const isActive = active === index
              return (
                <button
                  key={solution.title}
                  type="button"
                  onClick={() => setActive(index)}
                  className={cn(
                    "w-full rounded-xl border p-5 text-left transition-all duration-300",
                    isActive
                      ? "border-primary/30 bg-muted/40"
                      : "border-border/50 bg-card hover:border-border hover:bg-muted/20"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        isActive
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/60 bg-background text-muted-foreground"
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium">{solution.title}</h3>
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-300",
                          isActive
                            ? "max-h-40 opacity-100"
                            : "max-h-0 opacity-0"
                        )}
                      >
                        <p className="pt-2 text-sm leading-relaxed text-muted-foreground">
                          {solution.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="relative hidden rounded-2xl border border-border/50 bg-muted/20 p-8 lg:block">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-50" />
            <div className="relative flex h-full items-center justify-center">
              {active === 0 && <CrawlVisual />}
              {active === 1 && <GscVisual />}
              {active === 2 && <AiVisual />}
              {active === 3 && <AeoVisual />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CrawlVisual() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">Crawl progress</span>
        <span className="text-xs text-muted-foreground">Running</span>
      </div>
      <div className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-3/4 rounded-full bg-primary" />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Pages crawled</span>
          <span>Indexing checks</span>
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background p-3 text-xs">
          <Check className="size-3.5 text-emerald-500" />
          Sitemaps validated
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background p-3 text-xs">
          <Check className="size-3.5 text-emerald-500" />
          Mobile usability passed
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background p-3 text-xs">
          <Check className="size-3.5 text-emerald-500" />
          Structured data detected
        </div>
      </div>
    </div>
  )
}

function GscVisual() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card p-6 shadow-lg">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Search Console connected</p>
          <p className="text-xs text-muted-foreground">Real-time sync</p>
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-lg border border-border/50 bg-background p-4">
          <p className="text-xs text-muted-foreground">Crawl finding</p>
          <p className="mt-1 text-sm font-medium">Orphaned product pages</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background p-4">
          <p className="text-xs text-muted-foreground">GSC context</p>
          <p className="mt-1 text-sm font-medium">
            Impressions declining on same URLs
          </p>
        </div>
      </div>
    </div>
  )
}

function AiVisual() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card p-6 shadow-lg">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Revserp AI</p>
          <p className="text-xs text-muted-foreground">
            Scoped to latest crawl
          </p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-2xl rounded-tr-none bg-muted/60 p-4">
          Why did our category pages lose visibility?
        </div>
        <div className="rounded-2xl rounded-tl-none bg-primary/10 p-4 text-foreground">
          Your latest crawl shows missing breadcrumb schema and thin H1s on 42
          category URLs. Fixing these should improve relevance signals.
        </div>
      </div>
    </div>
  )
}

function AeoVisual() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border/50 bg-card p-6 shadow-lg">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">AEO readiness</p>
          <p className="text-xs text-muted-foreground">Answer engine signals</p>
        </div>
      </div>
      <div className="space-y-3">
        {[
          "Entity coverage",
          "FAQ schema",
          "Authoritative citations",
          "Conversational headings",
        ].map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm">
            <Check className="size-4 text-emerald-500" />
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function Method() {
  return (
    <section
      id="method"
      className="border-y border-border/50 bg-muted/20 px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <Reveal>
            <h2 className="text-3xl font-medium tracking-tight md:text-5xl">
              The Method
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              A simple loop that turns raw crawl data into durable search
              visibility.
            </p>
          </Reveal>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => {
            const icons = [Globe, Search, Zap, Target]
            const Icon = icons[index]
            return (
              <Reveal key={step.title} delay={index * 80}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border/50 bg-card p-8 transition-all hover:border-border">
                  <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-border/60 bg-background text-foreground">
                    <Icon className="size-6" />
                  </div>
                  <div className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Step 0{index + 1}
                  </div>
                  <h3 className="mt-2 text-xl font-medium">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-16 text-center">
          <Reveal>
            <h2 className="text-3xl font-medium tracking-tight md:text-5xl">
              Questions & Answers
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Everything you need to know about getting started with Revserp.
            </p>
          </Reveal>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = open === index
            return (
              <Reveal key={faq.question} delay={index * 60}>
                <div className="rounded-xl border border-border/50 bg-card">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-5 text-left"
                  >
                    <span className="pr-4 font-medium">{faq.question}</span>
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 transition-transform duration-300",
                        isOpen && "rotate-45"
                      )}
                    >
                      <span className="text-lg leading-none">+</span>
                    </span>
                  </button>
                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-300",
                      isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <p className="px-5 pb-5 leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl rounded-3xl border border-border/50 bg-muted/20 px-6 py-16 text-center md:px-12">
        <Reveal>
          <h2 className="text-3xl font-medium tracking-tight md:text-5xl">
            Ready to own your search visibility?
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Join teams that use Revserp to turn search data into clear,
            prioritized action.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button render={<Link to="/signup" prefetch="intent" />} size="lg">
              Start free trial
            </Button>
            <Button
              render={<Link to="/login" prefetch="intent" />}
              size="lg"
              variant="outline"
            >
              Log in
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border/50 px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div className="max-w-sm space-y-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Asterisk className="size-4" />
              </div>
              Revserp
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              One workspace for SEO and AEO visibility. Audit, monitor, and
              improve how the world finds you.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Product
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="#solutions"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Solutions
                  </a>
                </li>
                <li>
                  <a
                    href="#method"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Method
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Account
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    to="/login"
                    prefetch="intent"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Log in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/signup"
                    prefetch="intent"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Sign up
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Legal
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="text-muted-foreground">Privacy</span>
                </li>
                <li>
                  <span className="text-muted-foreground">Terms</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 text-sm text-muted-foreground sm:flex-row">
          <p>(c) {year} Revserp. All rights reserved.</p>
          <p className="text-xs">Built for the next generation of search.</p>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <LogoCarousel />
        <Solutions />
        <Method />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
