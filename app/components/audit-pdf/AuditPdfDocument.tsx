import { googleFonts } from "@takumi-rs/helpers";
import { render } from "takumi-pdf";

import { DataTable } from "~/components/pdf/data-table/data-table";
import { PdfList } from "~/components/pdf/list/list";
import { PageFooter } from "~/components/pdf/page-footer/page-footer";
import { PageHeader } from "~/components/pdf/page-header/page-header";
import { PageNumber } from "~/components/pdf/page-number/page-number";
import { Section } from "~/components/pdf/section/section";
import { Text } from "~/components/pdf/text/text";
import { PdfcnThemeProvider } from "~/components/pdf/theme-provider";
import { Document, Page, StyleSheet } from "~/lib/pdf-primitives";
import { professionalTheme } from "~/lib/pdf-themes/professional";
import type { PdfcnTheme } from "~/types/pdf-themes";

export interface AuditCommentary {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
}

export interface AuditBucket {
  id: string;
  label: string;
  score: number;
  affectedUrlCount?: number;
}

export interface AuditPillar {
  id: string;
  label: string;
  score: number;
  buckets: AuditBucket[];
}

export interface AuditPdfData {
  projectName: string;
  baseUrl?: string;
  reportDate: string;
  quarter?: string;
  urlsCrawled?: number | null;
  scores: {
    overall?: number | null;
    seo?: number | null;
    aeo?: number | null;
    pagespeed?: number | null;
  };
  pillars: AuditPillar[];
  commentary: Record<"overall" | "seo" | "aeo" | "pagespeed", AuditCommentary>;
  model?: string;
}

/**
 * Modern-flavoured theme forced for the audit PDF: A4 portrait, Helvetica
 * body + Helvetica-bolder headings (standard PDF font names only, no font
 * files bundled — Takumi resolves glyphs via the runtime fallback in
 * renderAuditPdf).
 */
export const auditPdfTheme: PdfcnTheme = {
  ...professionalTheme,
  name: "modern",
  page: { orientation: "portrait", size: "A4" },
  typography: {
    body: { ...professionalTheme.typography.body, fontFamily: "Helvetica" },
    heading: {
      ...professionalTheme.typography.heading,
      fontFamily: "Helvetica",
    },
  },
};

const COMMENTARY_AREAS = [
  { id: "overall", label: "Overall" },
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
] as const;

interface ScoreRow extends Record<string, unknown> {
  area: string;
  score: string;
}

interface BucketRow extends Record<string, unknown> {
  pillar: string;
  bucket: string;
  score: string;
  urls: string;
}

const formatScore = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : `${Math.round(value)}`;

const styles = StyleSheet.create({
  meta: {
    marginBottom: 12,
  },
  page: {
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
    minHeight: 841,
    paddingBottom: 56,
    paddingLeft: 48,
    paddingRight: 48,
    paddingTop: 56,
    position: "relative",
  },
  pageBreak: {
    breakAfter: "page",
  },
});

