"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"

import {
  ACCENTS,
  accentChain,
  createShader,
  cubicBezier,
  playSweep,
  type ShaderController,
} from "glimm"

import { ArrowUpIcon, MicIcon, PlusIcon, SquareIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import type { AIReasoningEffort, AITurnImage } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import { compressRevbotImage } from "./compress-revbot-image"

const MAX_IMAGES = 4
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
])

type ComposerAttachment = {
  file: File
  id: string
  previewUrl: string
}

function isAcceptedImageFile(file: File) {
  return ACCEPTED_IMAGE_TYPES.has(file.type)
}

type AutocompleteMode = "source" | "command"

/**
 * Sweep easing: glimm's "snap" (cubic-bezier(1, 0, 0.35, 0.95)) with a
 * steeper initial slope so the band enters fast, then settles dramatically.
 */
const SWEEP_EASING = cubicBezier(0.8, 0.5, 0.35, 0.95)
type Autocomplete = { mode: AutocompleteMode; query: string; start: number }
type ComposerOption = { description: string; name: string }

const sourceOptions: ComposerOption[] = [
  { name: "Overview", description: "High-level audit and site health" },
  { name: "SEO", description: "Search visibility and on-page signals" },
  { name: "AEO", description: "Answer engine optimization signals" },
  { name: "PageSpeed", description: "Performance and Core Web Vitals" },
  { name: "Site graph", description: "Internal links and site structure" },
]
const commandOptions: ComposerOption[] = [
  { name: "summarize", description: "Start a concise audit summary prompt" },
  { name: "compare", description: "Start a prompt comparing pages or audits" },
  {
    name: "find-issues",
    description: "Start a prompt to find priority issues",
  },
]

const maxTextareaHeight = 100
const RAINBOW = accentChain([
  ACCENTS.red,
  ACCENTS.orange,
  ACCENTS.yellow,
  ACCENTS.green,
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.purple,
])

