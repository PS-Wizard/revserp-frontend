import { useState } from "react"
import { toast } from "sonner"
import { clientApiFetch } from "~/lib/api"

export type CommentarySection = {
  summary: string
  strengths: string[]
  concerns: string[]
  recommendations: string[]
}

export type CommentaryResponse = {
  overall: CommentarySection
  seo: CommentarySection
  aeo: CommentarySection
  pagespeed: CommentarySection
  model: string
}

export type UsePdfExportOptions = {
  crawlId: string | null
  projectName: string
  currentCrawl: import("~/lib/api.types").CrawlResponse | null
  coverRef: React.RefObject<HTMLDivElement | null>
  overallRef: React.RefObject<HTMLDivElement | null>
  seoRef: React.RefObject<HTMLDivElement | null>
  aeoRef: React.RefObject<HTMLDivElement | null>
  pagespeedRef: React.RefObject<HTMLDivElement | null>
  onSectionsReady: () => void
  onDone: () => void
}

// jsPDF standard fonts only support WinAnsi. Any non-Latin-1 char the LLM emits
// (smart quotes, en/em dashes, unicode spaces, arrows, ellipsis) corrupts the
// whole string into a 2-byte render — visible as wildly letter-spaced text that
// runs off the page. Normalize such characters to ASCII before drawing.
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·‧]/g, "-")
    .replace(/[  -   　]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/[^\x00-\xFF]/g, "")
}

function loadImageAspectRatio(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(1), 5000)
    const img = new Image()
    img.onload = () => {
      clearTimeout(timeout)
      resolve(img.height / img.width)
    }
    img.onerror = () => {
      clearTimeout(timeout)
      resolve(1)
    }
    img.src = dataUrl
  })
}

const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2

// Dark theme (matches the app's shadcn .dark tokens / #09090b captures)
const DARK_BG: [number, number, number] = [9, 9, 11]
const DARK_HEADING: [number, number, number] = [240, 240, 242]
const DARK_BODY: [number, number, number] = [212, 212, 216]
const DARK_MUTED: [number, number, number] = [140, 140, 145]
const DARK_LINE: [number, number, number] = [45, 45, 50]

function paintDarkPage(pdf: import("jspdf").jsPDF) {
  pdf.setFillColor(...DARK_BG)
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F")
}

