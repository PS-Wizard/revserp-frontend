"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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

import { ArrowUpIcon, MicIcon, PlusIcon, SquareIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import type { AIReasoningEffort } from "~/lib/api.types"
import { cn } from "~/lib/utils"

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

type RevbotComposerProps = {
  active: boolean
  allowedEfforts: AIReasoningEffort[]
  disabled: boolean
  effort: AIReasoningEffort
  onEffortChange: (effort: AIReasoningEffort) => void
  onSend: (content: string) => void
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
  const promptRef = useRef(prompt)
  const [speechRecognitionAvailable, setSpeechRecognitionAvailable] =
    useState(false)
  const [listening, setListening] = useState(false)

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
  const canSend = !disabled && prompt.trim().length > 0
  const actionColCount = showMic ? 3 : 2
  const sendColClass = expanded
    ? showMic
      ? "col-start-4 row-start-2"
      : "col-start-3 row-start-2"
    : showMic
      ? "col-start-5 row-start-1"
      : "col-start-4 row-start-1"

  useEffect(() => {
    promptRef.current = prompt
  }, [prompt])

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
    const effortButton = effortButtonRef.current
    if (!textarea || !controls || !measure || !effortButton) return

    const fixedControlsWidth = 28 * actionColCount + effortButton.offsetWidth
    const inlineGaps = 4 * 4
    const inlineInputWidth = controls.clientWidth - fixedControlsWidth - inlineGaps
    const needsFullWidth =
      prompt.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth)

    textarea.style.height = "0px"
    const contentHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(
      Math.max(contentHeight, 28),
      maxTextareaHeight
    )}px`
    textarea.style.overflowY = contentHeight > maxTextareaHeight ? "auto" : "hidden"
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

  function handleSend() {
    const content = prompt.trim()
    if (!content || disabled) return
    onSend(content)
    setPrompt("")
    setAutocomplete(null)
    promptRef.current = ""
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

  function handleDictationToggle() {
    if (!speechRecognitionAvailable) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const speechWindow = window as SpeechRecognitionWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) return

    const recognition = new Recognition()
    const initialPrompt = promptRef.current
    recognitionRef.current = recognition
    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setListening(false)
    }
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setListening(false)
    }
    recognition.onresult = (event) => {
      let transcript = ""
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? ""
      }
      const nextPrompt = `${initialPrompt}${
        initialPrompt && !/\s$/.test(initialPrompt) && transcript ? " " : ""
      }${transcript}`
      updatePrompt(nextPrompt, nextPrompt.length)
    }
    try {
      recognition.start()
      setListening(true)
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null
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
              ? "border-white/10 bg-[#141414] text-foreground"
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
              No matching {autocomplete.mode === "source" ? "sources" : "commands"}
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
              ? "border-white/10 bg-[#141414] text-foreground"
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
            ? "border-white/10 bg-[#141414] focus-within:border-white/25"
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
          className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]"
          ref={measureRef}
        >
          {prompt}
        </span>
        <div
          className={cn(
            "relative z-10 grid items-end gap-x-1 gap-y-1.5",
            expanded
              ? showMic
                ? "grid-cols-[minmax(0,1fr)_auto_28px_28px]"
                : "grid-cols-[minmax(0,1fr)_auto_28px]"
              : showMic
                ? "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]"
                : "grid-cols-[28px_minmax(0,1fr)_auto_28px]"
          )}
          ref={controlsRef}
        >
          <Button
            aria-controls="revbot-autocomplete"
            aria-expanded={autocomplete?.mode === "source"}
            aria-label="Choose audit source"
            className={cn(
              "size-7 justify-self-start rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
              isDark && "hover:bg-white/10",
              expanded ? "col-start-1 row-start-2" : "col-start-1 row-start-1"
            )}
            disabled={disabled}
            onClick={() => {
              setEffortOpen(false)
              if (autocomplete?.mode === "source") {
                setAutocomplete(null)
                return
              }
              const caret = textareaRef.current?.selectionStart ?? prompt.length
              setAutocomplete({ mode: "source", query: "", start: caret })
              requestAnimationFrame(() => textareaRef.current?.focus())
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          <Textarea
            aria-activedescendant={activeOptionId}
            aria-controls={autocomplete ? "revbot-autocomplete" : undefined}
            aria-expanded={Boolean(autocomplete)}
            className={cn(
              "min-h-7 w-full resize-none border-0 bg-transparent px-1 py-[5px] text-[13px] leading-[18px] shadow-none outline-none focus-visible:border-0 focus-visible:ring-0",
              expanded
                ? "col-span-full col-start-1 row-start-1"
                : "col-start-2 row-start-1 min-w-0",
              isDark
                ? "!bg-transparent selection:bg-white/20 [tap-highlight-color:transparent] active:!bg-transparent focus:!bg-transparent focus-visible:!bg-transparent"
                : "dark:bg-transparent"
            )}
            disabled={disabled}
            id="revbot-prompt"
            onChange={(event) =>
              updatePrompt(event.target.value, event.target.selectionStart)
            }
            onKeyDown={handlePromptKeyDown}
            placeholder={listening ? "Listening…" : "Ask Revbot anything…"}
            ref={textareaRef}
            rows={1}
            value={prompt}
          />
          <button
            aria-expanded={effortOpen}
            aria-label="Choose reasoning effort"
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              isDark && "hover:bg-white/10",
              expanded ? "col-start-2 row-start-2" : "col-start-3 row-start-1"
            )}
            disabled={disabled || allowedEfforts.length === 0}
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
                "size-7 rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground",
                expanded ? "col-start-3 row-start-2" : "col-start-4 row-start-1",
                listening &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
              disabled={disabled || !speechRecognitionAvailable}
              onClick={handleDictationToggle}
              size="icon-sm"
              title={
                speechRecognitionAvailable
                  ? listening
                    ? "Listening — click to stop"
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
