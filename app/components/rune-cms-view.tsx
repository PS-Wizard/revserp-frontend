"use client"

import { memo, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { DataLoadingState } from "~/components/data-loading-state"
import { RuneCMSPanel } from "~/components/rune-cms/rune-cms-panel"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type { ProjectResponse, RuneCMSStatusResponse } from "~/lib/api.types"
import { FolderGit2Icon, TriangleAlertIcon } from "lucide-react"

export function runeCMSStatusQueryKey(projectId: string) {
  return ["rune-cms-status", projectId] as const
}

type RuneCMSViewProps = {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
}

function safeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function isValidEndpointUrl(raw: string) {
  try {
    const parsed = new URL(raw.trim())
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

export const RuneCMSView = memo(function RuneCMSView({
  activeProject,
  isOrganizationOwner,
}: RuneCMSViewProps) {
  const queryClient = useQueryClient()
  const projectId = activeProject?.id
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const {
    data: status,
    isLoading: isLoadingStatus,
    error: statusError,
    refetch: refetchStatus,
    isFetching: isFetchingStatus,
  } = useQuery({
    queryKey: projectId
      ? runeCMSStatusQueryKey(projectId)
      : ["rune-cms-status-disabled"],
    queryFn: () =>
      clientApiFetch<RuneCMSStatusResponse>(
        `/projects/${projectId!}/rune/status`
      ),
    enabled: Boolean(projectId),
    retry: false,
  })

  const requestSeqRef = useRef(0)
  const mountedRef = useRef(true)
  const [endpointUrl, setEndpointUrl] = useState("")
  const [endpointTouched, setEndpointTouched] = useState(false)
  const [bearerToken, setBearerToken] = useState("")
  const [formError, setFormError] = useState("")
  const [actionError, setActionError] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // One mutation at a time: a second action while one is in flight would
  // increment the sequence and either strand the first busy flag or race the
  // server with overlapping writes, so every control shares this flag.
  const isBusy = isConnecting || isChecking || isDisconnecting

  function isStaleResponse(requestProjectId: string, requestSeq: number) {
    return (
      !mountedRef.current ||
      requestProjectId !== projectIdRef.current ||
      requestSeq !== requestSeqRef.current
    )
  }

  // The token lives only in mounted form state (never persisted), so
  // clearing the mounted form is sufficient. On unmount, invalidate any
  // in-flight mutation so a late response cannot write cache or state for
  // a dead view.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestSeqRef.current += 1
    }
  }, [])

  // Never carry secrets, form input, or results across projects. The parent
  // also remounts this view per project; this is the second layer.
  useEffect(() => {
    setEndpointUrl("")
    setEndpointTouched(false)
    setBearerToken("")
    setFormError("")
    setActionError("")
    setIsConnecting(false)
    setIsChecking(false)
    setIsDisconnecting(false)
    requestSeqRef.current += 1
  }, [projectId])

  // Seed the endpoint field from the saved status once per project; never
  // clobber what the user is typing.
  useEffect(() => {
    if (endpointTouched) return
    setEndpointUrl(status?.endpoint_url ?? "")
  }, [status?.endpoint_url, endpointTouched])

  async function applyStatus(
    requestProjectId: string,
    requestSeq: number,
    next: RuneCMSStatusResponse
  ) {
    if (isStaleResponse(requestProjectId, requestSeq)) return
    queryClient.setQueryData(runeCMSStatusQueryKey(requestProjectId), next)
    await queryClient.invalidateQueries({
      queryKey: runeCMSStatusQueryKey(requestProjectId),
    })
  }

  async function handleConnect(): Promise<boolean> {
    if (!activeProject || !projectId || isBusy) return false
    const trimmedEndpoint = endpointUrl.trim()
    if (!isValidEndpointUrl(trimmedEndpoint)) {
      setFormError(
        "Enter the full CMS endpoint URL, starting with http:// or https://."
      )
      return false
    }
    if (!bearerToken) {
      setFormError("Enter a bearer token to connect.")
      return false
    }
    const requestProjectId = projectId
    const requestSeq = ++requestSeqRef.current
    setFormError("")
    setActionError("")
    setIsConnecting(true)
    try {
      const next = await clientApiPost<RuneCMSStatusResponse>(
        `/projects/${requestProjectId}/rune/connect`,
        { endpoint_url: trimmedEndpoint, bearer_token: bearerToken }
      )
      if (isStaleResponse(requestProjectId, requestSeq)) return false
      setBearerToken("")
      setEndpointTouched(false)
      await applyStatus(requestProjectId, requestSeq, next)
      return !isStaleResponse(requestProjectId, requestSeq)
    } catch (error) {
      if (isStaleResponse(requestProjectId, requestSeq)) return false
      setActionError(safeErrorMessage(error, "Unable to connect Rune CMS."))
      return false
    } finally {
      if (!isStaleResponse(requestProjectId, requestSeq)) {
        setIsConnecting(false)
      }
    }
  }

  async function handleCheck() {
    if (!activeProject || !projectId || isBusy) return
    const requestProjectId = projectId
    const requestSeq = ++requestSeqRef.current
    setActionError("")
    setIsChecking(true)
    try {
      const next = await clientApiPost<RuneCMSStatusResponse>(
        `/projects/${requestProjectId}/rune/check`,
        {}
      )
      await applyStatus(requestProjectId, requestSeq, next)
    } catch (error) {
      if (isStaleResponse(requestProjectId, requestSeq)) return
      setActionError(
        safeErrorMessage(error, "Unable to check the Rune CMS connection.")
      )
    } finally {
      if (!isStaleResponse(requestProjectId, requestSeq)) {
        setIsChecking(false)
      }
    }
  }

  async function handleDisconnect() {
    if (!activeProject || !projectId || isBusy) return
    const requestProjectId = projectId
    const requestSeq = ++requestSeqRef.current
    setActionError("")
    setFormError("")
    setIsDisconnecting(true)
    try {
      const next = await clientApiPost<RuneCMSStatusResponse>(
        `/projects/${requestProjectId}/rune/disconnect`,
        {}
      )
      if (isStaleResponse(requestProjectId, requestSeq)) return
      setBearerToken("")
      setEndpointTouched(false)
      await applyStatus(requestProjectId, requestSeq, next)
    } catch (error) {
      if (isStaleResponse(requestProjectId, requestSeq)) return
      setActionError(safeErrorMessage(error, "Unable to disconnect Rune CMS."))
    } finally {
      if (!isStaleResponse(requestProjectId, requestSeq)) {
        setIsDisconnecting(false)
      }
    }
  }

  function handleDismissCredentials() {
    setBearerToken("")
    setFormError("")
  }

  if (!activeProject) {
    return (
      <RuneCMSStateCard
        description="Choose a project first to see its Rune CMS connection state."
        title="Select a project"
      />
    )
  }

  if (isLoadingStatus && !status) {
    return <DataLoadingState label="Loading Rune CMS..." />
  }

  const loadErrorMessage = statusError
    ? safeErrorMessage(statusError, "Unable to load Rune CMS data.")
    : ""

  if (loadErrorMessage && !status) {
    return (
      <RuneCMSStateCard
        description={loadErrorMessage}
        error
        onRetry={() => void refetchStatus()}
        retryBusy={isFetchingStatus}
        title="Unable to load Rune CMS"
      />
    )
  }

  if (!status) return null

  return (
    <RuneCMSPanel
      key={projectId}
      actionError={actionError}
      bearerToken={bearerToken}
      endpointUrl={endpointUrl}
      formError={formError}
      isChecking={isChecking}
      isConnecting={isConnecting}
      isDisconnecting={isDisconnecting}
      isOrganizationOwner={isOrganizationOwner}
      onBearerTokenChange={setBearerToken}
      onCheck={() => void handleCheck()}
      onConnect={handleConnect}
      onDisconnect={() => void handleDisconnect()}
      onDismissCredentials={handleDismissCredentials}
      onEndpointChange={(value) => {
        setEndpointUrl(value)
        setEndpointTouched(true)
      }}
      projectName={activeProject.name}
      status={status}
    />
  )
}, areRuneCMSViewPropsEqual)

function areRuneCMSViewPropsEqual(
  previous: RuneCMSViewProps,
  next: RuneCMSViewProps
) {
  return (
    previous.activeProject?.id === next.activeProject?.id &&
    previous.activeProject?.name === next.activeProject?.name &&
    previous.isOrganizationOwner === next.isOrganizationOwner
  )
}

function RuneCMSStateCard({
  title,
  description,
  error,
  onRetry,
  retryBusy,
}: {
  title: string
  description: string
  error?: boolean
  onRetry?: () => void
  retryBusy?: boolean
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-balance">
          Rune CMS
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Connect this project to Rune CMS so workspace tools can read content
          and draft preview edits.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Empty className="border-0 p-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {error ? (
                  <TriangleAlertIcon aria-hidden="true" />
                ) : (
                  <FolderGit2Icon aria-hidden="true" />
                )}
              </EmptyMedia>
              <EmptyTitle>{title}</EmptyTitle>
              <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            {onRetry ? (
              <EmptyContent>
                <Button
                  disabled={retryBusy}
                  onClick={onRetry}
                  type="button"
                  variant="outline"
                >
                  {retryBusy ? "Retrying…" : "Try again"}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
