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
import logoUrl from "../../../public/icons/revserp-icon-192.png?url";

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
  /** Optional parent-project location appendix; absent means no saved location runs. */
  locations?: AuditPdfLocation[];
}

export interface AuditPdfLocationMapsPoint {
  pointIndex: number;
  letter: string;
  /** Found-only mean rank; null when nothing was found or nothing succeeded. */
  meanRank: number | null;
  foundCount: number;
  absentCount: number;
  unknownCount: number;
  totalCount: number;
}

export interface AuditPdfLocationMaps {
  runId: string;
  status: "completed" | "partial" | "failed";
  /** Frozen saved queries the run priced, in run order. */
  queries: string[];
  radiusM: number;
  foundCount: number;
  absentCount: number;
  failedCount: number;
  unknownCount: number;
  totalCells: number;
  /** Found-only mean rank; null is rendered as unknown, never zero. */
  foundOnlyMeanRank: number | null;
  points: AuditPdfLocationMapsPoint[];
  /** Saved raw centre drift line; null when the run stored no usable drift. */
  driftNote: string | null;
  /** True when no cell succeeded, so every rank reads as unknown. */
  failureOnly: boolean;
  error?: string | null;
}

export interface AuditPdfLocationAiModel {
  model: string;
  shortModel: string;
  mentionedCount: number;
  successCount: number;
  failedCount: number;
  unknownCount: number;
  /** Found-only mean rank; null when the model mentioned nothing ranked. */
  avgRank: number | null;
}

export interface AuditPdfLocationAiRow {
  order: number;
  question: string;
  model: string;
  status: string;
  mentioned: boolean | null;
  rank: number | null;
  branchMention: boolean | null;
}

export interface AuditPdfLocationAi {
  auditId: string;
  status: string;
  completedAt?: string | null;
  /** Mentions over successful checks; null when nothing succeeded. */
  visibilityRate: number | null;
  totalMentions: number;
  totalSuccess: number;
  /** Found-only mean rank; null when nothing ranked. */
  avgRank: number | null;
  failedCount: number;
  unknownCount: number;
  models: AuditPdfLocationAiModel[];
  rows: AuditPdfLocationAiRow[];
  error?: string | null;
}

