"use client"

import { useReducer } from "react"
import type { FormEvent } from "react"
import type { MeResponse } from "~/lib/api.types"
import { clientApiPost } from "~/lib/api"
import { clearSupabaseBrowserSession } from "~/lib/auth.client"
import { getDefaultInviteExpiryValue, getInviteValidationError } from "./utils"

// --- State ---

type WorkspaceAction = "idle" | "switching" | "leaving" | "logging-out"

type WorkspaceActionState = {
  profileActionError: string
  workspaceAction: WorkspaceAction
  isInviteDialogOpen: boolean
  inviteExpiresAt: string
  inviteMaxUses: string
  inviteLink: string
  hasCopiedInviteLink: boolean
  isCreatingInvite: boolean
  isLeaveWorkspaceOpen: boolean
}

function initialWorkspaceState(): WorkspaceActionState {
  return {
    profileActionError: "",
    workspaceAction: "idle",
    isInviteDialogOpen: false,
    inviteExpiresAt: getDefaultInviteExpiryValue(),
    inviteMaxUses: "10",
    inviteLink: "",
    hasCopiedInviteLink: false,
    isCreatingInvite: false,
    isLeaveWorkspaceOpen: false,
  }
}

// --- Actions ---

type WorkspaceActionEvent =
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SET_WORKSPACE_ACTION"; action: WorkspaceAction }
  | { type: "RESET_WORKSPACE_ACTION" }
  | { type: "OPEN_INVITE_DIALOG" }
  | { type: "CLOSE_INVITE_DIALOG" }
  | { type: "SET_CREATING_INVITE"; value: boolean }
  | { type: "SET_INVITE_EXPIRES_AT"; value: string }
  | { type: "SET_INVITE_MAX_USES"; value: string }
  | { type: "SET_INVITE_LINK"; value: string }
  | { type: "SET_COPIED_INVITE_LINK"; value: boolean }
  | { type: "OPEN_LEAVE_DIALOG" }
  | { type: "CLOSE_LEAVE_DIALOG" }
  | { type: "RESET_INVITE_FORM" }

function workspaceActionReducer(
  state: WorkspaceActionState,
  event: WorkspaceActionEvent
): WorkspaceActionState {
  switch (event.type) {
    case "SET_ERROR":
      return { ...state, profileActionError: event.error }
    case "CLEAR_ERROR":
      return { ...state, profileActionError: "" }
    case "SET_WORKSPACE_ACTION":
      return { ...state, workspaceAction: event.action }
    case "RESET_WORKSPACE_ACTION":
      return { ...state, workspaceAction: "idle" }
    case "OPEN_INVITE_DIALOG":
      return {
        ...state,
        profileActionError: "",
        isInviteDialogOpen: true,
        inviteLink: "",
        hasCopiedInviteLink: false,
        isCreatingInvite: false,
      }
    case "CLOSE_INVITE_DIALOG":
      return { ...state, isInviteDialogOpen: false, profileActionError: "" }
    case "SET_CREATING_INVITE":
      return { ...state, isCreatingInvite: event.value }
    case "SET_INVITE_EXPIRES_AT":
      return { ...state, inviteExpiresAt: event.value }
    case "SET_INVITE_MAX_USES":
      return { ...state, inviteMaxUses: event.value }
    case "SET_INVITE_LINK":
      return { ...state, inviteLink: event.value }
    case "SET_COPIED_INVITE_LINK":
      return { ...state, hasCopiedInviteLink: event.value }
    case "OPEN_LEAVE_DIALOG":
      return { ...state, profileActionError: "", isLeaveWorkspaceOpen: true }
    case "CLOSE_LEAVE_DIALOG":
      return { ...state, isLeaveWorkspaceOpen: false }
    case "RESET_INVITE_FORM":
      return {
        ...state,
        inviteLink: "",
        hasCopiedInviteLink: false,
        isCreatingInvite: false,
        inviteExpiresAt: getDefaultInviteExpiryValue(),
        inviteMaxUses: "10",
      }
  }
}

// --- Hook ---

type UseWorkspaceActionsParams = {
  organizationId: string
  organizations: MeResponse["organizations"]
  navigate: ReturnType<typeof import("react-router").useNavigate>
  revalidator: ReturnType<typeof import("react-router").useRevalidator>
}

