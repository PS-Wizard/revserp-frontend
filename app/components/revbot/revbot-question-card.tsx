"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { ExternalLinkIcon, Loader2Icon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Textarea } from "~/components/ui/textarea"
import type {
  UserQuestionAnswer,
  UserQuestionOption,
  UserQuestionRequest,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

import {
  buildQuestionAnswers,
  clearQuestionDraft,
  questionRequestSummaryLines,
  questionStepComplete,
  readQuestionDraft,
  writeQuestionDraft,
  type DraftSelection,
  type QuestionDraft,
} from "./revbot-user-questions"

function emptySelection(): DraftSelection {
  return { selected: [], customText: "", customOpen: false, skipped: false }
}

function selectionOf(draft: QuestionDraft, id: string): DraftSelection {
  return draft[id] ?? emptySelection()
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Source"
  } catch {
    return "Source"
  }
}

function OptionText({ option }: { option: UserQuestionOption }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{option.label}</span>
        {option.recommended ? (
          <Badge variant="secondary">Recommended</Badge>
        ) : null}
      </span>
      {option.description ? (
        <>
          <span
            aria-hidden="true"
            title={option.description}
            className="mt-0.5 block truncate text-xs text-muted-foreground"
          >
            {option.description}
          </span>
          <span className="sr-only">{option.description}</span>
        </>
      ) : null}
    </span>
  )
}

/** One tool call carries the whole set; the wizard shows one screen per
 * question and submits everything exactly once. No defaults, no auto-submit. */
