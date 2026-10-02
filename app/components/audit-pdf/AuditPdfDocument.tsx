import type { ReactNode } from "react";
import { PdfList } from "~/components/pdf/list/list";
import { PageNumber } from "~/components/pdf/page-number/page-number";
import { Table, TableCell, TableRow } from "~/components/pdf/table/table";
import { Text } from "~/components/pdf/text/text";
import { PdfcnThemeProvider } from "~/components/pdf/theme-provider";
import { Document, Image, Page, View } from "~/lib/pdf-primitives";
import { defaultPrimitives } from "~/lib/pdf-themes/primitives";
import type { PdfcnTheme } from "~/types/pdf-themes";
import arimoFontUrl from "./fonts/Arimo.ttf?url";
import logoUrl from "../../../public/icons/revserp-192.png?url";

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
  scores: { overall?: number | null; seo?: number | null; aeo?: number | null; pagespeed?: number | null };
  pillars: AuditPillar[];
  commentary: Record<"overall" | "seo" | "aeo" | "pagespeed", AuditCommentary>;
  model?: string;
}

const INK = "#101c24";
const MUTED = "#687780";
const RULE = "#dce4e6";
const ACCENT = "#087f79";

export const auditPdfTheme: PdfcnTheme = {
  name: "audit-modern",
  primitives: defaultPrimitives,
  page: { size: "A4", orientation: "portrait" },
  colors: {
    foreground: INK, background: "#ffffff", muted: "#f4f7f7",
    mutedForeground: MUTED, primary: INK, primaryForeground: "#ffffff",
    border: RULE, accent: ACCENT, success: ACCENT,
    warning: "#9a621c", destructive: "#b54040", info: ACCENT,
  },
  typography: {
    body: { fontFamily: "Arimo", fontSize: 10, lineHeight: 1.5 },
    heading: { fontFamily: "Arimo", fontWeight: 700, lineHeight: 1.2,
      fontSize: { h1: 32, h2: 24, h3: 16, h4: 12, h5: 10, h6: 9 } },
  },
  spacing: {
    page: { marginTop: 44, marginRight: 44, marginBottom: 44, marginLeft: 44 },
    sectionGap: 24, paragraphGap: 8, componentGap: 10,
  },
};

const formatScore = (score: number | null | undefined) =>
  score == null || !Number.isFinite(score) ? "—" : String(Math.round(score));

const AREAS = [
  { id: "seo", label: "SEO", description: "Search engine optimization" },
  { id: "aeo", label: "AEO", description: "Answer engine optimization" },
  { id: "pagespeed", label: "PageSpeed", description: "Page performance" },
] as const;

const Label = ({ children }: { children: ReactNode }) => (
  <Text noMargin style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: MUTED }}>
    {children}
  </Text>
);

const AuditReportHeader = ({ data }: { data: AuditPdfData }) => (
  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 12, paddingLeft: 44, paddingRight: 44, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomStyle: "solid", borderBottomColor: RULE }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image src={logoUrl} style={{ width: 24, height: 24 }} />
      <Text noMargin style={{ fontSize: 12, fontWeight: 700 }}>Revserp</Text>
    </View>
    <Text noMargin style={{ fontSize: 8, color: MUTED }}>{data.projectName}</Text>
  </View>
);

const AuditReportFooter = ({ data }: { data: AuditPdfData }) => (
  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingLeft: 44, paddingRight: 44, paddingTop: 10,
    borderTopWidth: 0.5, borderTopStyle: "solid", borderTopColor: RULE }}>
    <View style={{ width: "75%" }}>
      <Text noMargin style={{ fontSize: 8, color: MUTED }}>Revserp · {data.reportDate}</Text>
    </View>
    <View style={{ width: "25%" }}><PageNumber format="{page} / {total}" align="right" size="xs" /></View>
  </View>
);

