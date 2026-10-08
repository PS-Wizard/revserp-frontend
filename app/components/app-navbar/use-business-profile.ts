"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
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

/** Location workspace scope for the profile hook. Omitted means parent project scope. */
export type BusinessProfileLocationScope = {
  projectId: string
  locationId: string
  locationName?: string | null
}

/** Query keys include the location id when scoped, so local and parent profiles never share cache. */
export function businessProfileScopedQueryKey(
  projectId: string,
  locationId?: string | null
) {
  return locationId
    ? (["business-profile", projectId, locationId] as const)
    : (["business-profile", projectId] as const)
}

/** Scoped GET/PUT endpoint; never substitute a location id for the project id. */
export function locationBusinessProfilePath(
  projectId: string,
  locationId?: string | null
) {
  return locationId
    ? `/projects/${projectId}/locations/${locationId}/business-profile`
    : `/projects/${projectId}/business-profile`
}

/** Location AI question set endpoint; the parent path stays project-scoped. */
export function locationAIQuestionsPath(projectId: string, locationId: string) {
  return `/projects/${projectId}/locations/${locationId}/ai-questions`
}

/**
 * True only when an event's normalized location scope equals the pending scope.
 * Parent jobs carry a null location_id; location jobs carry their own id, so
 * parent/A/B terminal events can never complete each other's generation.
 */
export function promptGenerationScopeMatches(
  pendingLocationId: string | null,
  rawPayloadLocationId: unknown
): boolean {
  const eventLocationId =
    typeof rawPayloadLocationId === "string" && rawPayloadLocationId.trim()
      ? rawPayloadLocationId
      : null
  return eventLocationId === pendingLocationId
}

type PendingGeneration = {
  projectId: string
  locationId: string | null
  scopeKey: string
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
  seedPrompts: string[]
  /** Location services snapshot; parent profiles leave this empty. */
  services: string[]
}

/** Trimmed, de-duplicated services list; saved with the local profile only. */
export function normalizeProfileServices(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push(trimmed)
  }
  return result
}

