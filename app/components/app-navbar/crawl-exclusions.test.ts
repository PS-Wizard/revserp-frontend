import { describe, expect, test } from "bun:test"

import {
  addExcludedUrlPatternTokens,
  buildRunCrawlConfigSnapshot,
  DEFAULT_EXCLUDED_URL_PATTERNS,
  countExcludedUrlPatternRunes,
  describeExcludedUrlPatternRejection,
  getExcludedUrlPatternError,
  getExcludedUrlPatternsStorageKey,
  isValidExcludedUrlPattern,
  loadExcludedUrlPatterns,
  MAX_EXCLUDED_URL_PATTERNS,
  resolveExcludedUrlPatternsUserId,
  saveExcludedUrlPatterns,
  splitExcludedUrlPatternTokens,
  validateExcludedUrlPatterns,
} from "./crawl-exclusions"

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe("crawl exclusion defaults", () => {
  test("defaults cover common non-content routes without a blanket admin rule", () => {
    const patterns: readonly string[] = DEFAULT_EXCLUDED_URL_PATTERNS
    for (const pattern of [
      "/wp-admin/*",
      "/wp-login.php",
      "/xmlrpc.php",
      "/administrator/*",
      "/login/*",
      "/logout/*",
      "/signin/*",
      "/sign-in/*",
      "/signout/*",
      "/sign-out/*",
      "/signup/*",
      "/sign-up/*",
      "/register/*",
      "/forgot-password/*",
      "/reset-password/*",
      "/password/reset/*",
      "/user/login/*",
      "/user/logout/*",
      "/user/password/*",
      "/wp-json/*",
      "/_next/*",
      "/_nuxt/*",
      "/_app/immutable/*",
      "/__vite*",
      "/__debug__/*",
      "/.git/*",
      "/.env",
      "/.env.*",
      "/node_modules/*",
    ]) {
      expect(patterns).toContain(pattern)
    }
    for (const pattern of ["/admin/*", "/vendor/*", "/debug/*", "/login*", "/signup*"]) {
      expect(patterns.includes(pattern)).toBe(false)
    }
    expect(new Set(patterns).size).toBe(patterns.length)
    expect(patterns.length < MAX_EXCLUDED_URL_PATTERNS).toBe(true)
    expect(validateExcludedUrlPatterns([...patterns])).toBe("")
  })
})

