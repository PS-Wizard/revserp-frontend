export const PILLAR_IDS = ["seo", "aeo", "pagespeed"] as const
export type PillarId = (typeof PILLAR_IDS)[number]

export const PILLAR_LABEL: Record<PillarId, string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

// You = blue. Same hue the SEO / AEO history lines already use.
export const PAINT_A = {
  color: "oklch(0.78 0.12 230)",
  soft: "oklch(0.78 0.12 230 / 0.16)",
  dim: "oklch(0.78 0.12 230 / 0.28)",
}
