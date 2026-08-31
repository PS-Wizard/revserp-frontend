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
import { clientApiFetch, clientApiPut } from "~/lib/api"
import { invalidateBusinessProfile } from "~/lib/business-profile-query"

const EMPTY_SEED_PROMPTS = ["", "", "", "", ""]

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

  const canManageBusinessProfile =
    businessProfileStatus?.can_manage_profile === true

  const hasUnsavedChanges =
    savedSnapshot === null ||
    brandName !== savedSnapshot.brandName ||
    websiteUrl !== savedSnapshot.websiteUrl ||
    primaryCategory !== savedSnapshot.primaryCategory ||
    primaryLocation !== savedSnapshot.primaryLocation ||
    businessDescription !== savedSnapshot.businessDescription ||
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

  async function pollAIQuestions(projectId: string) {
    setIsRegeneratingAIQuestions(true)
    const maxAttempts = 10
    const intervalMs = 3000
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      if (activeProjectIdRef.current !== projectId) return
      const found = await fetchAIQuestions(projectId)
      if (activeProjectIdRef.current !== projectId) return
      if (found) break
    }
    setIsRegeneratingAIQuestions(false)
  }

  async function openBusinessProfileDrawer(project: ProjectResponse) {
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

    try {
      const profile = await clientApiPut<ProjectBusinessProfileResponse>(
        `/projects/${businessProfileProject.id}/business-profile`,
        {
          brand_name: brandName,
          website_url: websiteUrl,
          primary_category: primaryCategory,
          primary_location: primaryLocation,
          business_description: businessDescription,
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
      void invalidateBusinessProfile(queryClient, businessProfileProject.id)
      closeBusinessProfileDrawer()
      pollAIQuestions(businessProfileProject.id)
    } catch (error) {
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
    targetKeywords,
    seedPrompts,
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
    updateSeedPrompt,
    handleSaveBusinessProfile,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
    setTargetKeywords: updateTargetKeywords,
    setSeedPrompts,
  }
}
