export function sanitizeNextPath(
  nextPath: string | null | undefined,
  fallbackPath: string = "/app"
) {
  const value = nextPath?.trim() ?? ""

  if (!value.startsWith("/") || value.startsWith("//")) {
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
