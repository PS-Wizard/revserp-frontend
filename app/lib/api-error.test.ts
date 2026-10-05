import { describe, expect, test } from "bun:test"
import { ApiError } from "./api"

describe("API error messages", () => {
  test("shows a sign-in action instead of a raw authorization error", () => {
    const error = new ApiError(401, "Unauthorized", { error: "Unauthorized" })
    expect(error.message).toBe("Sign in to continue.")
    expect(error.status).toBe(401)
    expect(error.details).toEqual({ error: "Unauthorized" })
  })

  test("preserves specific sign-in errors", () => {
    expect(new ApiError(401, "Invalid credentials", null).message).toBe("Invalid credentials")
    expect(new ApiError(500, "Request failed", null).message).toBe("Request failed")
  })
})