describe("crawl exclusion validation", () => {
  test("accepts root-relative paths and full http(s) URLs", () => {
    for (const pattern of [
      "/wp-admin/*",
      "/wp-login.php",
      "/admin/*",
      "/",
      "/exact-page",
      "https://example.com",
      "https://example.com/",
      "https://example.com/exact-page",
      "https://example.com/admin/*",
      "https://example.com/*",
      "http://example.com:8080/a",
      "HTTPS://EXAMPLE.COM/UPPER",
      "https://example.com/search?q=*",
    ]) {
      expect(getExcludedUrlPatternError(pattern)).toBe("")
      expect(isValidExcludedUrlPattern(pattern)).toBe(true)
    }
  })

  test("rejects invalid protocols and bare hosts", () => {
    for (const pattern of [
      "ftp://example.com/a",
      "javascript:alert(1)",
      "example.com/path",
      "admin/*",
      "*",
      "https://",
      "",
    ]) {
      expect(isValidExcludedUrlPattern(pattern)).toBe(false)
    }
  })

  test("rejects path-only query and fragment input", () => {
    expect(isValidExcludedUrlPattern("/search?q=1")).toBe(false)
    expect(isValidExcludedUrlPattern("/page#frag")).toBe(false)
    expect(isValidExcludedUrlPattern("https://example.com/a#b")).toBe(false)
  })

  test("non-* characters are literal, never regex", () => {
    for (const pattern of [
      "/foo(.*)",
      "/foo[bar]",
      "/a+b",
      "/a^b",
      "/a$b",
      "/a|b",
      "/a\\b",
      "/a{b}",
      "/price-$",
      "https://example.com/a+b",
      "http://[::1]/admin",
      "https://example.com/a(b)[c]",
    ]) {
      expect(getExcludedUrlPatternError(pattern)).toBe("")
      expect(isValidExcludedUrlPattern(pattern)).toBe(true)
    }
  })

  test("accepts full URLs with queries, with or without a path", () => {
    for (const pattern of [
      "https://example.com/search?q=*",
      "https://example.com?q=1",
      "https://example.com?a=b&c=d",
    ]) {
      expect(isValidExcludedUrlPattern(pattern)).toBe(true)
    }
  })

  test("rejects scheme-relative and hostless URLs", () => {
    for (const pattern of ["//example.com/x", "//", "https:///x"]) {
      expect(isValidExcludedUrlPattern(pattern)).toBe(false)
    }
  })

  test("accepts encoded paths, rejects malformed escapes", () => {
    for (const pattern of [
      "/caf%C3%A9",
      "https://example.com/a%20b",
      "https://example.com/?q=%zz",
    ]) {
      expect(isValidExcludedUrlPattern(pattern)).toBe(true)
    }
    for (const pattern of [
      "/foo%zz",
      "/100%",
      "https://example.com/%zz",
    ]) {
      expect(isValidExcludedUrlPattern(pattern)).toBe(false)
    }
  })

  test("rejects whitespace and control characters", () => {
    expect(isValidExcludedUrlPattern("/path with space")).toBe(false)
    expect(isValidExcludedUrlPattern("https://example.com/a b")).toBe(false)
    expect(isValidExcludedUrlPattern("/tab\there")).toBe(false)
    expect(isValidExcludedUrlPattern("/null\0here")).toBe(false)
  })

  test("rejects overlong patterns", () => {
    expect(isValidExcludedUrlPattern(`/${"a".repeat(2048)}`)).toBe(false)
    expect(isValidExcludedUrlPattern(`/${"a".repeat(2046)}*`)).toBe(true)
  })

  test("counts runes, not UTF-16 units", () => {
    expect(countExcludedUrlPatternRunes("/😀")).toBe(2)
    expect(isValidExcludedUrlPattern(`/${"😀".repeat(2047)}`)).toBe(true)
    expect(isValidExcludedUrlPattern(`/${"😀".repeat(2048)}`)).toBe(false)
    expect(isValidExcludedUrlPattern(`/${"é".repeat(2047)}`)).toBe(true)
  })
})

describe("crawl exclusion token editing", () => {
  test("space, tab, and newline all split tokens", () => {
    expect(splitExcludedUrlPatternTokens("/a/* /b/*\n/c/*\t/d/*")).toEqual([
      "/a/*",
      "/b/*",
      "/c/*",
      "/d/*",
    ])
    expect(splitExcludedUrlPatternTokens("   ")).toEqual([])
  })

  test("trims tokens and drops exact duplicates", () => {
    const result = addExcludedUrlPatternTokens(["/a/*"], "  /b/*  /a/* ")
    expect(result.patterns).toEqual(["/a/*", "/b/*"])
    expect(result.added).toEqual(["/b/*"])
    expect(result.duplicates).toEqual(["/a/*"])
    expect(result.invalid).toEqual([])
  })

  test("duplicate paste entries collapse to one", () => {
    const result = addExcludedUrlPatternTokens([], "/a/* /a/*\n/a/*")
    expect(result.patterns).toEqual(["/a/*"])
    expect(result.duplicates).toEqual(["/a/*", "/a/*"])
  })

  test("keeps path case as typed; dedupe is exact", () => {
    const result = addExcludedUrlPatternTokens([], "/Admin/* /admin/*")
    expect(result.patterns).toEqual(["/Admin/*", "/admin/*"])
  })

  test("invalid tokens stay out and are reported", () => {
    const result = addExcludedUrlPatternTokens([], "/ok/* ftp://x not-a-pattern")
    expect(result.patterns).toEqual(["/ok/*"])
    expect(result.invalid).toEqual(["ftp://x", "not-a-pattern"])
    expect(
      describeExcludedUrlPatternRejection(result.invalid, result.capped) === ""
    ).toBe(false)
  })

  test("stops at the max count", () => {
    const existing = Array.from({ length: 99 }, (_, i) => `/p-${i}/*`)
    const result = addExcludedUrlPatternTokens(existing, "/last/* /over/*")
    expect(result.patterns).toHaveLength(MAX_EXCLUDED_URL_PATTERNS)
    expect(result.patterns).toContain("/last/*")
    expect(result.capped).toBe(true)
    expect(
      describeExcludedUrlPatternRejection(result.invalid, result.capped)
    ).toContain("100")
  })

  test("pending draft commits on submit, including a single unsplit URL", () => {
    const result = addExcludedUrlPatternTokens(
      ["/wp-admin/*"],
      "https://example.com/private/*"
    )
    expect(result.patterns).toEqual([
      "/wp-admin/*",
      "https://example.com/private/*",
    ])
    expect(validateExcludedUrlPatterns(result.patterns)).toBe("")
  })

  test("submit validation rejects over-limit lists", () => {
    const patterns = Array.from({ length: 101 }, (_, i) => `/p-${i}/*`)
    expect(validateExcludedUrlPatterns(patterns) === "").toBe(false)
  })
})

