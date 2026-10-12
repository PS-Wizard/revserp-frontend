import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { HandbookThemeToggle } from "~/components/handbook/handbook-theme-toggle"

describe("handbook theme toggle", () => {
  test("renders the dark-mode default without a DOM", () => {
    const markup = renderToStaticMarkup(<HandbookThemeToggle />)
    expect(markup).toContain('aria-label="Switch to light mode"')
  })
})
