import { expect, test } from "bun:test"
import { getSafeProjectWebsiteUrl } from "./project-website"

test("project website links accept only absolute HTTP and HTTPS URLs", () => {
  expect(getSafeProjectWebsiteUrl({ base_url: " https://example.com/path " })).toBe("https://example.com/path")
  expect(getSafeProjectWebsiteUrl({ base_url: "http://example.com" })).toBe("http://example.com/")
  for (const base_url of ["", "/relative", "not a URL", "javascript:alert(1)", "data:text/html,test", "file:///etc/passwd"]) {
    expect(getSafeProjectWebsiteUrl({ base_url })).toBeNull()
  }
})
