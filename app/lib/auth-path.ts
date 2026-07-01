export function sanitizeNextPath(
  nextPath: string | null | undefined,
  fallbackPath: string = "/app"
) {
  const value = nextPath?.trim() ?? ""

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f\s]/.test(value)
  ) {
    return fallbackPath
  }

  return value
}

export function buildAuthHref(path: string, nextPath: string) {
  if (nextPath === "/app") {
    return path
  }

  return `${path}?next=${encodeURIComponent(nextPath)}`
}