const AuditPdfBody = ({ data }: { data: AuditPdfData }) => {
  const scoreRows: ScoreRow[] = [
    { area: "Overall", score: formatScore(data.scores.overall) },
    { area: "SEO", score: formatScore(data.scores.seo) },
    { area: "AEO", score: formatScore(data.scores.aeo) },
    { area: "PageSpeed", score: formatScore(data.scores.pagespeed) },
  ];
  const bucketRows: BucketRow[] = data.pillars.flatMap((pillar) =>
    pillar.buckets.map((bucket) => ({
      bucket: bucket.label,
      pillar: pillar.label,
      score: formatScore(bucket.score),
      urls:
        bucket.affectedUrlCount === undefined
          ? "—"
          : `${bucket.affectedUrlCount}`,
    })),
  );
  const metaBits = [
    data.baseUrl,
    data.quarter,
    data.urlsCrawled === null || data.urlsCrawled === undefined
      ? undefined
      : `${data.urlsCrawled} URLs crawled`,
  ].filter(Boolean);

  return (
    <Document title={`${data.projectName} — SEO Audit`}>
      <Page size="A4" style={[styles.page, styles.pageBreak]}>
        <PageHeader
          variant="simple"
          title={`${data.projectName} — SEO Audit`}
          subtitle={metaBits.join(" · ") || undefined}
          rightText={data.reportDate}
          rightSubText={data.model ? `Model: ${data.model}` : undefined}
          marginBottom={14}
        />
        <Section spacing="sm">
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Scores
          </Text>
          <DataTable<ScoreRow>
            variant="compact"
            size="compact"
            stripe
            columns={[
              { header: "Area", key: "area" },
              { align: "right", header: "Score", key: "score" },
            ]}
            data={scoreRows}
          />
        </Section>
        <Section spacing="sm">
          <Text variant="sm" transform="uppercase" color="mutedForeground">
            Buckets
          </Text>
          <DataTable<BucketRow>
            variant="compact"
            size="compact"
            stripe
            columns={[
              { header: "Pillar", key: "pillar" },
              { header: "Bucket", key: "bucket" },
              { align: "right", header: "Score", key: "score" },
              { align: "right", header: "Affected URLs", key: "urls" },
            ]}
            data={bucketRows}
          />
        </Section>
        <PageFooter
          variant="three-column"
          leftText={data.projectName}
          centerText={data.reportDate}
          rightText={<PageNumber size="xs" />}
          sticky
          pagePadding={48}
        />
      </Page>
      <Page size="A4" style={styles.page}>
        <PageHeader
          variant="simple"
          title="Commentary"
          subtitle="What changed, what is strong, what needs attention"
          rightText={data.reportDate}
          marginBottom={14}
        />
        {COMMENTARY_AREAS.map((area) => {
          const entry = data.commentary[area.id];
          if (!entry) return null;
          return (
            <Section key={area.id} spacing="sm">
              <Text variant="lg" weight="bold" noMargin>
                {area.label}
              </Text>
              {entry.summary ? <Text>{entry.summary}</Text> : null}
              {entry.strengths.length > 0 ? (
                <Section spacing="none">
                  <Text variant="sm" weight="semibold" noMargin>
                    Strengths
                  </Text>
                  <PdfList
                    variant="bullet"
                    items={entry.strengths.map((text) => ({ text }))}
                  />
                </Section>
              ) : null}
              {entry.concerns.length > 0 ? (
                <Section spacing="none">
                  <Text variant="sm" weight="semibold" noMargin>
                    Concerns
                  </Text>
                  <PdfList
                    variant="bullet"
                    items={entry.concerns.map((text) => ({ text }))}
                  />
                </Section>
              ) : null}
              {entry.recommendations.length > 0 ? (
                <Section spacing="none">
                  <Text variant="sm" weight="semibold" noMargin>
                    Recommendations
                  </Text>
                  <PdfList
                    variant="numbered"
                    items={entry.recommendations.map((text) => ({ text }))}
                  />
                </Section>
              ) : null}
            </Section>
          );
        })}
        <PageFooter
          variant="three-column"
          leftText={data.projectName}
          centerText={data.reportDate}
          rightText={<PageNumber size="xs" />}
          sticky
          pagePadding={48}
        />
      </Page>
    </Document>
  );
};

export const AuditPdfDocument = ({ data }: { data: AuditPdfData }) => (
  <PdfcnThemeProvider theme={auditPdfTheme}>
    <AuditPdfBody data={data} />
  </PdfcnThemeProvider>
);

/**
 * Render the audit document to PDF bytes with Takumi (`render` from
 * takumi-pdf, A4 paged output). Takumi embeds only registered fonts, so the
 * Helvetica font stack is covered at runtime by Arimo (Helvetica-metric
 * compatible, fetched from Google Fonts CDN — no font files in the repo).
 */
export const renderAuditPdf = async (
  data: AuditPdfData,
): Promise<Uint8Array> =>
  render(<AuditPdfDocument data={data} />, {
    fontFamilies: ["Helvetica", "Arimo"],
    fonts: await googleFonts(["Arimo"]),
    metadata: { creator: "revserp", title: `${data.projectName} — SEO Audit` },
    size: "a4",
  });
