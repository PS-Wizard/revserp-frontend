import { useState } from "react"
import { GaugeIcon, UserRoundIcon, type LucideIcon } from "lucide-react"

import { AccountAvatar } from "~/components/account/account-avatar"
import { AccountUsageSection } from "~/components/account/account-usage-section"
import { Badge } from "~/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"

export type AccountSummary = {
  name?: string
  email: string
  /** Role in the active workspace, e.g. "owner". */
  role?: string
  workspaceName?: string
}

type SectionId = "profile" | "usage"

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon; description: string }> = [
  { id: "profile", label: "Profile", icon: UserRoundIcon, description: "Your account details." },
  {
    id: "usage",
    label: "Usage",
    icon: GaugeIcon,
    description: "Limits and usage for this workspace.",
  },
]

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).replaceAll("_", " ")
}

export function AccountSettingsDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AccountSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [section, setSection] = useState<SectionId>("profile")
  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(600px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:flex-row">
        <nav
          aria-label="Account settings"
          className="flex shrink-0 gap-1 border-b border-border/60 bg-muted/20 p-3 sm:w-52 sm:flex-col sm:border-r sm:border-b-0"
        >
          <p className="hidden px-2 pt-1 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:block">
            Account
          </p>
          {SECTIONS.map((item) => (
            <button
              aria-current={item.id === section ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                item.id === section && "bg-muted text-foreground"
              )}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-1.5 px-6 pt-6 pb-5">
            <DialogTitle className="text-lg">{active.label}</DialogTitle>
            <DialogDescription>{active.description}</DialogDescription>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {section === "profile" ? (
              <ProfileSection account={account} />
            ) : (
              <AccountUsageSection />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSection({ account }: { account: AccountSummary }) {
  const displayName = account.name?.trim() || account.email.split("@")[0]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <AccountAvatar className="size-16 text-xl" email={account.email} name={account.name} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-base font-medium">{displayName}</span>
          <span className="truncate text-sm text-muted-foreground">{account.email}</span>
        </div>
      </div>

      <dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20 text-sm">
        <ProfileRow label="Name" value={displayName} />
        <ProfileRow label="Email" value={account.email} />
        {account.workspaceName ? (
          <ProfileRow label="Workspace" value={account.workspaceName} />
        ) : null}
        {account.role ? (
          <ProfileRow
            label="Role"
            value={<Badge variant="outline">{formatRole(account.role)}</Badge>}
          />
        ) : null}
      </dl>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  )
}