/** One parent-project location with saved Maps and/or AI visibility results. */
export interface AuditPdfLocation {
  id: string;
  name: string;
  maps?: AuditPdfLocationMaps | null;
  aiVisibility?: AuditPdfLocationAi | null;
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

// ponytail: location appendix reuses the product's found-only mean rank
// formatting so the PDF never invents a zero for an unknown rank.
const formatMeanRank = (meanRank: number | null): string =>
  meanRank === null ? "—" : meanRank.toFixed(1);

/** Empty-scope label mirroring formatLocalSeoEmptyMeanRank: absent only when clean. */
const formatEmptyMeanRank = (absentCount: number, unknownCount: number): string =>
  absentCount > 0 && unknownCount === 0 ? "Absent" : "—";

const formatAuditPdfIsoDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

/** Matrix preview; the full question text lives in the product, not the PDF. */
const auditPdfQuestionPreview = (question: string): string =>
  question.length > 140 ? `${question.slice(0, 137)}…` : question;

/** Matrix token mirroring the visibility grid: rank, ~ mentioned-unranked, — absent. */
const auditPdfAiResultToken = (row: AuditPdfLocationAiRow): string => {
  if (row.status === "failed") return "Error";
  if (row.status !== "success") return "…";
  if (row.mentioned && row.rank !== null && Number.isFinite(row.rank) && row.rank > 0)
    return `#${Number.isInteger(row.rank) ? String(row.rank) : row.rank.toFixed(1)}`;
  if (row.mentioned) return "~";
  return "—";
};

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

// ponytail: one appendix page per location keeps pagination deterministic;
// the question matrix spills onto fixed-size continuation pages instead.
const AUDIT_PDF_LOCATION_QUESTIONS_PER_PAGE = 10;

const auditPdfLocationPageStyle = { paddingTop: 24, paddingBottom: 16, breakBefore: "page" };

const AuditPdfLocationMapsSection = ({ maps }: { maps: AuditPdfLocationMaps }) => {
  const statusLabel = maps.status === "partial" ? "Partial" : maps.status === "failed" ? "Failed" : "Completed";
  const pointRow = (point: AuditPdfLocationMapsPoint) => (
    <TableRow key={point.pointIndex}>
      <TableCell width="28%">{`${point.letter} · Point ${point.pointIndex + 1}`}</TableCell>
      <TableCell width="20%" align="right">{point.meanRank !== null ? `≈${formatMeanRank(point.meanRank)}` : formatEmptyMeanRank(point.absentCount, point.unknownCount)}</TableCell>
      <TableCell width="17%" align="right">{String(point.foundCount)}</TableCell>
      <TableCell width="18%" align="right">{String(point.absentCount)}</TableCell>
      <TableCell width="17%" align="right">{String(point.unknownCount)}</TableCell>
    </TableRow>
  );
  return (
    <View style={{ marginTop: 20 }}>
      <View wrap={false}>
        <Text noMargin style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Maps visibility · {statusLabel}</Text>
        <Text noMargin style={{ fontSize: 10, marginBottom: 6 }}>
          {maps.foundOnlyMeanRank !== null ? `Avg. rank ≈${formatMeanRank(maps.foundOnlyMeanRank)} across ${maps.foundCount} found samples` : "No found rank in this run"}
        </Text>
        <Text noMargin style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>
          {`${maps.foundCount} found · ${maps.absentCount} absent · ${maps.failedCount} failed · ${maps.unknownCount} unknown of ${maps.totalCells} cells`}
        </Text>
      </View>
      {maps.points.length > 0 ? (
        <Table variant="line">
          <View wrap={false}>
            <TableRow header variant="line">
              <TableCell width="28%">Grid point</TableCell>
              <TableCell width="20%" align="right">Avg. rank</TableCell>
              <TableCell width="17%" align="right">Found</TableCell>
              <TableCell width="18%" align="right">Absent</TableCell>
              <TableCell width="17%" align="right">Unknown</TableCell>
            </TableRow>
            {pointRow(maps.points[0])}
          </View>
          {maps.points.slice(1).map(pointRow)}
        </Table>
      ) : null}
      <Text style={{ fontSize: 8, color: MUTED, marginTop: 8 }}>
        {`Frozen scope: ${maps.queries.length} saved ${maps.queries.length === 1 ? "query" : "queries"} · radius ${(maps.radiusM / 1000).toFixed(1)} km · run ${maps.runId}`}
      </Text>
      {maps.queries.length > 0 ? (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>{maps.queries.join(" · ")}</Text>
      ) : null}
      {maps.driftNote ? (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>Ranks are approximate: {maps.driftNote}</Text>
      ) : maps.foundOnlyMeanRank !== null ? (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>Ranks are approximate — the provider may answer from a nearby map centre.</Text>
      ) : null}
      {maps.status === "partial" ? (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>Partial run: unsettled cells count as unknown.</Text>
      ) : null}
      {maps.failureOnly ? (
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>No cell in this run succeeded — ranks are unknown, not zero.</Text>
      ) : null}
      {maps.error ? <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>{maps.error}</Text> : null}
    </View>
  );
};

const AuditPdfLocationAiSummary = ({ ai }: { ai: AuditPdfLocationAi }) => {
  const completedLabel = formatAuditPdfIsoDate(ai.completedAt);
  const headline = ai.visibilityRate !== null ? `${ai.visibilityRate}% visibility` : "No successful checks";
  const modelRow = (model: AuditPdfLocationAiModel) => (
    <TableRow key={model.model}>
      <TableCell width="40%">{model.shortModel}</TableCell>
      <TableCell width="20%" align="right">{`${model.mentionedCount}/${model.successCount}`}</TableCell>
      <TableCell width="15%" align="right">{model.avgRank !== null ? `#${model.avgRank}` : "—"}</TableCell>
      <TableCell width="12%" align="right">{model.failedCount > 0 ? String(model.failedCount) : "—"}</TableCell>
      <TableCell width="13%" align="right">{model.unknownCount > 0 ? String(model.unknownCount) : "—"}</TableCell>
    </TableRow>
  );
  return (
    <View style={{ marginTop: 20 }}>
      <View wrap={false}>
        <Text noMargin style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>AI visibility</Text>
        <Text noMargin style={{ fontSize: 10, marginBottom: 6 }}>{headline}</Text>
        <Text noMargin style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>
          {`${ai.totalMentions}/${ai.totalSuccess} mentions${ai.avgRank !== null ? ` · avg. rank #${ai.avgRank}` : ""}${ai.failedCount > 0 ? ` · ${ai.failedCount} failed` : ""}${ai.unknownCount > 0 ? ` · ${ai.unknownCount} unknown` : ""}${completedLabel ? ` · run ${completedLabel}` : ""}`}
        </Text>
      </View>
      {ai.models.length > 0 ? (
        <Table variant="line">
          <View wrap={false}>
            <TableRow header variant="line">
              <TableCell width="40%">Model</TableCell>
              <TableCell width="20%" align="right">Mentions</TableCell>
              <TableCell width="15%" align="right">Avg. rank</TableCell>
              <TableCell width="12%" align="right">Failed</TableCell>
              <TableCell width="13%" align="right">Unknown</TableCell>
            </TableRow>
            {modelRow(ai.models[0])}
          </View>
          {ai.models.slice(1).map(modelRow)}
        </Table>
      ) : null}
      <Text style={{ fontSize: 8, color: MUTED, marginTop: 8 }}>{`Saved audit ${ai.auditId} · status ${ai.status}`}</Text>
      {ai.error ? <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>{ai.error}</Text> : null}
    </View>
  );
};

const AuditPdfLocationAiMatrixPage = ({ location, appendixLabel, models, orders, rows }: {
  location: AuditPdfLocation;
  appendixLabel: string;
  models: AuditPdfLocationAiModel[];
  orders: number[];
  rows: AuditPdfLocationAiRow[];
}) => {
  const columnWidth = `${(56 / Math.max(models.length, 1)).toFixed(1)}%`;
  const matrixRow = (order: number) => {
    const first = rows.find((row) => row.order === order);
    return (
      <TableRow key={order}>
        <TableCell width="44%">{`${order}. ${auditPdfQuestionPreview(first?.question ?? `Question ${order}`)}`}</TableCell>
        {models.map((model) => {
          const cell = rows.find((row) => row.order === order && row.model === model.model);
          return (
            <TableCell key={model.model} width={columnWidth} align="center">{cell ? auditPdfAiResultToken(cell) : "—"}</TableCell>
          );
        })}
      </TableRow>
    );
  };
  return (
    <Page size="A4" style={auditPdfLocationPageStyle}>
      <View wrap={false}>
        <Label>{`${appendixLabel} · CONTINUED`}</Label>
        <Text noMargin style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{location.name} — visibility detail</Text>
        <Text noMargin style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>Rank per question across every model. ~ is mentioned but unranked, — is not mentioned.</Text>
      </View>
      <View style={{ marginTop: 16 }}>
        <Table variant="line">
          <View wrap={false}>
            <TableRow header variant="line">
              <TableCell width="44%">Question</TableCell>
              {models.map((model) => (
                <TableCell key={model.model} width={columnWidth} align="center">{model.shortModel}</TableCell>
              ))}
            </TableRow>
            {orders.length > 0 ? matrixRow(orders[0]) : null}
          </View>
          {orders.slice(1).map(matrixRow)}
        </Table>
      </View>
    </Page>
  );
};

const AuditPdfLocationAppendix = ({ location, index }: { location: AuditPdfLocation; index: number }) => {
  const maps = location.maps ?? null;
  const ai = location.aiVisibility ?? null;
  if (!maps && !ai) return null;
  const appendixLabel = `APPENDIX ${String(index + 1).padStart(2, "0")} / LOCATION RESULTS`;
  const models = ai?.models ?? [];
  const rows = ai?.rows ?? [];
  const orders = [...new Set(rows.map((row) => row.order))].sort((a, b) => a - b);
  const matrixPages: number[][] = [];
  for (let at = 0; at < orders.length; at += AUDIT_PDF_LOCATION_QUESTIONS_PER_PAGE) {
    matrixPages.push(orders.slice(at, at + AUDIT_PDF_LOCATION_QUESTIONS_PER_PAGE));
  }
  return (
    <>
      <Page size="A4" style={auditPdfLocationPageStyle}>
        <View wrap={false}>
          <Label>{appendixLabel}</Label>
          <Text noMargin style={{ fontSize: 26, fontWeight: 700, marginTop: 10 }}>{location.name}</Text>
          <Text noMargin style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>Saved Maps and AI visibility runs for this location. Website audit sections above are unchanged.</Text>
        </View>
        {maps ? <AuditPdfLocationMapsSection maps={maps} /> : null}
        {ai ? <AuditPdfLocationAiSummary ai={ai} /> : null}
      </Page>
      {models.length > 0 ? matrixPages.map((pageOrders, pageIndex) => (
        <AuditPdfLocationAiMatrixPage
          key={`${location.id}-matrix-${pageIndex}`}
          location={location}
          appendixLabel={appendixLabel}
          models={models}
          orders={pageOrders}
          rows={rows}
        />
      )) : null}
    </>
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
      {(data.locations ?? []).filter((location) => location.maps || location.aiVisibility).map((location, index) => (
        <AuditPdfLocationAppendix key={location.id} location={location} index={index} />
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
