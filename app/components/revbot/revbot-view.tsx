"use client"

import type { KeyboardEvent } from "react"

import { BotIcon, SquareIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import type { AIReasoningEffort, ProjectResponse } from "~/lib/api.types"

import { useRevbot } from "./use-revbot"

export function RevbotView({
  activeProject,
  allowedEfforts,
}: {
  activeProject: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
}) {
  if (!activeProject) {
    return (
      <section className="flex min-h-[calc(100svh-5rem)] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Revbot</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Select a project to use Revbot.
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <ActiveRevbotView
      activeProject={activeProject}
      allowedEfforts={allowedEfforts}
    />
  )
}

function ActiveRevbotView({
  activeProject,
  allowedEfforts,
}: {
  activeProject: ProjectResponse
  allowedEfforts: AIReasoningEffort[]
}) {
  const revbot = useRevbot({ activeProject, allowedEfforts })
  const active = revbot.status === "queued" || revbot.status === "running"
  const canSend =
    !revbot.loading &&
    !active &&
    !revbot.stopping &&
    allowedEfforts.length > 0 &&
    revbot.prompt.trim().length > 0

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    if (canSend) void revbot.send()
  }

  const statusLabel = revbot.stopping
    ? "Stopping"
    : revbot.phase
      ? revbot.phase === "thinking"
        ? "Thinking"
        : "Writing"
      : revbot.status === "idle"
        ? revbot.loading
          ? "Loading"
          : "Ready"
        : revbot.status[0].toUpperCase() + revbot.status.slice(1)

  return (
    <section className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BotIcon aria-hidden="true" className="size-5" />
          <div>
            <h1 className="text-lg font-semibold">Revbot</h1>
            <p className="text-sm text-muted-foreground">
              Ask about {activeProject.name}
            </p>
          </div>
        </div>
        <Badge
          variant={
            active
              ? "secondary"
              : revbot.status === "failed"
                ? "destructive"
                : "outline"
          }
        >
          {statusLabel}
        </Badge>
      </header>

      <section
        aria-label="Conversation"
        aria-live="polite"
        className="flex flex-1 flex-col gap-3"
      >
        {revbot.messages.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Ask Revbot a question about this project.
            </CardContent>
          </Card>
        ) : (
          revbot.messages.map((message) => (
            <Card
              key={message.id}
              className={message.role === "user" ? "ml-8" : "mr-8"}
            >
              <CardHeader className="px-4 py-3">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {message.role === "user" ? "You" : "Revbot"}
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <p className="text-sm whitespace-pre-wrap">
                  {message.content ||
                    (active && message.role === "assistant" ? "…" : "")}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {revbot.error ? (
        <p className="text-sm text-destructive" role="alert">
          {revbot.error}
        </p>
      ) : null}

      <section
        aria-label="Send a message"
        className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm"
      >
        <label className="sr-only" htmlFor="revbot-prompt">
          Message Revbot
        </label>
        <Textarea
          disabled={revbot.loading || active || revbot.stopping}
          id="revbot-prompt"
          onChange={(event) => revbot.setPrompt(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder="Ask Revbot anything…"
          value={revbot.prompt}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              className="text-sm text-muted-foreground"
              htmlFor="revbot-effort"
            >
              Reasoning effort
            </label>
            <Select
              disabled={
                revbot.loading ||
                active ||
                revbot.stopping ||
                allowedEfforts.length === 0
              }
              onValueChange={(value) => {
                if (allowedEfforts.includes(value as AIReasoningEffort)) {
                  revbot.setEffort(value as AIReasoningEffort)
                }
              }}
              value={revbot.effort}
            >
              <SelectTrigger
                aria-label="Reasoning effort"
                id="revbot-effort"
                className="w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {allowedEfforts.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {active ? (
              <Button
                aria-label="Stop Revbot"
                disabled={revbot.stopping}
                onClick={() => void revbot.stop()}
                type="button"
                variant="destructive"
              >
                <SquareIcon aria-hidden="true" data-icon="inline-start" />
                {revbot.stopping ? "Stopping" : "Stop"}
              </Button>
            ) : null}
            <Button
              aria-label="Send message to Revbot"
              disabled={!canSend}
              onClick={() => void revbot.send()}
              type="button"
            >
              Send
            </Button>
          </div>
        </div>
      </section>
    </section>
  )
}
