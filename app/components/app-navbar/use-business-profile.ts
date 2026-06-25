"use client"

import { useState } from "react"
import type { FormEvent } from "react"

import type {
  ProjectBusinessProfileResponse,
  ProjectBusinessProfileStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { clientApiFetch, clientApiPut } from "~/lib/api"

const EMPTY_SEED_PROMPTS = ["", "", "", "", ""]

export function useBusinessProfile() {
  const [businessProfileProject, setBusinessProfileProject] =
    useState<ProjectResponse | null>(null)
  const [businessProfileStatus, setBusinessProfileStatus] =
    useState<ProjectBusinessProfileStatusResponse | null>(null)
  const [brandName, setBrandName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [primaryCategory, setPrimaryCategory] = useState("")
  const [primaryLocation, setPrimaryLocation] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [seedPrompts, setSeedPrompts] = useState(EMPTY_SEED_PROMPTS)
  const [businessProfileError, setBusinessProfileError] = useState("")
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] =
    useState(false)
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false)

  const canManageBusinessProfile =
    businessProfileStatus?.can_manage_profile === true

  function applyBusinessProfile(
    profile: ProjectBusinessProfileResponse | undefined,
    project: ProjectResponse
  ) {
    setBrandName(profile?.brand_name ?? "")
    setWebsiteUrl(profile?.website_url?.trim() || project.base_url)
    setPrimaryCategory(profile?.primary_category ?? "")
    setPrimaryLocation(profile?.primary_location ?? "")
    setBusinessDescription(profile?.business_description ?? "")
    setSeedPrompts(
      Array.from(
        { length: 5 },
        (_, index) => profile?.seed_prompts?.[index] ?? ""
      )
    )
  }

  async function openBusinessProfileDrawer(project: ProjectResponse) {
    setBusinessProfileProject(project)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
    applyBusinessProfile(undefined, project)
    setIsLoadingBusinessProfile(true)

    try {
      const status = await clientApiFetch<ProjectBusinessProfileStatusResponse>(
        `/projects/${project.id}/business-profile`
      )
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
    }
  }

  function closeBusinessProfileDrawer() {
    setBusinessProfileProject(null)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
  }

  function updateSeedPrompt(index: number, value: string) {
    setSeedPrompts((current) =>
      current.map((prompt, promptIndex) =>
        promptIndex === index ? value : prompt
      )
    )
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
      closeBusinessProfileDrawer()
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
    seedPrompts,
    businessProfileError,
    isLoadingBusinessProfile,
    isSavingBusinessProfile,
    canManageBusinessProfile,
    openBusinessProfileDrawer,
    closeBusinessProfileDrawer,
    updateSeedPrompt,
    handleSaveBusinessProfile,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
    setSeedPrompts,
  }
}
