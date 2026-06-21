import { type ReactNode } from "react"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Slider } from "~/components/ui/slider"
import { cn } from "~/lib/utils"

import { fmtNum } from "./helpers"

/* ------------------------------------------------------------------ */
/*  Cards                                                              */
/* ------------------------------------------------------------------ */

export function StatusCard({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "muted" | "destructive"
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "border-border/50 shadow-none",
        tone === "destructive" && "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <CardContent
        className={cn("py-3 text-sm", tone === "destructive" ? "text-destructive" : "text-muted-foreground")}
      >
        {children}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

export function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{title}</FieldLegend>
      <FieldGroup className="gap-3">{children}</FieldGroup>
    </FieldSet>
  )
}

export function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/*  Rows                                                               */
/* ------------------------------------------------------------------ */

export function ConfigRow({
  title,
  description,
  value,
  children,
}: {
  title: string
  description: string
  value: string
  children: ReactNode
}) {
  return (
    <Card size="sm" className="bg-muted/20 shadow-none">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(13rem,1fr)_auto] lg:items-center">
        <FieldContent className="min-w-0">
          <FieldLabel className="truncate">{title}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        {children}
        <Badge variant="outline" className="justify-self-start tabular-nums lg:justify-self-end">
          {value}
        </Badge>
      </CardContent>
    </Card>
  )
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const id = `slider-${label.replace(/\s+/g, "-").toLowerCase()}`
  return (
    <Field className="rounded-lg border border-border/50 bg-muted/20 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Badge variant="outline" className="tabular-nums">
          {fmtNum(value, 2)}
        </Badge>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <FieldDescription className="flex items-center justify-between text-xs">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </FieldDescription>
    </Field>
  )
}

export function InlineSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <Field className="gap-2">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <FieldDescription className="flex items-center justify-between text-xs">
        <span>{fmtNum(min, 2)}</span>
        <span>{fmtNum(max, 2)}</span>
      </FieldDescription>
    </Field>
  )
}

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

export function DeltaBadge({ delta }: { delta: number }) {
  const variant = delta < 0 ? "destructive" : "outline"
  return (
    <Badge variant={variant} className="tabular-nums">
      {delta > 0 ? "+" : ""}
      {delta}
    </Badge>
  )
}

export function ScoreTile({
  label,
  value,
  baseline,
}: {
  label: string
  value: number | null
  baseline: number | undefined
}) {
  const delta = value != null && baseline != null ? value - baseline : null
  const surfaceTone =
    delta == null || delta === 0
      ? "border-border/50 bg-muted/20"
      : delta > 0
        ? "border-emerald-300/16 bg-emerald-400/[0.045]"
        : "border-red-300/14 bg-red-400/[0.04]"

  return (
    <Card size="sm" className={cn("border", surfaceTone)}>
      <CardHeader>
        <CardDescription className="text-sm">{label}</CardDescription>
        {delta != null && (
          <CardAction>
            <DeltaBadge delta={delta} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
          {fmtNum(value, 0)}
        </p>
      </CardContent>
    </Card>
  )
}
