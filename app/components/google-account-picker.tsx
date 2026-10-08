import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  describeGoogleAccount,
  type LocationGoogleConnection,
} from "~/lib/location-google-api"

export function googleAccountPickerLabel(
  account: LocationGoogleConnection,
  blankIndex: number | null
): string {
  const identity = describeGoogleAccount(account)
  if (identity.verified) return identity.label
  return blankIndex !== null ? `Google account ${blankIndex}` : "Google account"
}

export function GoogleAccountPicker({
  accounts,
  value,
  disabled,
  onValueChange,
  triggerClassName,
}: {
  accounts: LocationGoogleConnection[]
  value: string
  disabled?: boolean
  onValueChange: (value: string | null) => void
  triggerClassName?: string
}) {
  const blankIds = accounts.filter(
    (account) => !describeGoogleAccount(account).verified
  )
  const sharedBlank = blankIds.length > 1
  const blankPosition = new Map(blankIds.map((account, index) => [account.id, index + 1]))
  const labelFor = (account: LocationGoogleConnection) =>
    googleAccountPickerLabel(
      account,
      sharedBlank ? (blankPosition.get(account.id) ?? null) : null
    )
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label="Google account" className={triggerClassName}>
        <SelectValue placeholder="Select a Google account">
          {(id: string) => {
            const account = accounts.find((item) => item.id === id)
            return account ? labelFor(account) : id
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {accounts.map((account) => {
            const identity = describeGoogleAccount(account)
            const status =
              account.google_status === "active"
                ? identity.verified
                  ? "Connected"
                  : "Connected. Reconnect to verify identity."
                : account.google_status || "Reconnect to verify identity"
            return (
              <SelectItem key={account.id} value={account.id}>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span>{labelFor(account)}</span>
                  <span className="text-xs text-muted-foreground">
                    {status}
                  </span>
                </div>
              </SelectItem>
            )
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
