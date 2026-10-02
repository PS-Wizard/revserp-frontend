import { useRef, useState } from "react"
import { toast } from "sonner"
import { clientApiFetch } from "~/lib/api"
import type { CrawlResponse, ScoreBreakdownResponse } from "~/lib/api.types"
import {
  auditPdfFilename,
  buildAuditPdfData,
  type AuditCommentaryResponse,
} from "./build-audit-pdf-data"

export type UsePdfExportOptions = {
  crawlId: string | null
  projectName: string
  currentCrawl: CrawlResponse | null
  /** Optional site URL shown in the report header. */
  baseUrl?: string
  // ponytail: legacy screenshot-export handles below, kept so app.tsx
  // compiles untouched; the takumi flow ignores them. Remove when the
  // route stops passing refs.
  /** @deprecated unused by the takumi export, kept for route compatibility */
  coverRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated unused by the takumi export, kept for route compatibility */
  overallRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated unused by the takumi export, kept for route compatibility */
  seoRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated unused by the takumi export, kept for route compatibility */
  aeoRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated unused by the takumi export, kept for route compatibility */
  pagespeedRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated unused by the takumi export, kept for route compatibility */
  onSectionsReady?: () => void
  onDone: () => void
}

export function usePdfExport({ crawlId, projectName, currentCrawl, baseUrl, onDone }: UsePdfExportOptions) {
  const [isExporting, setIsExporting] = useState(false)
  // ponytail: ref guard — state alone still allows double-click races.
  const exportingRef = useRef(false)

  async function exportPdf() {
    if (!crawlId || exportingRef.current) return
    exportingRef.current = true
    setIsExporting(true)

    const toastId = `audit-export-${crawlId}`
    toast.loading(<span className="shimmer text-muted-foreground">Generating audit…</span>, {
      id: toastId,
      duration: Infinity,
      description: projectName ? `Building the ${projectName} audit report.` : undefined,
    })

    let objectUrl: string | null = null
    let stage = "load audit data"
    try {
      // Independent fetches in parallel; breakdown is the score source of truth.
      const [breakdown, commentary] = await Promise.all([
        clientApiFetch<ScoreBreakdownResponse>(`/crawls/${crawlId}/score-breakdown`),
        clientApiFetch<AuditCommentaryResponse>(`/crawls/${crawlId}/commentary`),
      ])

      const data = buildAuditPdfData(crawlId, breakdown, commentary, {
        projectName,
        baseUrl,
        currentCrawl,
      })

      stage = "load the PDF renderer"
      const { renderAuditPdf } = await import("../audit-pdf/AuditPdfDocument")
      stage = "render the audit PDF"
      const bytes = await renderAuditPdf(data)

      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
      objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = auditPdfFilename(projectName)
      document.body.appendChild(link)
      link.click()
      link.remove()

      toast.success("Audit ready", {
        id: toastId,
        description: "Your audit PDF has been downloaded.",
      })
    } catch (error) {
      toast.error("Couldn't generate audit", {
        id: toastId,
        description: `Could not ${stage}: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      onDone()
      exportingRef.current = false
      setIsExporting(false)
    }
  }

  return { exportPdf, isExporting }
}