const AuditScoreSummary = ({ data }: { data: AuditPdfData }) => {
  const scores = [
    { label: "Overall", value: data.scores.overall },
    { label: "SEO", value: data.scores.seo },
    { label: "AEO", value: data.scores.aeo },
    { label: "PageSpeed", value: data.scores.pagespeed },
  ];
  return (
    <View wrap={false} style={{ flexDirection: "row", marginTop: 28, marginBottom: 28,
      borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: ACCENT }}>
      {scores.map((score, index) => (
        <View key={score.label} style={{ width: "25%", padding: 14,
          backgroundColor: index === 0 ? INK : "#f4f7f7" }}>
          <Text noMargin style={{ fontSize: 8, color: index === 0 ? "#adc5cc" : MUTED }}>{score.label}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 8 }}>
            <Text noMargin style={{ fontSize: 30, lineHeight: 1.1, fontWeight: 700,
              color: index === 0 ? "#ffffff" : INK }}>{formatScore(score.value)}</Text>
            <Text noMargin style={{ fontSize: 8, color: index === 0 ? "#adc5cc" : MUTED }}>/ 100</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

const AuditInsightList = ({ title, items, numbered = false }: {
  title: string; items: string[]; numbered?: boolean;
}) => {
  if (!items.length) return null;
  const itemRow = (text: string, index: number) => numbered ? (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ width: 18 }}><Text noMargin style={{ color: ACCENT, fontSize: 9, fontWeight: 700 }}>{String(index + 1).padStart(2, "0")}</Text></View>
      <View style={{ flex: 1 }}><Text noMargin>{text}</Text></View>
    </View>
  ) : <PdfList items={[{ text }]} variant="bullet" gap="xs" style={{ marginBottom: 0 }} />;
  return (
    <View style={{ marginTop: 20 }}>
      {/* Keep the title with the first item, not with an arbitrarily long list. */}
      <View wrap={false}>
        <Text noMargin style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>{title}</Text>
        {itemRow(items[0], 0)}
      </View>
      {items.slice(1).map((item, index) => (
        <View key={index} wrap={false} style={{ marginTop: 8 }}>
          {itemRow(item, index + 1)}
        </View>
      ))}
    </View>
  );
};

const AuditInsights = ({ entry }: { entry: AuditCommentary }) => (
  <>
    <AuditInsightList title="Strengths" items={entry.strengths} />
    <AuditInsightList title="Areas of concern" items={entry.concerns} />
    <AuditInsightList title="Recommended actions" items={entry.recommendations} numbered />
  </>
);

const AuditBucketTable = ({ buckets }: { buckets: AuditBucket[] }) => {
  if (!buckets.length) return null;
  const row = (bucket: AuditBucket) => (
    <TableRow key={bucket.id}>
      <TableCell width="60%">{bucket.label}</TableCell>
      <TableCell width="15%" align="right">{formatScore(bucket.score)}</TableCell>
      <TableCell width="25%" align="right">{bucket.affectedUrlCount == null ? "—" : String(bucket.affectedUrlCount)}</TableCell>
    </TableRow>
  );
  return (
    <View style={{ marginTop: 24, marginBottom: 24 }}>
      <Table variant="line">
        <View wrap={false}>
          <TableRow header variant="line">
            <TableCell width="60%">Audit category</TableCell>
            <TableCell width="15%" align="right">Score</TableCell>
            <TableCell width="25%" align="right">Affected URLs</TableCell>
          </TableRow>
          {row(buckets[0])}
        </View>
        {buckets.slice(1).map(row)}
      </Table>
    </View>
  );
};

const AuditPdfBody = ({ data }: { data: AuditPdfData }) => {
  const overall = data.commentary.overall;
  const hasOverallInsights = overall.strengths.length + overall.concerns.length + overall.recommendations.length > 0;
  const pages = AREAS.map(area => ({ ...area,
    pillar: data.pillars.find(p => p.id === area.id), entry: data.commentary[area.id],
  })).filter(({ pillar, entry }) => pillar || entry.summary || entry.strengths.length || entry.concerns.length || entry.recommendations.length);
  const pageStyle = { paddingTop: 24, paddingBottom: 16 };
  const nextPageStyle = { ...pageStyle, breakBefore: "page" };
  return (
    <Document title={`${data.projectName} — Site audit report`}>
      <Page size="A4" style={pageStyle}>
        <View wrap={false}>
          <Label>SITE AUDIT REPORT</Label>
          <Text noMargin style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15, marginTop: 12 }}>
            {data.projectName}
          </Text>
          <Text noMargin style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>
            Search visibility. Answer readiness. Page performance.
          </Text>
          <View style={{ flexDirection: "row", gap: 28, marginTop: 24 }}>
            <View><Label>PREPARED</Label><Text noMargin style={{ fontSize: 10, marginTop: 6 }}>{data.reportDate}</Text></View>
            {data.urlsCrawled != null ? <View><Label>PAGES CRAWLED</Label><Text noMargin style={{ fontSize: 10, marginTop: 6 }}>{data.urlsCrawled}</Text></View> : null}
          </View>
          {data.baseUrl ? <Text noMargin style={{ color: MUTED, fontSize: 9, marginTop: 10 }}>{data.baseUrl}</Text> : null}
          <AuditScoreSummary data={data} />
        </View>
        {overall.summary ? (
          <View wrap={false}>
            <Text noMargin style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Executive summary</Text>
            <Text>{overall.summary}</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 24 }}>
          Scores are out of 100. The following sections contain audit findings and recommended actions.
        </Text>
      </Page>
      {hasOverallInsights ? (
        <Page size="A4" style={nextPageStyle}>
          <Label>01 / AUDIT OVERVIEW</Label>
          <Text noMargin style={{ fontSize: 26, fontWeight: 700, marginTop: 10 }}>Key findings</Text>
          <AuditInsights entry={overall} />
        </Page>
      ) : null}
      {pages.map(({ id, label, description, pillar, entry }, index) => (
        <Page key={id} size="A4" style={nextPageStyle}>
          <View wrap={false}>
            <Label>{`${String(index + (hasOverallInsights ? 2 : 1)).padStart(2, "0")} / ${description.toUpperCase()}`}</Label>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
              <Text noMargin style={{ fontSize: 26, fontWeight: 700 }}>{label}</Text>
              <Text noMargin style={{ fontSize: 20, fontWeight: 700 }}>{formatScore(pillar?.score ?? data.scores[id])} / 100</Text>
            </View>
          </View>
          <AuditBucketTable buckets={pillar?.buckets ?? []} />
          {entry.summary ? <Text>{entry.summary}</Text> : null}
          <AuditInsights entry={entry} />
        </Page>
      ))}
    </Document>
  );
};