export function RevbotQuestionWizard({
  conversationId,
  request,
  busy,
  error,
  onSubmit,
}: {
  conversationId: string
  request: UserQuestionRequest
  busy: boolean
  error: string | null
  onSubmit: (answers: UserQuestionAnswer[]) => void
}) {
  const questions = request.questions
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<QuestionDraft>(() => ({
    ...(readQuestionDraft(conversationId, request.id, request.questions) ?? {}),
  }))
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    writeQuestionDraft(conversationId, request.id, draft)
  }, [conversationId, request.id, draft])

  useEffect(() => {
    if (request.status !== "pending")
      clearQuestionDraft(conversationId, request.id)
  }, [conversationId, request.id, request.status])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step, request.id])

  const index = Math.min(step, questions.length - 1)
  const question = questions[index]!
  const selection = selectionOf(draft, question.id)
  const complete = questionStepComplete(question, selection)
  const isLast = index === questions.length - 1

  function update(id: string, next: DraftSelection) {
    setDraft((current) => ({ ...current, [id]: next }))
  }

  function toggleOption(optionId: string) {
    if (question.mode === "single") {
      update(question.id, {
        ...selection,
        selected: [optionId],
        customText: "",
        customOpen: false,
        skipped: false,
      })
    } else {
      const has = selection.selected.includes(optionId)
      update(question.id, {
        ...selection,
        selected: has
          ? selection.selected.filter((id) => id !== optionId)
          : [...selection.selected, optionId],
        skipped: false,
      })
    }
  }

  function changeCustom(text: string) {
    update(question.id, {
      ...selection,
      customText: text,
      customOpen: true,
      skipped: false,
      selected: question.mode === "single" && text.trim() ? [] : selection.selected,
    })
  }

  const firstIncomplete = questions.findIndex((item) =>
    !questionStepComplete(item, selectionOf(draft, item.id))
  )

  function skipQuestion() {
    const next: QuestionDraft = {
      ...draft,
      [question.id]: { ...emptySelection(), skipped: true },
    }
    setDraft(next)
    if (!isLast) {
      setStep(index + 1)
      return
    }
    const gap = questions.findIndex((item) =>
      !questionStepComplete(item, selectionOf(next, item.id))
    )
    if (gap === -1) onSubmit(buildQuestionAnswers(questions, next))
    else setStep(gap)
  }

  function advance() {
    if (!complete) return
    if (!isLast) {
      setStep(index + 1)
      return
    }
    if (firstIncomplete === -1)
      onSubmit(buildQuestionAnswers(questions, draft))
    else setStep(firstIncomplete)
  }

  return (
    <Card
      aria-label="Answer Revbot's questions"
      className="w-full"
      size="sm"
    >
      <CardHeader>
        <nav aria-label="Question steps" className="flex flex-wrap gap-1.5">
            {questions.map((item, i) => (
              <Button
                key={item.id}
                type="button"
                variant={i === index ? "secondary" : "ghost"}
                size="sm"
                disabled={busy}
                aria-current={i === index ? "step" : undefined}
                aria-label={`Question ${i + 1}: ${item.header}`}
                onClick={() => setStep(i)}
              >
                {item.header}
              </Button>
            ))}
          </nav>
        <p className="text-xs text-muted-foreground">
          Question {index + 1} of {questions.length} · Waiting for your answer
        </p>
        <CardTitle>
          <span ref={headingRef} tabIndex={-1} className="outline-none">
            {question.prompt}
          </span>
        </CardTitle>
        {question.description ? (
          <CardDescription>{question.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="min-h-0">
        <div
          className="flex max-h-[min(22rem,45vh)] min-h-0 flex-col gap-2 overflow-y-auto"
          role={question.mode === "single" ? "radiogroup" : "group"}
          aria-label={question.prompt}
        >
          {question.options.map((option) => {
            const checked = selection.selected.includes(option.id)
            return (
              <div
                key={option.id}
                onClick={
                  question.mode === "multiple"
                    ? (event) => {
                        if (busy) return
                        if ((event.target as HTMLElement).closest("button, a, input, textarea")) return
                        toggleOption(option.id)
                      }
                    : undefined
                }
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:border-ring",
                  checked
                    ? "border-ring bg-accent/50"
                    : "border-border hover:bg-accent/30",
                  question.mode === "multiple" && "cursor-pointer"
                )}
              >
                {question.mode === "single" ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name={`revbot-question-${request.id}-${question.id}`}
                      checked={checked}
                      onChange={() => toggleOption(option.id)}
                      disabled={busy}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background",
                        checked && "border-primary bg-primary"
                      )}
                    >
                      {checked ? (
                        <span className="size-1.5 rounded-full bg-primary-foreground" />
                      ) : null}
                    </span>
                    <OptionText option={option} />
                  </label>
                ) : (
                  <>
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      onCheckedChange={() => toggleOption(option.id)}
                      aria-label={
                        option.description ? `${option.label}, ${option.description}` : option.label
                      }
                      className="mt-0.5"
                    />
                    <OptionText option={option} />
                  </>
                )}
                {option.url ? (
                  <a
                    href={option.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open source: ${sourceDomain(option.url)}`}
                    title={option.url}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-0.5 inline-flex max-w-28 shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <span className="truncate">{sourceDomain(option.url)}</span>
                    <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                  </a>
                ) : null}
              </div>
            )
          })}
        </div>
        {question.allow_custom ? (
          <div className="mt-2">
            {!selection.customOpen ? (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  update(question.id, {
                    ...selection,
                    customOpen: true,
                    skipped: false,
                  })
                }
              >
                Something else
              </Button>
            ) : (
              <Textarea
                aria-label={`Custom answer for ${question.prompt}`}
                placeholder="Type your own answer…"
                value={selection.customText}
                disabled={busy}
                onChange={(event) => changeCustom(event.target.value)}
                rows={2}
              />
            )}
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        {index > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => setStep(index - 1)}
          >
            Back
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={busy}
          onClick={skipQuestion}
        >
          Skip question
        </Button>
        <Button size="sm" type="button" disabled={busy || !complete} onClick={advance}>
          {busy ? (
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : null}
          {busy ? "Sending…" : isLast ? "Submit answers" : "Continue"}
        </Button>
      </CardFooter>
    </Card>
  )
}

/** Quiet resolved summaries restored from history, even after the turn ended. */
export function RevbotQuestionHistory({
  requests,
}: {
  requests: UserQuestionRequest[]
}) {
  const lines = useMemo(
    () =>
      requests.flatMap((request) =>
        questionRequestSummaryLines(request).map((text, i) => ({
          key: `${request.id}:${i}`,
          text,
          status: request.status,
        }))
      ),
    [requests]
  )
  if (lines.length === 0) return null
  return (
    <div
      aria-label="Answered questions"
      className="flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
    >
      {lines.map((line) => (
        <p key={line.key} className="text-xs leading-relaxed text-muted-foreground">
          {line.text}
        </p>
      ))}
    </div>
  )
}
