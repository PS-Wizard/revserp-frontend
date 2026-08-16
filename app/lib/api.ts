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

// Read a GET SSE stream. A normal stream end is not an error: callers decide
// whether a reconnect is needed based on the events they received.
export async function clientApiSSE(
  path: string,
  {
    signal,
    onEvent,
  }: {
    signal?: AbortSignal
    onEvent: (event: string, payload: unknown, eventId: string | null) => void
  }
) {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: new Headers({ Accept: "text/event-stream" }),
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

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = drainSSEFrames(buffer, onEvent)
    }
    buffer += decoder.decode()
    drainSSEFrames(buffer, onEvent, true)
  } finally {
    reader.releaseLock()
  }
}

function drainSSEFrames(
  buffer: string,
  onEvent: (event: string, payload: unknown, eventId: string | null) => void,
  final = false
) {
  let separator = buffer.match(/\r?\n\r?\n/)
  while (separator?.index !== undefined) {
    const frame = buffer.slice(0, separator.index)
    buffer = buffer.slice(separator.index + separator[0].length)
    const parsedFrame = parseSSEFrame(frame)
    if (parsedFrame)
      onEvent(parsedFrame.event, parsedFrame.data, parsedFrame.id)
    separator = buffer.match(/\r?\n\r?\n/)
  }
  if (final && buffer) {
    const parsedFrame = parseSSEFrame(buffer)
    if (parsedFrame)
      onEvent(parsedFrame.event, parsedFrame.data, parsedFrame.id)
    return ""
  }
  return buffer
}

function parseSSEFrame(
  frame: string
): { event: string; data: unknown; id: string | null } | null {
  let event = "message"
  let id: string | null = null
  const dataLines: string[] = []

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("id:")) {
      id = line.slice("id:".length).trim()
    } else if (line.startsWith("event:")) {
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
    return { event, data: JSON.parse(dataText), id }
  } catch {
    return { event, data: dataText, id }
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