export const AuditPdfDocument = ({ data }: { data: AuditPdfData }) => (
  <PdfcnThemeProvider theme={auditPdfTheme}><AuditPdfBody data={data} /></PdfcnThemeProvider>
);

export const renderAuditPdf = async (data: AuditPdfData): Promise<Uint8Array> => {
  const { measure, render } = await import("takumi-pdf");
  const loadAsset = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load PDF asset: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  // Fonts and logo are same-origin assets; no external font service is needed.
  const [font, logo] = await Promise.all([loadAsset(arimoFontUrl), loadAsset(logoUrl)]);
  const themed = (children: ReactNode) => <PdfcnThemeProvider theme={auditPdfTheme}>{children}</PdfcnThemeProvider>;
  const resources = { fontFamilies: ["Arimo"], fonts: [{ name: "Arimo", data: font }], images: [{ src: logoUrl, data: logo }] };
  const header = themed(<AuditReportHeader data={data} />);
  const footer = themed(<AuditReportFooter data={data} />);
  const [headerSize, footerSize] = await Promise.all([
    measure(header, { ...resources, size: "a4" }),
    measure(footer, { ...resources, size: "a4" }),
  ]);
  return render(<AuditPdfDocument data={data} />, {
    ...resources, header, footer,
    margin: { top: Math.ceil(headerSize.height) + 36, bottom: Math.ceil(footerSize.height) + 20, left: 58.67, right: 58.67 },
    metadata: { creator: "Revserp", title: `${data.projectName} — Site audit report` },
    size: "a4",
  });
};
