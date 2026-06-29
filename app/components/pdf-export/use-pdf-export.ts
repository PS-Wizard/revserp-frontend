import { useState } from "react"
import { toPng } from "html-to-image"
import jsPDF from "jspdf"
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
  overallRef: React.RefObject<HTMLDivElement | null>
  seoRef: React.RefObject<HTMLDivElement | null>
  aeoRef: React.RefObject<HTMLDivElement | null>
  pagespeedRef: React.RefObject<HTMLDivElement | null>
  onSectionsReady: () => void
  onDone: () => void
}

function loadImageAspectRatio(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.height / img.width)
    img.src = dataUrl
  })
}

const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2

export function usePdfExport({
  crawlId,
  projectName,
  currentCrawl,
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

    try {
      const commentary = await clientApiFetch<CommentaryResponse>(
        `/crawls/${crawlId}/commentary`
      )

      onSectionsReady()
      await new Promise((r) => setTimeout(r, 2000))

      const captureOpts = { pixelRatio: 2, backgroundColor: "#09090b" }
      const [overallPng, seoPng, aeoPng, pagespeedPng] = await Promise.all([
        toPng(overallRef.current!, captureOpts),
        toPng(seoRef.current!, captureOpts),
        toPng(aeoRef.current!, captureOpts),
        toPng(pagespeedRef.current!, captureOpts),
      ])

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const dateStr = new Date().toISOString().slice(0, 10)

      // Cover page
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(28)
      pdf.setTextColor(20, 20, 20)
      pdf.text("SEO AUDIT REPORT", MARGIN, 60)

      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(14)
      pdf.setTextColor(100, 100, 100)
      pdf.text(projectName, MARGIN, 72)

      pdf.setDrawColor(220, 220, 220)
      pdf.setLineWidth(0.3)
      pdf.line(MARGIN, 92, PAGE_W - MARGIN, 92)

      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(11)
      pdf.setTextColor(60, 60, 60)
      pdf.text("Score Overview", MARGIN, 104)

      const scoreBoxes = [
        { label: "Overall", score: currentCrawl?.overall_score },
        { label: "SEO", score: currentCrawl?.seo_score },
        { label: "AEO", score: currentCrawl?.aeo_score },
        { label: "PageSpeed", score: currentCrawl?.pagespeed_score },
      ]
      const scoreXPositions = [MARGIN, MARGIN + 65, MARGIN + 130, MARGIN + 195]

      for (let i = 0; i < scoreBoxes.length; i++) {
        const box = scoreBoxes[i]
        const x = scoreXPositions[i]
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(9)
        pdf.setTextColor(100, 100, 100)
        pdf.text(box.label, x, 115)

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(22)
        pdf.setTextColor(20, 20, 20)
        const scoreText = box.score != null ? `${Math.round(box.score)}%` : "—"
        pdf.text(scoreText, x, 132)
      }

      pdf.setDrawColor(220, 220, 220)
      pdf.setLineWidth(0.3)
      pdf.line(MARGIN, 145, PAGE_W - MARGIN, 145)

      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(9)
      pdf.setTextColor(150, 150, 150)
      pdf.text(`Generated ${dateStr}`, MARGIN, 158)

      pdf.setFontSize(8)
      pdf.setTextColor(180, 180, 180)
      pdf.text("Powered by Revketer", MARGIN, 164)

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

      for (const section of sections) {
        // Image page
        pdf.addPage()

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(9)
        pdf.setTextColor(150, 150, 150)
        pdf.text(section.imageLabel, MARGIN, MARGIN + 4)

        pdf.setDrawColor(220, 220, 220)
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

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(18)
        pdf.setTextColor(20, 20, 20)
        pdf.text(section.label, MARGIN, MARGIN + 8)

        if (section.score != null) {
          pdf.text(`${Math.round(section.score)}%`, PAGE_W - MARGIN, MARGIN + 8, { align: "right" })
        }

        pdf.setDrawColor(220, 220, 220)
        pdf.setLineWidth(0.3)
        pdf.line(MARGIN, MARGIN + 14, PAGE_W - MARGIN, MARGIN + 14)

        let cursorY = MARGIN + 20

        // Summary
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(10)
        pdf.setTextColor(50, 50, 50)
        const summaryLines = pdf.splitTextToSize(section.commentary.summary, CONTENT_W)
        for (const line of summaryLines) {
          if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
          pdf.text(line, MARGIN, cursorY)
          cursorY += 5
        }
        cursorY += 6

        // Strengths
        if (section.commentary.strengths.length > 0) {
          if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
          pdf.setFont("helvetica", "bold")
          pdf.setFontSize(9)
          pdf.setTextColor(30, 30, 30)
          pdf.text("STRENGTHS", MARGIN, cursorY)
          cursorY += 7

          for (const item of section.commentary.strengths) {
            pdf.setFont("helvetica", "normal")
            pdf.setFontSize(9.5)
            pdf.setTextColor(50, 50, 50)
            const itemLines = pdf.splitTextToSize(`•  ${item}`, CONTENT_W - 8)
            for (const line of itemLines) {
              if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
              pdf.text(line, MARGIN + 8, cursorY)
              cursorY += 5
            }
          }
          cursorY += 5
        }

        // Concerns
        if (section.commentary.concerns.length > 0) {
          if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
          pdf.setFont("helvetica", "bold")
          pdf.setFontSize(9)
          pdf.setTextColor(30, 30, 30)
          pdf.text("AREAS OF CONCERN", MARGIN, cursorY)
          cursorY += 7

          for (const item of section.commentary.concerns) {
            pdf.setFont("helvetica", "normal")
            pdf.setFontSize(9.5)
            pdf.setTextColor(50, 50, 50)
            const itemLines = pdf.splitTextToSize(`•  ${item}`, CONTENT_W - 8)
            for (const line of itemLines) {
              if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
              pdf.text(line, MARGIN + 8, cursorY)
              cursorY += 5
            }
          }
          cursorY += 5
        }

        // Recommendations
        if (section.commentary.recommendations.length > 0) {
          if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
          pdf.setFont("helvetica", "bold")
          pdf.setFontSize(9)
          pdf.setTextColor(30, 30, 30)
          pdf.text("RECOMMENDED ACTIONS", MARGIN, cursorY)
          cursorY += 7

          for (let i = 0; i < section.commentary.recommendations.length; i++) {
            const item = section.commentary.recommendations[i]
            pdf.setFont("helvetica", "normal")
            pdf.setFontSize(9.5)
            pdf.setTextColor(50, 50, 50)
            const itemLines = pdf.splitTextToSize(`${i + 1}.  ${item}`, CONTENT_W - 8)
            for (const line of itemLines) {
              if (cursorY > PAGE_H - MARGIN) { pdf.addPage(); cursorY = MARGIN + 8 }
              pdf.text(line, MARGIN + 8, cursorY)
              cursorY += 5
            }
          }
          cursorY += 5
        }
      }

      pdf.save(`audit-${projectName.toLowerCase().replace(/\s+/g, "-")}-${dateStr}.pdf`)
    } finally {
      onDone()
      setIsExporting(false)
    }
  }

  return { exportPdf, isExporting }
}
