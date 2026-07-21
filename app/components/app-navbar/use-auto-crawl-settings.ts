import { useCallback, useEffect, useRef, useState } from "react"
import { clientApiFetch, clientApiPut } from "~/lib/api"
import type { AutoCrawlResponse } from "~/lib/api.types"
import { getCrawlValidationError } from "~/components/app-navbar/utils"

export type AutoCrawlConfig = {
  maxDepth: string
  maxPages: string
  delayMs: string
  jitterMs: string
  fetchTimeoutSeconds: string
  frequencyDays: string
  runAt: string
}

export const DEFAULT_AUTO_CRAWL_CONFIG: AutoCrawlConfig = {
  maxDepth: "5",
  maxPages: "",
  delayMs: "",
  jitterMs: "",
  fetchTimeoutSeconds: "10",
  frequencyDays: "1",
  runAt: "03:00",
}

export function useAutoCrawlSettings(
  activeProjectId?: string | null,
  refreshToken?: number
) {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [config, setConfig] = useState<AutoCrawlConfig>(
    DEFAULT_AUTO_CRAWL_CONFIG
  )
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [nextRunAt, setNextRunAt] = useState("")

  // Track activeProjectId to reload when it changes.
  const lastProjectIdRef = useRef<string | null | undefined>(undefined)

  const loadSettings = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const data = await clientApiFetch<AutoCrawlResponse>(
        `/projects/${activeProjectId}/auto-crawl`
      )
      setEnabled(data.enabled)
      setNextRunAt(data.next_run_at ?? "")
      const frequencyDays = data.frequency_days
        ? String(data.frequency_days)
        : DEFAULT_AUTO_CRAWL_CONFIG.frequencyDays
      const runAt = data.run_at || DEFAULT_AUTO_CRAWL_CONFIG.runAt
      if (data.config_snapshot) {
        setConfig({
          frequencyDays,
          runAt,
          maxDepth: String(data.config_snapshot.max_depth),
          maxPages:
            data.config_snapshot.max_pages !== undefined
              ? String(data.config_snapshot.max_pages)
              : "",
          delayMs:
            data.config_snapshot.request_delay_ms !== undefined
              ? String(data.config_snapshot.request_delay_ms)
              : "",
          jitterMs:
            data.config_snapshot.request_jitter_ms !== undefined
              ? String(data.config_snapshot.request_jitter_ms)
              : "",
          fetchTimeoutSeconds: String(
            data.config_snapshot.fetch_timeout_seconds
          ),
        })
      } else {
        setConfig({ ...DEFAULT_AUTO_CRAWL_CONFIG, frequencyDays, runAt })
      }
    } catch {
      // Defaults stay (disabled, empty config).
    } finally {
      setLoaded(true)
    }
  }, [activeProjectId])

  // Load on project change.
  useEffect(() => {
    if (lastProjectIdRef.current !== activeProjectId) {
      lastProjectIdRef.current = activeProjectId
      setLoaded(false)
      setEnabled(false)
      setConfig(DEFAULT_AUTO_CRAWL_CONFIG)
      void loadSettings()
    }
  }, [activeProjectId, loadSettings])

  // Re-fetch when an external actor (the AI agent) changes auto-crawl settings,
  // so the navbar reflects the new enabled/disabled state without a refresh.
  const lastRefreshTokenRef = useRef(refreshToken)
  useEffect(() => {
    if (refreshToken === undefined || refreshToken === lastRefreshTokenRef.current) {
      return
    }
    lastRefreshTokenRef.current = refreshToken
    void loadSettings()
  }, [refreshToken, loadSettings])

  const openDialog = useCallback(async () => {
    await loadSettings()
    setError("")
    setIsDialogOpen(true)
  }, [loadSettings])

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false)
    setError("")
  }, [])

  const handleDisable = useCallback(async () => {
    if (!activeProjectId || !enabled) return
    setIsSaving(true)
    try {
      await clientApiPut(`/projects/${activeProjectId}/auto-crawl`, {
        enabled: false,
      })
      setEnabled(false)
    } catch {
      // Silently ignore — the check indicator reverts on next load.
    } finally {
      setIsSaving(false)
    }
  }, [activeProjectId, enabled])

  const validateConfig = useCallback((cfg: AutoCrawlConfig): string | null => {
    const parsedMaxDepth = Number(cfg.maxDepth)
    const parsedFetchTimeoutSeconds = Number(cfg.fetchTimeoutSeconds)
    const baseError = getCrawlValidationError(
      parsedMaxDepth,
      parsedFetchTimeoutSeconds
    )
    if (baseError) return baseError

    const trimmedMaxPages = cfg.maxPages.trim()
    if (trimmedMaxPages !== "") {
      const n = Number(trimmedMaxPages)
      if (!Number.isInteger(n) || n <= 0) {
        return "Max pages must be a positive whole number, or left blank."
      }
    }

    const trimmedDelayMs = cfg.delayMs.trim()
    if (trimmedDelayMs !== "") {
      const n = Number(trimmedDelayMs)
      if (!Number.isInteger(n) || n <= 0) {
        return "Delay must be a positive whole number of milliseconds, or left blank."
      }
    }

    const trimmedJitterMs = cfg.jitterMs.trim()
    if (trimmedJitterMs !== "") {
      const n = Number(trimmedJitterMs)
      if (!Number.isInteger(n) || n <= 0) {
        return "Jitter must be a positive whole number of milliseconds, or left blank."
      }
    }

    const parsedFrequencyDays = Number(cfg.frequencyDays)
    if (
      !Number.isInteger(parsedFrequencyDays) ||
      parsedFrequencyDays < 1 ||
      parsedFrequencyDays > 30
    ) {
      return "Crawl frequency must be between 1 and 30 days."
    }

    if (!/^\d{2}:\d{2}$/.test(cfg.runAt)) {
      return "Crawl time must be a valid time of day."
    }

    return null
  }, [])

  const handleSaveConfig = useCallback(async () => {
    const validationError = validateConfig(config)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!activeProjectId) return

    const parsedMaxDepth = Number(config.maxDepth)
    const parsedFetchTimeoutSeconds = Number(config.fetchTimeoutSeconds)

    let parsedMaxPages: number | undefined
    const trimmedMaxPages = config.maxPages.trim()
    if (trimmedMaxPages !== "") {
      parsedMaxPages = Number(trimmedMaxPages)
    }

    let parsedDelayMs: number | undefined
    const trimmedDelayMs = config.delayMs.trim()
    if (trimmedDelayMs !== "") {
      parsedDelayMs = Number(trimmedDelayMs)
    }

    let parsedJitterMs: number | undefined
    const trimmedJitterMs = config.jitterMs.trim()
    if (trimmedJitterMs !== "") {
      parsedJitterMs = Number(trimmedJitterMs)
    }

    setIsSaving(true)
    setError("")
    try {
      const saved = await clientApiPut<AutoCrawlResponse>(
        `/projects/${activeProjectId}/auto-crawl`,
        {
          enabled: true,
          frequency_days: Number(config.frequencyDays),
          run_at: config.runAt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          config_snapshot: {
            max_depth: parsedMaxDepth,
            fetch_timeout_seconds: parsedFetchTimeoutSeconds,
            ...(parsedMaxPages !== undefined
              ? { max_pages: parsedMaxPages }
              : {}),
            ...(parsedDelayMs !== undefined
              ? { request_delay_ms: parsedDelayMs }
              : {}),
            ...(parsedJitterMs !== undefined
              ? { request_jitter_ms: parsedJitterMs }
              : {}),
          },
        }
      )
      setEnabled(true)
      setNextRunAt(saved.next_run_at ?? "")
      setIsDialogOpen(false)
      setError("")
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save auto-crawl settings."
      )
    } finally {
      setIsSaving(false)
    }
  }, [config, validateConfig, activeProjectId])

  return {
    enabled,
    loaded,
    config,
    isDialogOpen,
    isSaving,
    error,
    nextRunAt,
    setConfig,
    loadSettings,
    openDialog,
    closeDialog,
    handleDisable,
    handleSaveConfig,
  }
}
