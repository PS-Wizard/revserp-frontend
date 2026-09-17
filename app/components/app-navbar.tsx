"use client"

import type { FormEvent } from "react"

import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import {
  CreateProjectDialog,
  DeleteCrawlDialog,
  DeleteProjectDialog,
  InviteMembersDialog,
  LeaveWorkspaceDialog,
} from "~/components/app-navbar/dialogs"
import { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import { useProjectActions } from "~/components/app-navbar/use-project-actions"
import { useWorkspaceActions } from "~/components/app-navbar/use-workspace-actions"
import type {
  AppNavbarProps,
  DashboardView,
} from "~/components/app-navbar/types"

// --- Create project form reducer ---

type CreateProjectState = {
  isCreateProjectOpen: boolean
  projectName: string
  projectBaseUrl: string
  createProjectError: string
  isCreatingProject: boolean
}

type CreateProjectEvent =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_BASE_URL"; value: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_CREATING" }
  | { type: "CREATED" }

// --- Dialogs ---

export type AppNavbarDialogsProps = {
  businessProfile: ReturnType<typeof useBusinessProfile>
  createProject: CreateProjectState
  createProjectDispatch: React.Dispatch<CreateProjectEvent>
  handleCreateProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onDismissDock: () => void
  projectActions: ReturnType<typeof useProjectActions>
  workspaceActions: ReturnType<typeof useWorkspaceActions>
}

export function AppNavbarDialogs({
  businessProfile,
  createProject,
  createProjectDispatch,
  handleCreateProject,
  onDismissDock,
  projectActions,
  workspaceActions,
}: AppNavbarDialogsProps) {
  return (
    <>
      <BusinessProfileDrawer businessProfile={businessProfile} />

      <CreateProjectDialog
        createProjectError={createProject.createProjectError}
        isCreatingProject={createProject.isCreatingProject}
        isOpen={createProject.isCreateProjectOpen}
        projectBaseUrl={createProject.projectBaseUrl}
        projectName={createProject.projectName}
        onBaseUrlChange={(value) =>
          createProjectDispatch({ type: "SET_BASE_URL", value })
        }
        onNameChange={(value) =>
          createProjectDispatch({ type: "SET_NAME", value })
        }
        onOpenChange={(open) =>
          createProjectDispatch(open ? { type: "OPEN" } : { type: "CLOSE" })
        }
        onSubmit={handleCreateProject}
      />

      <DeleteProjectDialog
        deletingProjectId={projectActions.deletingProjectId}
        isOpen={projectActions.isDeleteProjectOpen}
        projectActionError={projectActions.projectActionError}
        projectPendingDelete={projectActions.projectPendingDelete}
        onDelete={() => {
          onDismissDock()
          void projectActions.handleDeleteProject()
        }}
        onOpenChange={(open) => {
          if (!open) projectActions.closeDialog()
        }}
      />

      <DeleteCrawlDialog
        crawlPendingDelete={projectActions.crawlPendingDelete}
        deletingCrawlId={projectActions.deletingCrawlId}
        isOpen={projectActions.isDeleteCrawlOpen}
        projectActionError={projectActions.projectActionError}
        onDelete={() => void projectActions.handleDeleteCrawl()}
        onOpenChange={(open) => {
          if (!open) projectActions.closeDialog()
        }}
      />

      <InviteMembersDialog
        activeOrganizationName={workspaceActions.activeOrganization?.name}
        hasCopiedInviteLink={workspaceActions.hasCopiedInviteLink}
        inviteExpiresAt={workspaceActions.inviteExpiresAt}
        inviteLink={workspaceActions.inviteLink}
        inviteMaxUses={workspaceActions.inviteMaxUses}
        isCreatingInvite={workspaceActions.isCreatingInvite}
        isOpen={workspaceActions.isInviteDialogOpen}
        profileActionError={workspaceActions.profileActionError}
        onCopyInviteLink={() => void workspaceActions.handleCopyInviteLink()}
        onExpiresAtChange={workspaceActions.setInviteExpiresAt}
        onMaxUsesChange={workspaceActions.setInviteMaxUses}
        onOpenChange={workspaceActions.closeInviteDialog}
        onSubmit={workspaceActions.handleCreateInvite}
      />

      <LeaveWorkspaceDialog
        activeOrganizationName={workspaceActions.activeOrganization?.name}
        isLeavingWorkspace={workspaceActions.workspaceState === "leaving"}
        isOpen={workspaceActions.isLeaveWorkspaceOpen}
        profileActionError={workspaceActions.profileActionError}
        onLeave={() => void workspaceActions.handleLeaveOrganization()}
        onOpenChange={workspaceActions.setLeaveWorkspaceOpen}
      />
    </>
  )
}

export type { AppNavbarProps, DashboardView }