function Icon({
  children,
  size = 15,
  strokeWidth = 1.8,
}: {
  children: React.ReactNode
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

function getAutocomplete(value: string, caret: number): Autocomplete | null {
  const match = value.slice(0, caret).match(/(?:^|\s)([@/])([^\s@/]*)$/)
  if (!match) return null

  return {
    mode: match[1] === "@" ? "source" : "command",
    query: match[2],
    start: caret - match[2].length - 1,
  }
}

type DictationRecognition = {
  abort: () => void
  continuous?: boolean
  interimResults?: boolean
  lang?: string
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: DictationRecognitionResultEvent) => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
}

type DictationRecognitionConstructor = new () => DictationRecognition

type DictationRecognitionResultEvent = {
  results: {
    [index: number]: { 0?: { transcript: string } }
    length: number
  }
}

type SpeechRecognitionWindow = typeof window & {
  SpeechRecognition?: DictationRecognitionConstructor
  webkitSpeechRecognition?: DictationRecognitionConstructor
}

export const REVBOT_PROMPT_INPUT_ID = "revbot-prompt"

export function focusRevbotPrompt(container?: ParentNode | null) {
  const root = container ?? document
  const input = root.querySelector<HTMLTextAreaElement>(
    `#${REVBOT_PROMPT_INPUT_ID}`
  )
  if (!input || input.disabled) return false

  input.focus()
  const end = input.value.length
  input.setSelectionRange(end, end)
  return true
}

type RevbotComposerProps = {
  active: boolean
  allowedEfforts: AIReasoningEffort[]
  disabled: boolean
  effort: AIReasoningEffort
  onEffortChange: (effort: AIReasoningEffort) => void
  onSend: (content: string, images?: AITurnImage[]) => void
  onStop: () => void
  showMic?: boolean
  stopping: boolean
  variant?: "default" | "dark"
}

export function RevbotComposer({
  active,
  allowedEfforts,
  disabled,
  effort,
  onEffortChange,
  onSend,
  onStop,
  showMic = true,
  stopping,
  variant = "default",
}: RevbotComposerProps) {
  const [prompt, setPrompt] = useState("")
  const [autocomplete, setAutocomplete] = useState<Autocomplete | null>(null)
  const [activeOptionIndex, setActiveOptionIndex] = useState(0)
  const [effortOpen, setEffortOpen] = useState(false)
  const [effortHovered, setEffortHovered] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [menuEngaged, setMenuEngaged] = useState(false)
  const [rowBox, setRowBox] = useState<{
    height: number
    top: number
  } | null>(null)
  const [effortBox, setEffortBox] = useState<{
    height: number
    top: number
  } | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const effortButtonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const effortRefs = useRef<(HTMLButtonElement | null)[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shaderRef = useRef<ShaderController | null>(null)
  const sweepRef = useRef<ReturnType<typeof playSweep> | null>(null)
  const recognitionRef = useRef<DictationRecognition | null>(null)
  const dictationBaseRef = useRef("")
  const dictationCancelRef = useRef(false)
  const dictationStartRef = useRef(0)
  const dictationTimerRef = useRef<number | null>(null)
  const dictationStreamRef = useRef<MediaStream | null>(null)
  const dictationAudioRef = useRef<AudioContext | null>(null)
  const dictationAnalyserRef = useRef<AnalyserNode | null>(null)
  const dictationBinsRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const promptRef = useRef(prompt)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef<ComposerAttachment[]>([])
  const sendingRef = useRef(false)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [speechRecognitionAvailable, setSpeechRecognitionAvailable] =
    useState(false)
  const [listening, setListening] = useState(false)
  const [dictationSecs, setDictationSecs] = useState(0)
  const [dictationLevels, setDictationLevels] = useState<number[]>([])
  const [sending, setSending] = useState(false)

  const autocompleteOptions =
    autocomplete?.mode === "source" ? sourceOptions : commandOptions
  const filteredOptions = autocomplete
    ? autocompleteOptions.filter((option) =>
        option.name.toLowerCase().includes(autocomplete.query.toLowerCase())
      )
    : []
  const activeOption = filteredOptions[activeOptionIndex]
  const activeOptionId = activeOption
    ? `revbot-autocomplete-option-${activeOptionIndex}`
    : undefined
  const effortIndex = allowedEfforts.indexOf(effort)
  const isDark = variant === "dark"
  const canSend =
    !disabled &&
    !sending &&
    !listening &&
    (prompt.trim().length > 0 || attachments.length > 0)
  const showEffort = allowedEfforts.length > 1
  const actionColCount = (showMic ? 2 : 1) + (showEffort ? 1 : 0)
  const sendColClass = showEffort
    ? expanded
      ? showMic
        ? "col-start-5 row-start-2"
        : "col-start-3 row-start-2"
      : showMic
        ? "col-start-5 row-start-1"
        : "col-start-4 row-start-1"
    : expanded
      ? showMic
        ? "col-start-4 row-start-2"
        : "col-start-2 row-start-2"
      : showMic
        ? "col-start-4 row-start-1"
        : "col-start-3 row-start-1"

  useEffect(() => {
    promptRef.current = prompt
  }, [prompt])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }, [])

  useEffect(() => {
    setActiveOptionIndex(0)
    setMenuEngaged(false)
  }, [autocomplete?.mode, autocomplete?.query])

  useLayoutEffect(() => {
    const target = optionRefs.current[activeOptionIndex]
    if (target) {
      setRowBox({ height: target.offsetHeight, top: target.offsetTop })
    }
  }, [activeOptionIndex, filteredOptions.length])

  useLayoutEffect(() => {
    if (!effortOpen) return
    const target = effortRefs.current[effortHovered ?? effortIndex]
    if (target) {
      setEffortBox({ height: target.offsetHeight, top: target.offsetTop })
    }
  }, [effortHovered, effortIndex, effortOpen])

  useEffect(() => {
    if (!effortOpen) setEffortHovered(null)
  }, [effortOpen])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const controls = controlsRef.current
    const measure = measureRef.current
    if (!textarea || !controls || !measure) return

    const fixedControlsWidth =
      28 * actionColCount + (effortButtonRef.current?.offsetWidth ?? 0)

    const inlineGaps = 4 * 4
    const inlineInputWidth =
      controls.clientWidth - fixedControlsWidth - inlineGaps
    const needsFullWidth =
      prompt.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth)

    textarea.style.height = "0px"
    const contentHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(
      Math.max(contentHeight, 28),
      maxTextareaHeight
    )}px`
    textarea.style.overflowY =
      contentHeight > maxTextareaHeight ? "auto" : "hidden"
  }, [actionColCount, expanded, prompt])

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow
    setSpeechRecognitionAvailable(
      Boolean(
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
      )
    )
    return () => {
      const recognition = recognitionRef.current
      recognitionRef.current = null
      stopDictationVisuals()
      if (!recognition) return
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.onstart = null
      recognition.abort()
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const destroyShader = () => {
      sweepRef.current?.cancel()
      shaderRef.current?.destroy()
      shaderRef.current = null
      const canvas = canvasRef.current
      if (canvas) canvas.width = canvas.width
    }
    const handleMotionChange = () => {
      if (mediaQuery.matches) destroyShader()
    }

    mediaQuery.addEventListener("change", handleMotionChange)
    return () => {
      mediaQuery.removeEventListener("change", handleMotionChange)
      destroyShader()
    }
  }, [])

  function updatePrompt(value: string, caret: number) {
    promptRef.current = value
    setPrompt(value)
    setAutocomplete(getAutocomplete(value, caret))
  }

  function addImageFiles(files: File[]) {
    setAttachments((current) => {
      const remaining = MAX_IMAGES - current.length
      if (remaining <= 0) return current
      const next = files
        .filter(isAcceptedImageFile)
        .slice(0, remaining)
        .map((file) => ({
          file,
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
        }))
      return next.length ? [...current, ...next] : current
    })
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((attachment) => attachment.id !== id)
    })
  }

  function clearAttachments() {
    for (const attachment of attachmentsRef.current) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
    attachmentsRef.current = []
    setAttachments([])
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const clipboard = event.clipboardData
    if (!clipboard) return

    const files: File[] = []
    for (const item of Array.from(clipboard.items)) {
      if (!item.type.startsWith("image/")) continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    if (!files.length) return

    event.preventDefault()
    addImageFiles(files)
  }

  async function handleSend() {
    const content = prompt.trim()
    const files = attachments.map((attachment) => attachment.file)
    if (disabled || sendingRef.current || (!content && files.length === 0)) {
      return
    }

    sendingRef.current = true
    setSending(true)
    try {
      const images: AITurnImage[] = []
      for (const file of files) {
        const compressed = await compressRevbotImage(file)
        if (compressed) images.push(compressed)
      }
      if (!content && images.length === 0) return
      onSend(content, images.length ? images : undefined)
      setPrompt("")
      setAutocomplete(null)
      promptRef.current = ""
      clearAttachments()
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function selectAutocomplete(option: ComposerOption) {
    if (!autocomplete) return

    const textarea = textareaRef.current
    const end = textarea?.selectionEnd ?? prompt.length
    const marker = autocomplete.mode === "source" ? "@" : "/"
    const token = `${marker}${option.name} `
    const nextPrompt = `${prompt.slice(0, autocomplete.start)}${token}${prompt.slice(end)}`
    const selectionStart = autocomplete.start + token.length

    updatePrompt(nextPrompt, selectionStart)
    setAutocomplete(null)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(selectionStart, selectionStart)
    })
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (autocomplete) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        if (filteredOptions.length) {
          setMenuEngaged(true)
          setActiveOptionIndex((index) =>
            event.key === "ArrowDown"
              ? (index + 1) % filteredOptions.length
              : (index - 1 + filteredOptions.length) % filteredOptions.length
          )
        }
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        if (activeOption) selectAutocomplete(activeOption)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setAutocomplete(null)
        setEffortOpen(false)
        return
      }
    }

    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    if (canSend) handleSend()
  }

  function makeShader() {
    const canvas = canvasRef.current
    if (!canvas) return null
    const random = Math.random
    Math.random = () => 0
    try {
      return createShader({
        canvas,
        palette: RAINBOW,
        direction: "ltr",
        bandTight: 7,
        brightness: 1,
        swellAmount: 0.2,
      })
    } finally {
      Math.random = random
    }
  }

  function selectEffort(next: AIReasoningEffort) {
    setEffortOpen(false)
    if (next === effort || disabled) return
    onEffortChange(next)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    sweepRef.current?.cancel()
    shaderRef.current?.destroy()
    const shader = makeShader()
    if (!shader) return
    shaderRef.current = shader
    const sweep = playSweep(shader, {
      palette: RAINBOW,
      direction: "ltr",
      sweepMs: 700,
      outroMs: 250,
      peakAlpha: 0.55,
      bandTight: 7,
      brightness: 1,
      swellAmount: 0.25,
      waveSpeed: 0,
      easing: SWEEP_EASING,
    })
    sweepRef.current = sweep
    sweep.done.finally(() => {
      if (shaderRef.current === shader) {
        shader.destroy()
        shaderRef.current = null
      }
      if (sweepRef.current === sweep) sweepRef.current = null
      const canvas = canvasRef.current
      if (canvas) canvas.width = canvas.width
    })
  }

  function formatDictationSecs(total: number) {
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  function stopDictationVisuals() {
    if (dictationTimerRef.current !== null) {
      window.clearInterval(dictationTimerRef.current)
      dictationTimerRef.current = null
    }
    const stream = dictationStreamRef.current
    dictationStreamRef.current = null
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    const audio = dictationAudioRef.current
    dictationAudioRef.current = null
    dictationAnalyserRef.current = null
    dictationBinsRef.current = null
    if (audio) void audio.close().catch(() => undefined)
    setDictationLevels([])
    setDictationSecs(0)
  }

  function startDictationVisuals() {
    dictationStartRef.current = Date.now()
    setDictationSecs(0)
    setDictationLevels([3, 4, 3, 5, 4, 3, 5, 6, 4, 3, 4, 3])
    if (dictationTimerRef.current !== null) {
      window.clearInterval(dictationTimerRef.current)
    }
    dictationTimerRef.current = window.setInterval(() => {
      if (recognitionRef.current === null) return
      setDictationSecs(
        Math.floor((Date.now() - dictationStartRef.current) / 1000)
      )
      const analyser = dictationAnalyserRef.current
      const bins = dictationBinsRef.current
      if (analyser && bins) {
        analyser.getByteFrequencyData(bins)
        const bars: number[] = []
        for (let index = 0; index < 12; index += 1) {
          const value = bins[Math.floor((index / 12) * bins.length)] ?? 0
          bars.push(2 + Math.round((value / 255) * 6))
        }
        setDictationLevels(bars)
      } else {
        const tick = Date.now() / 280
        setDictationLevels(
          Array.from(
            { length: 12 },
            (_, index) =>
              3 + Math.round(3 * Math.abs(Math.sin(tick + index * 0.65)))
          )
        )
      }
    }, 150)
    if (!navigator.mediaDevices?.getUserMedia) return
    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        if (recognitionRef.current === null) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        dictationStreamRef.current = stream
        try {
          const windowWithWebkit = window as unknown as {
            webkitAudioContext?: typeof AudioContext
          }
          const Context =
            window.AudioContext ?? windowWithWebkit.webkitAudioContext
          if (!Context) return
          const context = new Context()
          dictationAudioRef.current = context
          const source = context.createMediaStreamSource(stream)
          const analyser = context.createAnalyser()
          analyser.fftSize = 64
          source.connect(analyser)
          dictationAnalyserRef.current = analyser
          dictationBinsRef.current = new Uint8Array(analyser.frequencyBinCount)
        } catch {
          // Keep the fallback wave.
        }
      },
      () => undefined
    )
  }

  function endDictation() {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    stopDictationVisuals()
    setListening(false)
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    recognition.onstart = null
    try {
      recognition.stop()
    } catch {
      // Already stopped.
    }
  }

  function confirmDictation() {
    dictationCancelRef.current = false
    endDictation()
  }

  function cancelDictation() {
    dictationCancelRef.current = true
    const base = dictationBaseRef.current
    updatePrompt(base, base.length)
    endDictation()
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  function handleDictationToggle() {
    if (!speechRecognitionAvailable || disabled) return
    if (listening) {
      confirmDictation()
      return
    }

    const speechWindow = window as SpeechRecognitionWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) return

    const recognition = new Recognition()
    recognitionRef.current = recognition
    dictationBaseRef.current = promptRef.current
    dictationCancelRef.current = false
    try {
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "en-US"
    } catch {
      // Defaults still work.
    }
    recognition.onstart = () => {
      setListening(true)
      startDictationVisuals()
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      if (dictationCancelRef.current) {
        const base = dictationBaseRef.current
        updatePrompt(base, base.length)
      }
      stopDictationVisuals()
      setListening(false)
    }
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      if (dictationCancelRef.current) {
        const base = dictationBaseRef.current
        updatePrompt(base, base.length)
      }
      stopDictationVisuals()
      setListening(false)
    }
    recognition.onresult = (event) => {
      if (dictationCancelRef.current) return
      let transcript = ""
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? ""
      }
      const base = dictationBaseRef.current
      const nextPrompt = `${base}${
        base && !/\s$/.test(base) && transcript ? " " : ""
      }${transcript}`
      updatePrompt(nextPrompt, nextPrompt.length)
    }
    try {
      recognition.start()
      setListening(true)
      startDictationVisuals()
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      stopDictationVisuals()
      setListening(false)
    }
  }

  return (
    <div className="relative">
      {autocomplete ? (
        <div
          aria-label={
            autocomplete.mode === "source" ? "Sources" : "Prompt commands"
          }
          className={cn(
            "absolute inset-x-0 bottom-full z-20 mb-2 rounded-[10px] border p-1 shadow-lg",
            isDark
              ? "surface-dialog border border-border text-foreground"
              : "bg-popover text-popover-foreground"
          )}
          id="revbot-autocomplete"
          onMouseLeave={() => setMenuEngaged(false)}
          role="listbox"
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-1 rounded-[6px]",
              isDark ? "bg-white/10" : "bg-accent"
            )}
            style={{
              height: rowBox?.height ?? 0,
              opacity: rowBox && menuEngaged && filteredOptions.length ? 1 : 0,
              top: rowBox?.top ?? 0,
              transition:
                "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
            }}
          />
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                aria-selected={index === activeOptionIndex}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
                id={`revbot-autocomplete-option-${index}`}
                key={option.name}
                onClick={() => selectAutocomplete(option)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActiveOptionIndex(index)
                  setMenuEngaged(true)
                }}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                role="option"
                type="button"
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                  {autocomplete.mode === "source" ? "@" : "/"}
                </span>
                <span className="shrink-0 text-[12.5px] font-medium">
                  {option.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))
          ) : (
            <div className="flex h-9 items-center px-2 text-[12px] text-muted-foreground">
              No matching{" "}
              {autocomplete.mode === "source" ? "sources" : "commands"}
            </div>
          )}
          <div className="mt-1 border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            {autocomplete.mode === "source"
              ? "Type to search sources"
              : "Type to search commands"}
          </div>
        </div>
      ) : null}

      {effortOpen ? (
        <div
          className={cn(
            "absolute right-0 bottom-full z-20 mb-2 w-44 rounded-[10px] border p-1 shadow-lg",
            isDark
              ? "surface-dialog border border-border text-foreground"
              : "bg-popover text-popover-foreground"
          )}
          onMouseLeave={() => setEffortHovered(null)}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-1 rounded-[6px]",
              isDark ? "bg-white/10" : "bg-accent"
            )}
            style={{
              height: effortBox?.height ?? 0,
              opacity: effortBox && effortHovered !== null ? 1 : 0,
              top: effortBox?.top ?? 0,
              transition:
                "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
            }}
          />
          {allowedEfforts.map((value, index) => (
            <button
              className="relative z-10 flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left"
              key={value}
              onClick={() => {
                selectEffort(value)
                textareaRef.current?.focus()
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setEffortHovered(index)}
              ref={(element) => {
                effortRefs.current[index] = element
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                {value}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  value === effort ? "text-foreground" : "invisible"
                )}
              >
                <Icon size={13} strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" />
                </Icon>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <section
        aria-label="Send a message"
        className={cn(
          "relative isolate flex flex-col gap-1.5 overflow-hidden rounded-[14px] border p-1.5 shadow-sm transition-[border-color,border-radius] duration-150",
          isDark
            ? "surface-dialog border border-border focus-within:border-white/20"
            : "border bg-card focus-within:border-ring"
        )}
      >
        <canvas
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 size-full"
          ref={canvasRef}
          style={{ borderRadius: "inherit" }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none invisible absolute text-[13px] leading-[18px] whitespace-pre"
          ref={measureRef}
        >
          {prompt}
        </span>
        {attachments.length ? (
          <div className="relative z-10 flex flex-wrap gap-1.5 px-1 pt-0.5">
            {attachments.map((attachment) => (
              <div className="relative" key={attachment.id}>
                <img
                  alt=""
                  className="size-11 rounded-md object-cover"
                  src={attachment.previewUrl}
                />
                <button
                  aria-label="Remove image"
                  className={cn(
                    "absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full text-white",
                    isDark
                      ? "bg-white/30 hover:bg-white/50"
                      : "bg-black/60 hover:bg-black/80"
                  )}
                  onClick={() => removeAttachment(attachment.id)}
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          accept="image/jpeg,image/png,image/gif,image/webp"
          aria-hidden="true"
          className="hidden"
          multiple
          onChange={(event) => {
            addImageFiles(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <div
          className={cn(
            "relative z-10 grid items-end gap-x-1 gap-y-1.5",
            showEffort
              ? expanded
                ? showMic
                  ? "grid-cols-[28px_28px_minmax(0,1fr)_auto_28px]"
                  : "grid-cols-[minmax(0,1fr)_auto_28px]"
                : showMic
                  ? "grid-cols-[28px_28px_minmax(0,1fr)_auto_28px]"
                  : "grid-cols-[28px_minmax(0,1fr)_auto_28px]"
              : expanded
                ? showMic
                  ? "grid-cols-[28px_28px_minmax(0,1fr)_28px]"
                  : "grid-cols-[minmax(0,1fr)_28px]"
                : showMic
                  ? "grid-cols-[28px_28px_minmax(0,1fr)_28px]"
                  : "grid-cols-[28px_minmax(0,1fr)_28px]"
          )}
          ref={controlsRef}
        >
          <Button
            aria-label="Attach images"
            className={cn(
              "size-7 justify-self-start rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
              isDark && "hover:bg-white/10",
              expanded ? "col-start-1 row-start-2" : "col-start-1 row-start-1"
            )}
            disabled={disabled}
            onClick={() => {
              setEffortOpen(false)
              setAutocomplete(null)
              fileInputRef.current?.click()
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          {showMic ? (
            <Button
              aria-label={
                speechRecognitionAvailable
                  ? listening
                    ? "Stop voice dictation"
                    : "Start voice dictation"
                  : "Voice dictation is not supported by this browser"
              }
              aria-pressed={listening}
              className={cn(
                "size-7 justify-self-start rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
                isDark && "hover:bg-white/10",
                expanded
                  ? "col-start-2 row-start-2"
                  : "col-start-2 row-start-1",
                listening &&
                  "text-destructive-foreground bg-destructive hover:bg-destructive/90"
              )}
              disabled={disabled || !speechRecognitionAvailable}
              onClick={handleDictationToggle}
              size="icon-sm"
              title={
                speechRecognitionAvailable
                  ? listening
                    ? "Listening — click to keep text"
                    : "Start voice dictation"
                  : "Voice dictation is not supported by this browser"
              }
              type="button"
              variant="ghost"
            >
              <MicIcon
                aria-hidden="true"
                className={listening ? "animate-pulse" : undefined}
              />
            </Button>
          ) : null}
          {listening ? (
            <div
              aria-label="Recording voice"
              className={cn(
                "flex min-h-7 min-w-0 items-center gap-1.5 rounded-[8px] px-1 py-[5px]",
                expanded
                  ? "col-span-full col-start-1 row-start-1"
                  : showMic
                    ? "col-start-3 row-start-1"
                    : "col-start-2 row-start-1",
                isDark ? "bg-white/5" : "bg-accent/50"
              )}
              role="status"
            >
              <span
                aria-hidden="true"
                className="relative flex h-[18px] min-w-0 flex-1 items-center"
              >
                <span className="absolute inset-x-0 border-t border-dotted border-muted-foreground/40" />
                <span className="relative mx-auto flex items-center gap-[3px] px-2">
                  {dictationLevels.map((level, index) => (
                    <span
                      key={index}
                      className="w-[3px] shrink-0 rounded-full bg-red-500"
                      style={{ height: `${Math.min(18, 3 + level * 2)}px` }}
                    />
                  ))}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground tabular-nums">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                {formatDictationSecs(dictationSecs)}
              </span>
              <button
                aria-label="Discard dictation"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
                  isDark && "hover:bg-white/10"
                )}
                onClick={cancelDictation}
                type="button"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label="Accept dictation"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
                  isDark && "hover:bg-white/10"
                )}
                onClick={confirmDictation}
                type="button"
              >
                <Icon size={15} strokeWidth={2.4}>
                  <path d="M20 6 9 17l-5-5" />
                </Icon>
              </button>
            </div>
          ) : (
            <Textarea
              aria-activedescendant={activeOptionId}
              aria-controls={autocomplete ? "revbot-autocomplete" : undefined}
              aria-expanded={Boolean(autocomplete)}
              className={cn(
                "min-h-7 w-full resize-none border-0 bg-transparent px-1 py-[5px] text-[13px] leading-[18px] shadow-none outline-none focus-visible:border-0 focus-visible:ring-0",
                expanded
                  ? "col-span-full col-start-1 row-start-1"
                  : showMic
                    ? "col-start-3 row-start-1 min-w-0"
                    : "col-start-2 row-start-1 min-w-0",
                isDark
                  ? "!bg-transparent [tap-highlight-color:transparent] selection:bg-white/20 focus:!bg-transparent focus-visible:!bg-transparent active:!bg-transparent"
                  : "dark:bg-transparent"
              )}
              disabled={disabled}
              id={REVBOT_PROMPT_INPUT_ID}
              onChange={(event) =>
                updatePrompt(event.target.value, event.target.selectionStart)
              }
              onKeyDown={handlePromptKeyDown}
              onPaste={handlePaste}
              placeholder="Ask Revbot anything…"
              ref={textareaRef}
              rows={1}
              value={prompt}
            />
          )}
          {showEffort ? (
            <button
              aria-expanded={effortOpen}
              aria-label="Choose reasoning effort"
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                isDark && "hover:bg-white/10",
                expanded
                  ? showMic
                    ? "col-start-4 row-start-2"
                    : "col-start-2 row-start-2"
                  : showMic
                    ? "col-start-4 row-start-1"
                    : "col-start-3 row-start-1"
              )}
              disabled={disabled}
              onClick={() => {
                setAutocomplete(null)
                setEffortOpen((open) => !open)
              }}
              ref={effortButtonRef}
              type="button"
            >
              {effort}
              <span className="text-muted-foreground">
                <Icon size={11} strokeWidth={2.4}>
                  <path d="m6 9 6 6 6-6" />
                </Icon>
              </span>
            </button>
          ) : null}
          {active ? (
            <Button
              aria-label="Stop Revbot"
              className={cn("size-7 rounded-[8px]", sendColClass)}
              disabled={stopping}
              onClick={onStop}
              size="icon-sm"
              type="button"
              variant="destructive"
            >
              <SquareIcon aria-hidden="true" />
            </Button>
          ) : (
            <Button
              aria-label="Send message to Revbot"
              className={cn("size-7 rounded-[8px]", sendColClass)}
              disabled={!canSend}
              onClick={handleSend}
              size="icon-sm"
              type="button"
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
