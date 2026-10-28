/**
 * Format an editor text selection as a markdown quote for the Revbot
 * composer, so the draft chat sees exactly what the user highlighted.
 */
export function quoteSelectionToMarkdown(selection: string): string | null {
  const text = selection.trim()
  if (!text) return null
  const quoted = text
    .split("\n")
    .map((line) => `> ${line.trimEnd()}`)
    .join("\n")
  return `${quoted}\n\n`
}