export function usePdfExport({
  crawlId,
  projectName,
  currentCrawl,
  coverRef,
  overallRef,
  seoRef,
  aeoRef,
  pagespeedRef,
  onSectionsReady,
  onDone,
}: UsePdfExportOptions) {
  const [isExporting, setIsExporting] = useState(false)

  async function exportPdf() {
    if (!crawlId || isExporting) return
    setIsExporting(true)

    const toastId = `audit-export-${crawlId}`
    toast.loading(
      <span className="shimmer text-muted-foreground">Generating audit…</span>,
      {
        id: toastId,
        duration: Infinity,
        description: projectName
          ? `Building the ${projectName} audit report.`
          : undefined,
      }
    )

    try {
      const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ])

      const commentary = await clientApiFetch<CommentaryResponse>(
        `/crawls/${crawlId}/commentary`
      )

      onSectionsReady()
      await new Promise((r) => setTimeout(r, 2000))

      const captureOpts = { pixelRatio: 2, backgroundColor: "#09090b" }
      const [coverPng, overallPng, seoPng, aeoPng, pagespeedPng] = await Promise.all([
        toPng(coverRef.current!, captureOpts),
        toPng(overallRef.current!, captureOpts),
        toPng(seoRef.current!, captureOpts),
        toPng(aeoRef.current!, captureOpts),
        toPng(pagespeedRef.current!, captureOpts),
      ])

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      })
      const dateStr = new Date().toISOString().slice(0, 10)

      // Cover page: full-bleed rasterized bento cover
      pdf.addImage(coverPng, "PNG", 0, 0, PAGE_W, PAGE_H)

      const sections: Array<{
        label: string
        imageLabel: string
        png: string
        commentary: CommentarySection
        score: number | undefined
      }> = [
        {
          label: "Overall Analysis",
          imageLabel: "OVERALL PERFORMANCE",
          png: overallPng,
          commentary: commentary.overall,
          score: currentCrawl?.overall_score,
        },
        {
          label: "SEO Analysis",
          imageLabel: "SEO PERFORMANCE",
          png: seoPng,
          commentary: commentary.seo,
          score: currentCrawl?.seo_score,
        },
        {
          label: "AEO Analysis",
          imageLabel: "AEO PERFORMANCE",
          png: aeoPng,
          commentary: commentary.aeo,
          score: currentCrawl?.aeo_score,
        },
        {
          label: "PageSpeed Analysis",
          imageLabel: "PAGESPEED PERFORMANCE",
          png: pagespeedPng,
          commentary: commentary.pagespeed,
          score: currentCrawl?.pagespeed_score,
        },
      ]

      const ensureSpace = (cursorY: number): number => {
        if (cursorY > PAGE_H - MARGIN) {
          pdf.addPage()
          paintDarkPage(pdf)
          return MARGIN + 8
        }
        return cursorY
      }

      const renderBlock = (
        heading: string,
        items: string[],
        cursorY: number,
        prefix: (i: number) => string
      ): number => {
        if (items.length === 0) return cursorY
        cursorY = ensureSpace(cursorY)
        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(9)
        pdf.setTextColor(...DARK_HEADING)
        pdf.text(heading, MARGIN, cursorY)
        cursorY += 7

        items.forEach((item, i) => {
          pdf.setFont("helvetica", "normal")
          pdf.setFontSize(9.5)
          pdf.setTextColor(...DARK_BODY)
          const itemLines = pdf.splitTextToSize(sanitizeForPdf(`${prefix(i)}${item}`), CONTENT_W - 8)
          for (const line of itemLines) {
            cursorY = ensureSpace(cursorY)
            pdf.text(line, MARGIN + 8, cursorY)
            cursorY += 5
          }
        })
        return cursorY + 5
      }

      for (const section of sections) {
        // Image page
        pdf.addPage()
        paintDarkPage(pdf)

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(9)
        pdf.setTextColor(...DARK_MUTED)
        pdf.text(section.imageLabel, MARGIN, MARGIN + 4)

        pdf.setDrawColor(...DARK_LINE)
        pdf.setLineWidth(0.3)
        pdf.line(MARGIN, MARGIN + 7, PAGE_W - MARGIN, MARGIN + 7)

        const aspectRatio = await loadImageAspectRatio(section.png)
        const maxImgH = CONTENT_H - 12
        const maxImgW = CONTENT_W
        let imgW = maxImgW
        let imgH = imgW * aspectRatio
        if (imgH > maxImgH) {
          imgH = maxImgH
          imgW = imgH / aspectRatio
        }
        const imgX = MARGIN + (CONTENT_W - imgW) / 2
        pdf.addImage(section.png, "PNG", imgX, MARGIN + 12, imgW, imgH)

        // Commentary page
        pdf.addPage()
        paintDarkPage(pdf)

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(18)
        pdf.setTextColor(...DARK_HEADING)
        pdf.text(section.label, MARGIN, MARGIN + 8)

        if (section.score != null) {
          pdf.text(
            `${Math.round(section.score)}%`,
            PAGE_W - MARGIN,
            MARGIN + 8,
            { align: "right" }
          )
        }

        pdf.setDrawColor(...DARK_LINE)
        pdf.setLineWidth(0.3)
        pdf.line(MARGIN, MARGIN + 14, PAGE_W - MARGIN, MARGIN + 14)

        let cursorY = MARGIN + 20

        // Summary
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(10)
        pdf.setTextColor(...DARK_BODY)
        const summaryLines = pdf.splitTextToSize(
          sanitizeForPdf(section.commentary.summary),
          CONTENT_W
        )
        for (const line of summaryLines) {
          cursorY = ensureSpace(cursorY)
          pdf.text(line, MARGIN, cursorY)
          cursorY += 5
        }
        cursorY += 6

        cursorY = renderBlock("STRENGTHS", section.commentary.strengths, cursorY, () => "•  ")
        cursorY = renderBlock("AREAS OF CONCERN", section.commentary.concerns, cursorY, () => "•  ")
        cursorY = renderBlock(
          "RECOMMENDED ACTIONS",
          section.commentary.recommendations,
          cursorY,
          (i) => `${i + 1}.  `
        )
      }

      pdf.save(
        `audit-${projectName.toLowerCase().replace(/\s+/g, "-")}-${dateStr}.pdf`
      )

      toast.success("Audit ready", {
        id: toastId,
        description: "Your audit PDF has been downloaded.",
      })
    } catch (error) {
      toast.error("Couldn't generate audit", {
        id: toastId,
        description:
          error instanceof Error ? error.message : "The audit export failed.",
      })
    } finally {
      onDone()
      setIsExporting(false)
    }
  }

  return { exportPdf, isExporting }
}
