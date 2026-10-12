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
  frequencyDays: "7",
  runAt: "03:00",
}

/** Auto crawl schedules. Every month is a fixed 30 days, not a calendar month. */
export const autoCrawlScheduleOptions = [
  { value: "7", label: "Every week" },
  { value: "14", label: "Every 2 weeks" },
  { value: "30", label: "Every month" },
]

/** Display fallback for auto crawl schedule: unsupported stored values show weekly without persisting. */
export function normalizeAutoCrawlFrequencyDaysForDisplay(
  value: string | number | null | undefined
): string {
  const text = value === null || value === undefined ? "" : String(value)
  return autoCrawlScheduleOptions.some((option) => option.value === text)
    ? text
    : DEFAULT_AUTO_CRAWL_CONFIG.frequencyDays
}

/** Auto crawl schedule validation: only weekly, biweekly, and monthly schedules are allowed. */
export function getAutoCrawlFrequencyValidationError(
  frequencyDays: string
): string | null {
  return autoCrawlScheduleOptions.some(
    (option) => option.value === frequencyDays
  )
    ? null
    : "Crawl frequency must be Every week, Every 2 weeks, or Every month."
}

export function useAutoCrawlSettings(activeProjectId?: string | null) {
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
      const frequencyDays = normalizeAutoCrawlFrequencyDaysForDisplay(
        data.frequency_days
      )
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

    const frequencyError = getAutoCrawlFrequencyValidationError(
      cfg.frequencyDays
    )
    if (frequencyError) return frequencyError

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
