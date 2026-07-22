import { CopyIcon } from "lucide-react"

import { ThinkingOrb } from "thinking-orbs"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

import { formatCrawlDateTime } from "./utils"

type CreateProjectDialogProps = {
  createProjectError: string
  isCreatingProject: boolean
  isOpen: boolean
  projectBaseUrl: string
  projectName: string
  onBaseUrlChange: (value: string) => void
  onNameChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function CreateProjectDialog({
  createProjectError,
  isCreatingProject,
  isOpen,
  projectBaseUrl,
  projectName,
  onBaseUrlChange,
  onNameChange,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Add a project to this workspace and start crawling it.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">Project name</FieldLabel>
              <Input
                id="project-name"
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Revserp.ai"
                value={projectName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-base-url">Base URL</FieldLabel>
              <Input
                id="project-base-url"
                onChange={(event) => onBaseUrlChange(event.target.value)}
                placeholder="https://revserp.ai"
                value={projectBaseUrl}
              />
              <FieldDescription>
                Use the canonical site URL you want to crawl.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <FieldError>{createProjectError}</FieldError>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isCreatingProject} type="submit">
              {isCreatingProject ? (
                <ThinkingOrb
                  aria-hidden="true"
                  className="shrink-0"
                  size={20}
                  state="working"
                  style={{ width: 18, height: 18 }}
                />
              ) : null}
              {isCreatingProject ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type DeleteProjectDialogProps = {
  deletingProjectId: string | null
  isOpen: boolean
  projectActionError: string
  projectPendingDelete: ProjectResponse | null
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}

export function DeleteProjectDialog({
  deletingProjectId,
  isOpen,
  projectActionError,
  projectPendingDelete,
  onDelete,
  onOpenChange,
}: DeleteProjectDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            {getDeleteProjectDescription(projectPendingDelete)}
          </DialogDescription>
        </DialogHeader>

        <FieldError>{projectActionError}</FieldError>

        <DialogFooter>
          <Button
            disabled={deletingProjectId !== null}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={deletingProjectId !== null || !projectPendingDelete}
            onClick={onDelete}
            type="button"
            variant="destructive"
          >
            {deletingProjectId ? (
              <ThinkingOrb
                aria-hidden="true"
                className="shrink-0"
                size={20}
                state="working"
                style={{ width: 18, height: 18 }}
              />
            ) : null}
            {deletingProjectId ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DeleteCrawlDialogProps = {
  crawlPendingDelete: CrawlResponse | null
  deletingCrawlId: string | null
  isOpen: boolean
  projectActionError: string
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}

export function DeleteCrawlDialog({
  crawlPendingDelete,
  deletingCrawlId,
  isOpen,
  projectActionError,
  onDelete,
  onOpenChange,
}: DeleteCrawlDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete crawl</DialogTitle>
          <DialogDescription>
            {getDeleteCrawlDescription(crawlPendingDelete)}
          </DialogDescription>
        </DialogHeader>

        <FieldError>{projectActionError}</FieldError>

        <DialogFooter>
          <Button
            disabled={deletingCrawlId !== null}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={deletingCrawlId !== null || !crawlPendingDelete}
            onClick={onDelete}
            type="button"
            variant="destructive"
          >
            {deletingCrawlId ? (
              <ThinkingOrb
                aria-hidden="true"
                className="shrink-0"
                size={20}
                state="working"
                style={{ width: 18, height: 18 }}
              />
            ) : null}
            {deletingCrawlId ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type InviteMembersDialogProps = {
  activeOrganizationName?: string
  hasCopiedInviteLink: boolean
  inviteExpiresAt: string
  inviteLink: string
  inviteMaxUses: string
  isCreatingInvite: boolean
  isOpen: boolean
  profileActionError: string
  onCopyInviteLink: () => void
  onExpiresAtChange: (value: string) => void
  onMaxUsesChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function InviteMembersDialog({
  activeOrganizationName,
  hasCopiedInviteLink,
  inviteExpiresAt,
  inviteLink,
  inviteMaxUses,
  isCreatingInvite,
  isOpen,
  profileActionError,
  onCopyInviteLink,
  onExpiresAtChange,
  onMaxUsesChange,
  onOpenChange,
  onSubmit,
}: InviteMembersDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite members</DialogTitle>
          <DialogDescription>
            Create a reusable invite link for{" "}
            {activeOrganizationName ?? "this workspace"}.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-expires-at">Expires at</FieldLabel>
              <Input
                id="invite-expires-at"
                onChange={(event) => onExpiresAtChange(event.target.value)}
                type="datetime-local"
                value={inviteExpiresAt}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-max-uses">Max uses</FieldLabel>
              <Input
                id="invite-max-uses"
                min="1"
                onChange={(event) => onMaxUsesChange(event.target.value)}
                step="1"
                type="number"
                value={inviteMaxUses}
              />
            </Field>
          </FieldGroup>

          {inviteLink ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Invite link
              </p>
              <p className="mt-2 text-sm break-all">{inviteLink}</p>
            </div>
          ) : null}

          <FieldError>{profileActionError}</FieldError>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            {inviteLink ? (
              <Button onClick={onCopyInviteLink} type="button">
                <CopyIcon />
                {hasCopiedInviteLink ? "Copied" : "Copy link"}
              </Button>
            ) : (
              <Button disabled={isCreatingInvite} type="submit">
                {isCreatingInvite ? (
                  <ThinkingOrb
                    aria-hidden="true"
                    className="shrink-0"
                    size={20}
                    state="working"
                    style={{ width: 18, height: 18 }}
                  />
                ) : null}
                {isCreatingInvite ? "Creating..." : "Create invite link"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type LeaveWorkspaceDialogProps = {
  activeOrganizationName?: string
  isLeavingWorkspace: boolean
  isOpen: boolean
  profileActionError: string
  onLeave: () => void
  onOpenChange: (open: boolean) => void
}

export function LeaveWorkspaceDialog({
  activeOrganizationName,
  isLeavingWorkspace,
  isOpen,
  profileActionError,
  onLeave,
  onOpenChange,
}: LeaveWorkspaceDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave workspace</DialogTitle>
          <DialogDescription>
            Leave {activeOrganizationName ?? "this workspace"}? You will lose
            access to its projects, crawls, and invites.
          </DialogDescription>
        </DialogHeader>

        <FieldError>{profileActionError}</FieldError>

        <DialogFooter>
          <Button
            disabled={isLeavingWorkspace}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isLeavingWorkspace}
            onClick={onLeave}
            type="button"
            variant="destructive"
          >
            {isLeavingWorkspace ? (
              <ThinkingOrb
                aria-hidden="true"
                className="shrink-0"
                size={20}
                state="working"
                style={{ width: 18, height: 18 }}
              />
            ) : null}
            {isLeavingWorkspace ? "Leaving..." : "Leave workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getDeleteProjectDescription(project: ProjectResponse | null) {
  if (!project) {
    return "Delete this project? This permanently removes related crawl data."
  }

  return `Delete ${project.name}? This permanently removes the project and related crawl data.`
}

function getDeleteCrawlDescription(crawl: CrawlResponse | null) {
  if (!crawl) {
    return "Delete this crawl? This permanently removes its pages, issues, and score breakdown."
  }

  return `Delete crawl from ${formatCrawlDateTime(crawl)}? This permanently removes its pages, issues, and score breakdown.`
}
