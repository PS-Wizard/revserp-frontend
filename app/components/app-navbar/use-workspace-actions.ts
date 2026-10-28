"use client"

import { useReducer } from "react"
import type { FormEvent } from "react"
import type { MeResponse } from "~/lib/api.types"
import { clientApiPost } from "~/lib/api"
import { clearSupabaseBrowserSession } from "~/lib/auth.client"
import {
  canManageOrganization,
  DEFAULT_ORGANIZATION_INVITE_ROLE,
  type OrganizationInviteRole,
} from "~/lib/organization-access"
import { getDefaultInviteExpiryValue, getInviteValidationError } from "./utils"

export type InviteEmailRecipient = {
  value: string
  valid: boolean
}

// --- State ---

type WorkspaceAction = "idle" | "switching" | "leaving" | "logging-out"

type WorkspaceActionState = {
  profileActionError: string
  workspaceAction: WorkspaceAction
  isInviteDialogOpen: boolean
  inviteExpiresAt: string
  inviteMaxUses: string
  inviteRole: OrganizationInviteRole
  inviteLink: string
  inviteId: string
  inviteToken: string
  hasCopiedInviteLink: boolean
  isCreatingInvite: boolean
  inviteEmailDraft: string
  inviteRecipients: InviteEmailRecipient[]
  isSendingInviteEmails: boolean
  inviteEmailResult: string
  inviteEmailResultIsError: boolean
  isLeaveWorkspaceOpen: boolean
}

function initialWorkspaceState(): WorkspaceActionState {
  return {
    profileActionError: "",
    workspaceAction: "idle",
    isInviteDialogOpen: false,
    inviteExpiresAt: getDefaultInviteExpiryValue(),
    inviteMaxUses: "10",
    inviteRole: DEFAULT_ORGANIZATION_INVITE_ROLE,
    inviteLink: "",
    inviteId: "",
    inviteToken: "",
    hasCopiedInviteLink: false,
    isCreatingInvite: false,
    inviteEmailDraft: "",
    inviteRecipients: [],
    isSendingInviteEmails: false,
    inviteEmailResult: "",
    inviteEmailResultIsError: false,
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
  | { type: "SET_INVITE_ROLE"; value: OrganizationInviteRole }
  | {
      type: "SET_INVITE_LINK"
      value: { link: string; id: string; token: string }
    }
  | { type: "SET_COPIED_INVITE_LINK"; value: boolean }
  | { type: "SET_INVITE_EMAIL_DRAFT"; value: string }
  | { type: "SET_INVITE_RECIPIENTS"; value: InviteEmailRecipient[] }
  | { type: "SET_SENDING_INVITE_EMAILS"; value: boolean }
  | {
      type: "SET_INVITE_EMAIL_RESULT"
      value: { message: string; isError: boolean }
    }
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
    case "SET_INVITE_ROLE":
      return { ...state, inviteRole: event.value }
    case "SET_INVITE_LINK":
      return {
        ...state,
        inviteLink: event.value.link,
        inviteId: event.value.id,
        inviteToken: event.value.token,
        inviteEmailDraft: "",
        inviteRecipients: [],
        inviteEmailResult: "",
        inviteEmailResultIsError: false,
      }
    case "SET_COPIED_INVITE_LINK":
      return { ...state, hasCopiedInviteLink: event.value }
    case "SET_INVITE_EMAIL_DRAFT":
      return { ...state, inviteEmailDraft: event.value }
    case "SET_INVITE_RECIPIENTS":
      return { ...state, inviteRecipients: event.value }
    case "SET_SENDING_INVITE_EMAILS":
      return { ...state, isSendingInviteEmails: event.value }
    case "SET_INVITE_EMAIL_RESULT":
      return {
        ...state,
        inviteEmailResult: event.value.message,
        inviteEmailResultIsError: event.value.isError,
      }
    case "OPEN_LEAVE_DIALOG":
      return { ...state, profileActionError: "", isLeaveWorkspaceOpen: true }
    case "CLOSE_LEAVE_DIALOG":
      return { ...state, isLeaveWorkspaceOpen: false }
    case "RESET_INVITE_FORM":
      return {
        ...state,
        inviteLink: "",
        inviteId: "",
        inviteToken: "",
        hasCopiedInviteLink: false,
        isCreatingInvite: false,
        inviteEmailDraft: "",
        inviteRecipients: [],
        isSendingInviteEmails: false,
        inviteEmailResult: "",
        inviteEmailResultIsError: false,
        inviteExpiresAt: getDefaultInviteExpiryValue(),
        inviteMaxUses: "10",
        inviteRole: DEFAULT_ORGANIZATION_INVITE_ROLE,
      }
  }
}

// --- Hook ---

type UseWorkspaceActionsParams = {
  organizationId: string
  organizations: MeResponse["organizations"]
  isPlatformAdmin?: boolean
  navigate: ReturnType<typeof import("react-router").useNavigate>
  revalidator: ReturnType<typeof import("react-router").useRevalidator>
}

function isInviteEmailValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function useWorkspaceActions({
  organizationId,
  organizations,
  isPlatformAdmin = false,
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
        invite: { id: string }
        token: string
      }>(`/organizations/${organizationId}/invites`, {
        expires_at: expiresAtDate.toISOString(),
        max_uses: maxUses,
        role: state.inviteRole,
      })
      dispatch({
        type: "SET_INVITE_LINK",
        value: {
          link: `${window.location.origin}/invite/${invite.token}`,
          id: invite.invite.id,
          token: invite.token,
        },
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

  function commitInviteEmailText(text: string) {
    const tokens = text
      .split(/[\s,;]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
    if (tokens.length === 0) {
      dispatch({ type: "SET_INVITE_EMAIL_DRAFT", value: "" })
      return
    }
    dispatch({
      type: "SET_INVITE_RECIPIENTS",
      value: [
        ...state.inviteRecipients,
        ...tokens.map((token) => ({
          value: token,
          valid: isInviteEmailValid(token),
        })),
      ],
    })
    dispatch({ type: "SET_INVITE_EMAIL_DRAFT", value: "" })
  }

  function removeInviteEmailRecipient(index: number) {
    dispatch({
      type: "SET_INVITE_RECIPIENTS",
      value: state.inviteRecipients.filter((_, i) => i !== index),
    })
  }

  function popInviteEmailRecipient() {
    if (state.inviteRecipients.length === 0) return
    removeInviteEmailRecipient(state.inviteRecipients.length - 1)
  }

  async function handleSendInviteEmails() {
    const pending = state.inviteEmailDraft
      .split(/[\s,;]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .map((token) => ({ value: token, valid: isInviteEmailValid(token) }))
    const recipients = [...state.inviteRecipients, ...pending]
    if (pending.length > 0) {
      dispatch({ type: "SET_INVITE_RECIPIENTS", value: recipients })
      dispatch({ type: "SET_INVITE_EMAIL_DRAFT", value: "" })
    }
    const valid = recipients.filter((recipient) => recipient.valid)
    if (!organizationId || !state.inviteId || !state.inviteToken) return
    if (valid.length === 0) {
      dispatch({
        type: "SET_INVITE_EMAIL_RESULT",
        value: {
          message: "Add at least one valid email address.",
          isError: true,
        },
      })
      return
    }
    dispatch({ type: "SET_SENDING_INVITE_EMAILS", value: true })
    dispatch({
      type: "SET_INVITE_EMAIL_RESULT",
      value: { message: "", isError: false },
    })
    try {
      const response = await clientApiPost<{
        results: { email: string; sent: boolean; error?: string }[]
      }>(`/organizations/${organizationId}/invites/${state.inviteId}/email`, {
        emails: valid.map((recipient) => recipient.value),
        token: state.inviteToken,
      })
      const sent = response.results.filter((result) => result.sent)
      const failed = response.results.filter((result) => !result.sent)
      const sentEmails = new Set(
        sent.map((result) => result.email.toLowerCase())
      )
      dispatch({
        type: "SET_INVITE_RECIPIENTS",
        value: recipients.filter(
          (recipient) => !sentEmails.has(recipient.value.toLowerCase())
        ),
      })
      dispatch({
        type: "SET_INVITE_EMAIL_RESULT",
        value:
          failed.length === 0
            ? {
                message:
                  sent.length === 1
                    ? `Invite sent to ${sent[0].email}.`
                    : `Invites sent to ${sent.length} addresses.`,
                isError: false,
              }
            : {
                message: `Sent to ${sent.length}, failed for ${failed
                  .map((result) => result.email)
                  .join(", ")}.`,
                isError: true,
              },
      })
    } catch (error) {
      dispatch({
        type: "SET_INVITE_EMAIL_RESULT",
        value: {
          message:
            error instanceof Error ? error.message : "Unable to send invites.",
          isError: true,
        },
      })
    } finally {
      dispatch({ type: "SET_SENDING_INVITE_EMAILS", value: false })
    }
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
      // Navigate immediately; Supabase local-storage cleanup doesn't need to
      // block the redirect since the backend session is already gone.
      void clearSupabaseBrowserSession().catch(() => undefined)
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
    inviteRole: state.inviteRole,
    inviteLink: state.inviteLink,
    hasCopiedInviteLink: state.hasCopiedInviteLink,
    isCreatingInvite: state.isCreatingInvite,
    inviteEmailDraft: state.inviteEmailDraft,
    inviteRecipients: state.inviteRecipients,
    isSendingInviteEmails: state.isSendingInviteEmails,
    inviteEmailResult: state.inviteEmailResult,
    inviteEmailResultIsError: state.inviteEmailResultIsError,
    isLeaveWorkspaceOpen: state.isLeaveWorkspaceOpen,
    activeOrganization,
    isActiveOrganizationOwner: activeOrganization?.role === "owner",
    canManageActiveOrganization: canManageOrganization(
      activeOrganization?.role,
      isPlatformAdmin
    ),
    handleSelectOrganization,
    openInviteDialog,
    closeInviteDialog,
    handleCreateInvite,
    handleCopyInviteLink,
    handleSendInviteEmails,
    commitInviteEmailText,
    removeInviteEmailRecipient,
    popInviteEmailRecipient,
    openLeaveWorkspaceDialog,
    handleLeaveOrganization,
    handleLogout,
    setInviteExpiresAt: (value: string) =>
      dispatch({ type: "SET_INVITE_EXPIRES_AT", value }),
    setInviteMaxUses: (value: string) =>
      dispatch({ type: "SET_INVITE_MAX_USES", value }),
    setInviteRole: (value: OrganizationInviteRole) =>
      dispatch({ type: "SET_INVITE_ROLE", value }),
    setInviteEmailDraft: (value: string) =>
      dispatch({ type: "SET_INVITE_EMAIL_DRAFT", value }),
    setLeaveWorkspaceOpen: (open: boolean) => {
      dispatch(
        open ? { type: "OPEN_LEAVE_DIALOG" } : { type: "CLOSE_LEAVE_DIALOG" }
      )
    },
  }
}