export function useBusinessProfile(locationScope?: BusinessProfileLocationScope) {
  const scopedProjectId = locationScope?.projectId ?? null
  const scopedLocationId = locationScope?.locationId ?? null
  const scopedLocationName = locationScope?.locationName ?? null
  const isLocationScoped = scopedLocationId !== null
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
  const [seedPrompts, setSeedPrompts] = useState(EMPTY_SEED_PROMPTS)
  const [profileServices, setProfileServices] = useState<string[]>([])
  const [businessProfileError, setBusinessProfileError] = useState("")
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] =
    useState(false)
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false)
  const [aiQuestions, setAIQuestions] =
    useState<ProjectAIQuestionsResponse | null>(null)
  const [isLoadingAIQuestions, setIsLoadingAIQuestions] = useState(false)
  const [isRegeneratingAIQuestions, setIsRegeneratingAIQuestions] =
    useState(false)
  const activeScopeKeyRef = useRef<string | null>(null)
  const pendingGenerationRef = useRef<PendingGeneration | null>(null)

  const canManageBusinessProfile =
    businessProfileStatus?.can_manage_profile === true


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
    seedPrompts.some((p, i) => p !== savedSnapshot.seedPrompts[i]) ||
    profileServices.length !== savedSnapshot.services.length ||
    profileServices.some((s, i) => s !== savedSnapshot.services[i])

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
      seedPrompts: Array.from(
        { length: 5 },
        (_, index) => profile?.seed_prompts?.[index] ?? ""
      ),
      services: profile?.services ? [...profile.services] : [],
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
    setSeedPrompts(snapshot.seedPrompts)
    setProfileServices(snapshot.services)
  }

  async function fetchAIQuestions(projectId: string, locationId?: string | null) {
    try {
      const data = await clientApiFetch<ProjectAIQuestionsResponse>(
        locationId
          ? locationAIQuestionsPath(projectId, locationId)
          : `/projects/${projectId}/ai-questions`
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
    locationId: string | null,
    requestedAfterMs: number,
    toastId?: string | number
  ) {
    const scopeKey = locationId ? `${projectId}:${locationId}` : projectId
    pendingGenerationRef.current = {
      projectId,
      locationId,
      scopeKey,
      requestedAfterMs,
      toastId,
    }
    if (activeScopeKeyRef.current === scopeKey) {
      setIsRegeneratingAIQuestions(true)
    }
  }

  useOrganizationEventsListener((event) => {
    if (!event.type.startsWith("prompt_generation.")) return
    const pending = pendingGenerationRef.current
    if (!pending) return
    const eventProjectId = event.project_id ?? event.resource_id
    if (eventProjectId !== pending.projectId) return
    // Strict scope: a parent event (null location_id) must not complete a local
    // pending generation, and vice versa.
    if (
      !promptGenerationScopeMatches(
        pending.locationId,
        event.payload.location_id
      )
    ) {
      return
    }
    if (
      event.type === "prompt_generation.queued" ||
      event.type === "prompt_generation.started"
    ) {
      return
    }
    if (activeScopeKeyRef.current !== pending.scopeKey) {
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
    void fetchAIQuestions(pending.projectId, pending.locationId)
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
    const projectId = scopedProjectId ?? project.id
    const scopeKey = scopedLocationId
      ? `${projectId}:${scopedLocationId}`
      : project.id
    const pending = pendingGenerationRef.current
    if (pending && pending.projectId !== project.id) {
      if (pending.toastId !== undefined) toast.dismiss(pending.toastId)
      pendingGenerationRef.current = null
    }
    activeScopeKeyRef.current = scopeKey
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
          locationBusinessProfilePath(projectId, scopedLocationId)
        ),
        fetchAIQuestions(projectId, scopedLocationId),
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

    const projectId = scopedProjectId ?? businessProfileProject.id
    const requestedAfterMs = Date.now()
    const toastId = toast.loading("Regenerating questions…", {
      className: REGENERATE_TOAST_CLASS,
      duration: Infinity,
    })

    setAIQuestions(null)
    beginGenerationTracking(
      projectId,
      scopedLocationId,
      requestedAfterMs,
      toastId
    )
    try {
      await clientApiFetch<{ status: string }>(
        scopedLocationId
          ? `${locationAIQuestionsPath(projectId, scopedLocationId)}/regenerate`
          : `/projects/${projectId}/ai-questions/regenerate`,
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

  /** Saves an explicit local question edit; parent questions are never written. */
  async function saveAIQuestions(questions: string[]) {
    if (
      !businessProfileProject ||
      !scopedLocationId ||
      !businessProfileStatus?.can_manage_profile
    ) {
      return false
    }
    const projectId = scopedProjectId ?? businessProfileProject.id
    try {
      const data = await clientApiPut<ProjectAIQuestionsResponse>(
        locationAIQuestionsPath(projectId, scopedLocationId),
        { questions }
      )
      setAIQuestions(data)
      return true
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save questions."
      )
      return false
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


    setBusinessProfileError("")
    setIsSavingBusinessProfile(true)

    // The backend enqueues prompt generation before the PUT returns, so a fast
    // terminal SSE frame can beat the response. Track the automatic job with a
    // pre-request timestamp first; there is no toast for this path.
    const projectId = scopedProjectId ?? businessProfileProject.id
    const profilePath = locationBusinessProfilePath(
      projectId,
      scopedLocationId
    )
    if (!isLocationScoped) beginGenerationTracking(projectId, null, Date.now())

    try {
      const profile = await clientApiPut<ProjectBusinessProfileResponse>(
        profilePath,
        {
          brand_name: brandName,
          website_url: websiteUrl,
          primary_category: primaryCategory,
          primary_location: primaryLocation,
          business_description: businessDescription,
          product_description: productDescription,
          target_audience: targetAudience,
          business_competitors: parseTargetKeywords(businessCompetitors),
          seed_prompts: seedPrompts.flatMap((prompt) => {
            const trimmedPrompt = prompt.trim()
            return trimmedPrompt ? [trimmedPrompt] : []
          }),
          ...(isLocationScoped
            ? { services: normalizeProfileServices(profileServices) }
            : {}),
        }
      )

      setBusinessProfileStatus({
        has_profile: true,
        can_manage_profile: businessProfileStatus.can_manage_profile,
        business_profile: profile,
      })
      applyBusinessProfile(profile, businessProfileProject)
      if (isLocationScoped && scopedLocationId) {
        void queryClient.invalidateQueries({
          queryKey: businessProfileScopedQueryKey(
            projectId,
            scopedLocationId
          ),
          exact: true,
        })
      } else {
        void invalidateBusinessProfile(queryClient, projectId)
      }
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
    businessProfileLocationId: scopedLocationId,
    businessProfileLocationName: scopedLocationName,
    isLocationScoped,
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    productDescription,
    targetAudience,
    businessCompetitors,
    seedPrompts,
    profileServices,
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
    saveAIQuestions,
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
    setSeedPrompts,
    setProfileServices,
  }
}
