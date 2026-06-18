import { Link } from "react-router"
import { Asterisk } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export default function Home() {
  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl flex-col justify-center gap-10">
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Asterisk className="size-4" />
          </div>
          Revserp.ai
        </div>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                AI search visibility
              </p>
              <h1 className="max-w-3xl text-4xl font-medium tracking-tight md:text-6xl">
                Audit, monitor, and improve how AI systems understand your brand.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Run crawls, inspect SEO and AEO issues, connect Search Console, and use Revserp AI to turn audit findings into clear fixes.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button render={<Link to="/login" />} size="lg">
                Login With Google
              </Button>
              <Button render={<Link to="/signup" />} size="lg" variant="outline">
                Create account
              </Button>
            </div>
          </div>

          <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
            <CardHeader>
              <CardTitle>Built for answer engines</CardTitle>
              <CardDescription>
                One workspace for crawl scoring, Search Console context, and AI-guided issue resolution.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="font-medium text-foreground">Revserp Audit</p>
                <p className="mt-1">Score SEO, AEO, and PageSpeed with drill-down issue evidence.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="font-medium text-foreground">Search Console</p>
                <p className="mt-1">Compare crawl findings with real search performance data.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <p className="font-medium text-foreground">Revserp AI</p>
                <p className="mt-1">Ask scoped questions against the latest crawl breakdown.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

