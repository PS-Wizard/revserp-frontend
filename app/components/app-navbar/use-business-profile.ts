"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import type {
  ProjectAIQuestionsResponse,
  ProjectBusinessProfileResponse,
  ProjectBusinessProfileStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { ApiError, clientApiFetch, clientApiPut } from "~/lib/api"
import { toast } from "sonner"
import { invalidateBusinessProfile } from "~/lib/business-profile-query"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"

const EMPTY_SEED_PROMPTS = ["", "", "", "", ""]
const REGENERATE_TOAST_CLASS = "w-fit"

type PendingGeneration = {
  projectId: string
  requestedAfterMs: number
  toastId?: string | number
}

function formatTargetKeywords(keywords?: string[]) {
  return keywords?.join("\n") ?? ""
}

function parseTargetKeywords(value: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of value.split(/[\n,]+/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(trimmed)
  }
  return result
}

type ProfileSnapshot = {
  brandName: string
  websiteUrl: string
  primaryCategory: string
  primaryLocation: string
  businessDescription: string
  productDescription: string
  targetAudience: string
  businessCompetitors: string
  brandedKeywords: string
  nonBrandedKeywords: string
  seedPrompts: string[]
  targetKeywords: string
}

export function useBusinessProfile() {
  const queryClient = useQueryClient()
  const [businessProfileProject, setBusinessProfileProject] =
    useState<ProjectResponse | null>(null)
  const [businessProfileStatus, setBusinessProfileStatus] =
    useState<ProjectBusinessProfileStatusResponse | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<ProfileSnapshot | null>(
    null
  )
  const [brandName, setBrandName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [primaryCategory, setPrimaryCategory] = useState("")
  const [primaryLocation, setPrimaryLocation] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [businessCompetitors, setBusinessCompetitors] = useState("")
  const [brandedKeywords, setBrandedKeywords] = useState("")
  const [nonBrandedKeywords, setNonBrandedKeywords] = useState("")
  const [targetKeywords, setLoadedTargetKeywords] = useState("")
  const targetKeywordsDraftRef = useRef("")
  const [hasTargetKeywordsChanges, setHasTargetKeywordsChanges] =
    useState(false)
  const [seedPrompts, setSeedPrompts] = useState(EMPTY_SEED_PROMPTS)
  const [businessProfileError, setBusinessProfileError] = useState("")
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] =
    useState(false)
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false)
  const [aiQuestions, setAIQuestions] =
    useState<ProjectAIQuestionsResponse | null>(null)
  const [isLoadingAIQuestions, setIsLoadingAIQuestions] = useState(false)
  const [isRegeneratingAIQuestions, setIsRegeneratingAIQuestions] =
    useState(false)
  const activeProjectIdRef = useRef<string | null>(null)
  const pendingGenerationRef = useRef<PendingGeneration | null>(null)

  const canManageBusinessProfile =
    businessProfileStatus?.can_manage_profile === true

  // The backend drops a branded term that also appears in non-branded, so the
  // two lists can never overlap on save. Reject it here instead of letting a
  // user's term disappear silently.
  const duplicateKeywords = useMemo(() => {
    const nonBranded = new Set(
      parseTargetKeywords(nonBrandedKeywords).map((keyword) =>
        keyword.toLowerCase()
      )
    )
    return parseTargetKeywords(brandedKeywords).filter((keyword) =>
      nonBranded.has(keyword.toLowerCase())
    )
  }, [brandedKeywords, nonBrandedKeywords])

  const hasUnsavedChanges =
    savedSnapshot === null ||
    brandName !== savedSnapshot.brandName ||
    websiteUrl !== savedSnapshot.websiteUrl ||
    primaryCategory !== savedSnapshot.primaryCategory ||
    primaryLocation !== savedSnapshot.primaryLocation ||
    businessDescription !== savedSnapshot.businessDescription ||
    productDescription !== savedSnapshot.productDescription ||
    targetAudience !== savedSnapshot.targetAudience ||
    businessCompetitors !== savedSnapshot.businessCompetitors ||
    brandedKeywords !== savedSnapshot.brandedKeywords ||
    nonBrandedKeywords !== savedSnapshot.nonBrandedKeywords ||
    hasTargetKeywordsChanges ||
    seedPrompts.some((p, i) => p !== savedSnapshot.seedPrompts[i])

  function applyBusinessProfile(
    profile: ProjectBusinessProfileResponse | undefined,
    project: ProjectResponse
  ) {
    const snapshot: ProfileSnapshot = {
      brandName: profile?.brand_name ?? "",
      websiteUrl: profile?.website_url?.trim() || project.base_url,
      primaryCategory: profile?.primary_category ?? "",
      primaryLocation: profile?.primary_location ?? "",
      businessDescription: profile?.business_description ?? "",
      productDescription: profile?.product_description ?? "",
      targetAudience: profile?.target_audience ?? "",
      businessCompetitors: formatTargetKeywords(profile?.business_competitors),
      brandedKeywords: formatTargetKeywords(profile?.branded_keywords),
      nonBrandedKeywords: formatTargetKeywords(profile?.non_branded_keywords),
      seedPrompts: Array.from(
        { length: 5 },
        (_, index) => profile?.seed_prompts?.[index] ?? ""
      ),
      targetKeywords: formatTargetKeywords(profile?.target_keywords),
    }
    setSavedSnapshot(snapshot)
    setBrandName(snapshot.brandName)
    setWebsiteUrl(snapshot.websiteUrl)
    setPrimaryCategory(snapshot.primaryCategory)
    setPrimaryLocation(snapshot.primaryLocation)
    setBusinessDescription(snapshot.businessDescription)
    setProductDescription(snapshot.productDescription)
    setTargetAudience(snapshot.targetAudience)
    setBusinessCompetitors(snapshot.businessCompetitors)
    setBrandedKeywords(snapshot.brandedKeywords)
    setNonBrandedKeywords(snapshot.nonBrandedKeywords)
    setLoadedTargetKeywords(snapshot.targetKeywords)
    targetKeywordsDraftRef.current = snapshot.targetKeywords
    setHasTargetKeywordsChanges(false)
    setSeedPrompts(snapshot.seedPrompts)
  }

  async function fetchAIQuestions(projectId: string) {
    try {
      const data = await clientApiFetch<ProjectAIQuestionsResponse>(
        `/projects/${projectId}/ai-questions`
      )
      setAIQuestions(data)
      return true
    } catch {
      setAIQuestions(null)
      return false
    }
  }

  function beginGenerationTracking(
    projectId: string,
    requestedAfterMs: number,
    toastId?: string | number
  ) {
    pendingGenerationRef.current = { projectId, requestedAfterMs, toastId }
    if (activeProjectIdRef.current === projectId) {
      setIsRegeneratingAIQuestions(true)
    }
  }

  // Drive the Regenerating questions toast to its terminal state from SSE.
  // The loading toast is still created by the click; this only completes it,
  // preserving project-switch dismissal via activeProjectIdRef.
  useOrganizationEventsListener((event) => {
    if (!event.type.startsWith("prompt_generation.")) return
    const pending = pendingGenerationRef.current
    if (!pending) return
    const eventProjectId = event.project_id ?? event.resource_id
    if (eventProjectId !== pending.projectId) return
    if (
      event.type === "prompt_generation.queued" ||
      event.type === "prompt_generation.started"
    ) {
      return
    }
    if (activeProjectIdRef.current !== pending.projectId) {
      if (pending.toastId !== undefined) toast.dismiss(pending.toastId)
      pendingGenerationRef.current = null
      return
    }
    const eventTime = Date.parse(event.created_at)
    if (
      Number.isFinite(eventTime) &&
      eventTime < pending.requestedAfterMs - 1000
    ) {
      // Replay of a job triggered before this regeneration started.
      return
    }
    pendingGenerationRef.current = null
    const { toastId } = pending
    void fetchAIQuestions(pending.projectId)
    setIsRegeneratingAIQuestions(false)
    if (toastId === undefined) return
    if (event.type === "prompt_generation.completed") {
      toast.success("Questions regenerated", {
        className: REGENERATE_TOAST_CLASS,
        id: toastId,
      })
    } else if (event.type === "prompt_generation.failed") {
      const message =
        typeof event.payload.error === "string" && event.payload.error.trim()
          ? event.payload.error.trim()
          : "Question generation failed — try again."
      toast.error(message, {
        className: REGENERATE_TOAST_CLASS,
        id: toastId,
      })
    }
  })

  async function openBusinessProfileDrawer(project: ProjectResponse) {
    const pending = pendingGenerationRef.current
    if (pending && pending.projectId !== project.id) {
      if (pending.toastId !== undefined) toast.dismiss(pending.toastId)
      pendingGenerationRef.current = null
    }
    activeProjectIdRef.current = project.id
    setBusinessProfileProject(project)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
    setAIQuestions(null)
    setIsRegeneratingAIQuestions(false)
    applyBusinessProfile(undefined, project)
    setIsLoadingBusinessProfile(true)
    setIsLoadingAIQuestions(true)

    try {
      const [status] = await Promise.all([
        clientApiFetch<ProjectBusinessProfileStatusResponse>(
          `/projects/${project.id}/business-profile`
        ),
        fetchAIQuestions(project.id),
      ])
      setBusinessProfileStatus(status)
      applyBusinessProfile(status.business_profile, project)
    } catch (error) {
      setBusinessProfileError(
        error instanceof Error
          ? error.message
          : "Unable to load business profile."
      )
    } finally {
      setIsLoadingBusinessProfile(false)
      setIsLoadingAIQuestions(false)
    }
  }

  function closeBusinessProfileDrawer() {
    setBusinessProfileProject(null)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
    setSavedSnapshot(null)
    setHasTargetKeywordsChanges(false)
    setAIQuestions(null)
    setIsRegeneratingAIQuestions(false)
  }

  function updateSeedPrompt(index: number, value: string) {
    setSeedPrompts((current) =>
      current.map((prompt, promptIndex) =>
        promptIndex === index ? value : prompt
      )
    )
  }

  function updateTargetKeywords(value: string) {
    targetKeywordsDraftRef.current = value
    setHasTargetKeywordsChanges(value !== savedSnapshot?.targetKeywords)
  }

  async function regenerateAIQuestions() {
    if (
      !businessProfileProject ||
      !businessProfileStatus?.can_manage_profile ||
      isRegeneratingAIQuestions
    ) {
      return
    }

    if (!businessProfileStatus.has_profile) {
      toast.error("Save a business profile before regenerating questions.")
      return
    }

    const requestedAfterMs = Date.now()
    const toastId = toast.loading("Regenerating questions…", {
      className: REGENERATE_TOAST_CLASS,
      duration: Infinity,
    })

    setAIQuestions(null)
    beginGenerationTracking(
      businessProfileProject.id,
      requestedAfterMs,
      toastId
    )
    try {
      await clientApiFetch<{ status: string }>(
        `/projects/${businessProfileProject.id}/ai-questions/regenerate`,
        { method: "POST" }
      )
    } catch (error) {
      pendingGenerationRef.current = null
      setIsRegeneratingAIQuestions(false)
      toast.dismiss(toastId)
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not regenerate questions."
      )
    }
  }

  async function handleSaveBusinessProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !businessProfileProject ||
      !businessProfileStatus?.can_manage_profile ||
      isSavingBusinessProfile
    ) {
      return
    }

    if (duplicateKeywords.length > 0) {
      setBusinessProfileError(
        `These keywords are in both lists: ${duplicateKeywords.join(", ")}. Remove them from one list.`
      )
      return
    }

    setBusinessProfileError("")
    setIsSavingBusinessProfile(true)

    // The backend enqueues prompt generation before the PUT returns, so a fast
    // terminal SSE frame can beat the response. Track the automatic job with a
    // pre-request timestamp first; there is no toast for this path.
    const projectId = businessProfileProject.id
    beginGenerationTracking(projectId, Date.now())

    try {
      const profile = await clientApiPut<ProjectBusinessProfileResponse>(
        `/projects/${projectId}/business-profile`,
        {
          brand_name: brandName,
          website_url: websiteUrl,
          primary_category: primaryCategory,
          primary_location: primaryLocation,
          business_description: businessDescription,
          product_description: productDescription,
          target_audience: targetAudience,
          business_competitors: parseTargetKeywords(businessCompetitors),
          branded_keywords: parseTargetKeywords(brandedKeywords),
          non_branded_keywords: parseTargetKeywords(nonBrandedKeywords),
          target_keywords: parseTargetKeywords(targetKeywordsDraftRef.current),
          seed_prompts: seedPrompts.flatMap((prompt) => {
            const trimmedPrompt = prompt.trim()
            return trimmedPrompt ? [trimmedPrompt] : []
          }),
        }
      )

      setBusinessProfileStatus({
        has_profile: true,
        can_manage_profile: businessProfileStatus.can_manage_profile,
        business_profile: profile,
      })
      applyBusinessProfile(profile, businessProfileProject)
      void invalidateBusinessProfile(queryClient, projectId)
      closeBusinessProfileDrawer()
    } catch (error) {
      if (pendingGenerationRef.current?.projectId === projectId) {
        pendingGenerationRef.current = null
        setIsRegeneratingAIQuestions(false)
      }
      setBusinessProfileError(
        error instanceof Error
          ? error.message
          : "Unable to save business profile."
      )
    } finally {
      setIsSavingBusinessProfile(false)
    }
  }

  return {
    businessProfileProject,
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    productDescription,
    targetAudience,
    businessCompetitors,
    brandedKeywords,
    nonBrandedKeywords,
    targetKeywords,
    seedPrompts,
    duplicateKeywords,
    businessProfileError,
    isLoadingBusinessProfile,
    isSavingBusinessProfile,
    canManageBusinessProfile,
    aiQuestions,
    isLoadingAIQuestions,
    isRegeneratingAIQuestions,
    hasUnsavedChanges,
    openBusinessProfileDrawer,
    closeBusinessProfileDrawer,
    regenerateAIQuestions,
    updateSeedPrompt,
    handleSaveBusinessProfile,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
    setProductDescription,
    setTargetAudience,
    setBusinessCompetitors,
    setBrandedKeywords,
    setNonBrandedKeywords,
    setTargetKeywords: updateTargetKeywords,
    setSeedPrompts,
  }
}
