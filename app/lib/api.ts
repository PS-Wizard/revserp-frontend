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

export function clientApiPost<T>(
  path: string,
  body: unknown,
  init: RequestInit = {}
) {
  return clientApiFetch<T>(path, {
    ...init,
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

// SSE over POST. EventSource can't POST, so we read the ReadableStream directly,
// parse `event:`/`data:` frames (multiline data supported), and dispatch each to
// onEvent. Aborts via `signal`. If the stream ends without a `done` frame, a
// synthetic `error` event is emitted so callers can surface the failure.
export async function clientApiStream(
  path: string,
  body: unknown,
  {
    signal,
    onEvent,
  }: {
    signal?: AbortSignal
    onEvent: (event: string, payload: unknown) => void
  }
) {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: new Headers({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const responseText = await response.text()
    const responseBody = parseResponseBody(responseText)
    const message =
      extractErrorMessage(responseBody) ||
      response.statusText ||
      "Request failed"
    throw new ApiError(response.status, message, responseBody)
  }

  if (!response.body) {
    throw new ApiError(0, "Empty stream response", null)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let sawDone = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let frameEnd = buffer.indexOf("\n\n")
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd)
        buffer = buffer.slice(frameEnd + 2)
        const parsedFrame = parseSSEFrame(frame)
        if (parsedFrame) {
          if (parsedFrame.event === "done") sawDone = true
          onEvent(parsedFrame.event, parsedFrame.data)
        }
        frameEnd = buffer.indexOf("\n\n")
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!sawDone) {
    onEvent("error", { message: "Stream ended unexpectedly" })
  }
}

function parseSSEFrame(frame: string): { event: string; data: unknown } | null {
  let event = "message"
  const dataLines: string[] = []

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  const dataText = dataLines.join("\n")
  try {
    return { event, data: JSON.parse(dataText) }
  } catch {
    return { event, data: dataText }
  }
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