export function useWorkspaceActions({
  organizationId,
  organizations,
  navigate,
  revalidator,
}: UseWorkspaceActionsParams) {
  const [state, dispatch] = useReducer(
    workspaceActionReducer,
    undefined,
    initialWorkspaceState
  )

  async function handleSelectOrganization(nextOrganizationId: string) {
    if (
      !nextOrganizationId ||
      nextOrganizationId === organizationId ||
      state.workspaceAction === "switching"
    ) {
      return
    }

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "SET_WORKSPACE_ACTION", action: "switching" })

    try {
      await clientApiPost<{ ok: boolean; active_org_id: string }>(
        "/me/active-organization",
        {
          organization_id: nextOrganizationId,
        }
      )
      await navigate("/app")
      revalidator.revalidate()
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error:
          error instanceof Error
            ? error.message
            : "Unable to switch workspace.",
      })
    } finally {
      dispatch({ type: "RESET_WORKSPACE_ACTION" })
    }
  }

  function openInviteDialog() {
    dispatch({ type: "OPEN_INVITE_DIALOG" })
  }

  function closeInviteDialog(open: boolean) {
    if (open) return
    dispatch({ type: "CLOSE_INVITE_DIALOG" })
    dispatch({ type: "RESET_INVITE_FORM" })
  }

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId || state.isCreatingInvite) return

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "SET_COPIED_INVITE_LINK", value: false })

    const expiresAtDate = new Date(state.inviteExpiresAt)
    const maxUses = Number(state.inviteMaxUses)
    const validationError = getInviteValidationError(
      state.inviteExpiresAt,
      expiresAtDate,
      maxUses
    )
    if (validationError) {
      dispatch({ type: "SET_ERROR", error: validationError })
      return
    }

    dispatch({ type: "SET_CREATING_INVITE", value: true })

    try {
      const invite = await clientApiPost<{
        token: string
      }>(`/organizations/${organizationId}/invites`, {
        expires_at: expiresAtDate.toISOString(),
        max_uses: maxUses,
      })
      dispatch({
        type: "SET_INVITE_LINK",
        value: `${window.location.origin}/invite/${invite.token}`,
      })
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error:
          error instanceof Error
            ? error.message
            : "Unable to create invite link.",
      })
    } finally {
      dispatch({ type: "SET_CREATING_INVITE", value: false })
    }
  }

  async function handleCopyInviteLink() {
    if (!state.inviteLink) return

    await navigator.clipboard.writeText(state.inviteLink)
    dispatch({ type: "SET_COPIED_INVITE_LINK", value: true })
  }

  function openLeaveWorkspaceDialog() {
    dispatch({ type: "OPEN_LEAVE_DIALOG" })
  }

  async function handleLeaveOrganization() {
    if (!organizationId || state.workspaceAction === "leaving") return

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "SET_WORKSPACE_ACTION", action: "leaving" })

    try {
      await clientApiPost<{ ok: boolean }>(
        `/organizations/${organizationId}/leave`,
        {}
      )
      dispatch({ type: "CLOSE_LEAVE_DIALOG" })
      await navigate("/app")
      revalidator.revalidate()
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error:
          error instanceof Error ? error.message : "Unable to leave workspace.",
      })
    } finally {
      dispatch({ type: "RESET_WORKSPACE_ACTION" })
    }
  }

  async function handleLogout() {
    if (state.workspaceAction === "logging-out") return

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "SET_WORKSPACE_ACTION", action: "logging-out" })

    try {
      await clientApiPost<unknown>("/auth/logout", {})
    } finally {
      try {
        await clearSupabaseBrowserSession()
      } catch {
        // Backend session is already gone.
      }
      await navigate("/login")
      dispatch({ type: "RESET_WORKSPACE_ACTION" })
    }
  }

  const activeOrganization =
    organizations.find((org) => org.id === organizationId) ??
    organizations[0] ??
    null

  return {
    profileActionError: state.profileActionError,
    workspaceState: state.workspaceAction,
    isInviteDialogOpen: state.isInviteDialogOpen,
    inviteExpiresAt: state.inviteExpiresAt,
    inviteMaxUses: state.inviteMaxUses,
    inviteLink: state.inviteLink,
    hasCopiedInviteLink: state.hasCopiedInviteLink,
    isCreatingInvite: state.isCreatingInvite,
    isLeaveWorkspaceOpen: state.isLeaveWorkspaceOpen,
    activeOrganization,
    isActiveOrganizationOwner: activeOrganization?.role === "owner",
    handleSelectOrganization,
    openInviteDialog,
    closeInviteDialog,
    handleCreateInvite,
    handleCopyInviteLink,
    openLeaveWorkspaceDialog,
    handleLeaveOrganization,
    handleLogout,
    setInviteExpiresAt: (value: string) =>
      dispatch({ type: "SET_INVITE_EXPIRES_AT", value }),
    setInviteMaxUses: (value: string) =>
      dispatch({ type: "SET_INVITE_MAX_USES", value }),
    setLeaveWorkspaceOpen: (open: boolean) => {
      dispatch(
        open ? { type: "OPEN_LEAVE_DIALOG" } : { type: "CLOSE_LEAVE_DIALOG" }
      )
    },
  }
}
