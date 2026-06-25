export class ApiError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

export function buildApiUrl(path: string) {
  const apiBaseUrl =
    import.meta.env.VITE_API_URL?.trim() || "http://localhost:8080"
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

export async function clientApiFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  })

  return parseApiResponse<T>(response)
}

export function clientApiPost<T>(path: string, body: unknown) {
  return clientApiFetch<T>(path, {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  })
}

export function clientApiPut<T>(path: string, body: unknown) {
  return clientApiFetch<T>(path, {
    method: "PUT",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  })
}

export function clientApiDelete<T>(path: string) {
  return clientApiFetch<T>(path, {
    method: "DELETE",
  })
}

export async function serverApiFetch<T>(
  path: string,
  request: Request,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers)

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  const cookieHeader = request.headers.get("cookie")
  if (cookieHeader && !headers.has("Cookie")) {
    headers.set("Cookie", cookieHeader)
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  })

  return parseApiResponse<T>(response)
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text()
  const responseBody = parseResponseBody(responseText)

  if (!response.ok) {
    const message =
      extractErrorMessage(responseBody) ||
      response.statusText ||
      "Request failed"
    throw new ApiError(response.status, message, responseBody)
  }

  return responseBody as T
}

function parseResponseBody(responseText: string) {
  if (responseText.trim() === "") {
    return null
  }

  try {
    return JSON.parse(responseText)
  } catch {
    return responseText
  }
}

function extractErrorMessage(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== "object") {
    return null
  }

  const errorValue = (responseBody as { error?: unknown }).error
  if (typeof errorValue !== "string" || errorValue.trim() === "") {
    return null
  }

  return errorValue
}