describe("crawl exclusion persistence", () => {
  test("round-trips the exact list, including empty", () => {
    const storage = memoryStorage()
    saveExcludedUrlPatterns(storage, "u-1", "p-1", ["/a/*", "/b"])
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toEqual([
      "/a/*",
      "/b",
    ])
    saveExcludedUrlPatterns(storage, "u-1", "p-1", [])
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toEqual([])
  })

  test("user and project scopes stay isolated", () => {
    const storage = memoryStorage()
    saveExcludedUrlPatterns(storage, "u-1", "p-1", ["/a/*"])
    saveExcludedUrlPatterns(storage, "u-2", "p-1", ["/b/*"])
    saveExcludedUrlPatterns(storage, "u-1", "p-2", [])
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toEqual(["/a/*"])
    expect(loadExcludedUrlPatterns(storage, "u-2", "p-1")).toEqual(["/b/*"])
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-2")).toEqual([])
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-9")).toBeNull()
    expect(getExcludedUrlPatternsStorageKey("u-1", "p-1")).toContain("u-1")
    expect(getExcludedUrlPatternsStorageKey("u-1", "p-1")).toContain("p-1")
  })

  test("malformed or missing entries fall back to defaults", () => {
    const storage = memoryStorage()
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toBeNull()
    storage.setItem(getExcludedUrlPatternsStorageKey("u-1", "p-1"), "nope{")
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toBeNull()
    storage.setItem(
      getExcludedUrlPatternsStorageKey("u-1", "p-1"),
      JSON.stringify({ not: "array" })
    )
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toBeNull()
    storage.setItem(
      getExcludedUrlPatternsStorageKey("u-1", "p-1"),
      JSON.stringify(["/ok/*", "ftp://x"])
    )
    expect(loadExcludedUrlPatterns(storage, "u-1", "p-1")).toBeNull()
  })

  test("missing scope or broken storage never throws", () => {
    const storage = memoryStorage()
    expect(loadExcludedUrlPatterns(null, "u-1", "p-1")).toBeNull()
    expect(loadExcludedUrlPatterns(storage, "", "p-1")).toBeNull()
    expect(loadExcludedUrlPatterns(storage, "u-1", "")).toBeNull()
    const broken = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
    }
    expect(loadExcludedUrlPatterns(broken, "u-1", "p-1")).toBeNull()
    saveExcludedUrlPatterns(broken, "u-1", "p-1", ["/a/*"])
  })

  test("user scope prefers the stable id, then email", () => {
    expect(resolveExcludedUrlPatternsUserId("u-1", "a@x.com")).toBe("u-1")
    expect(resolveExcludedUrlPatternsUserId(null, "a@x.com")).toBe("a@x.com")
    expect(resolveExcludedUrlPatternsUserId(null, null)).toBeNull()
  })
})

describe("run crawl snapshot wiring", () => {
  test("excluded patterns ride as an array; other options stay intact", () => {
    const snapshot = buildRunCrawlConfigSnapshot(
      { max_depth: 5, fetch_timeout_seconds: 60 },
      ["/a/*"]
    )
    expect(snapshot).toEqual({
      max_depth: 5,
      fetch_timeout_seconds: 60,
      excluded_url_patterns: ["/a/*"],
    })
    expect(
      buildRunCrawlConfigSnapshot({ max_depth: 5 }, []).excluded_url_patterns
    ).toEqual([])
  })
})
