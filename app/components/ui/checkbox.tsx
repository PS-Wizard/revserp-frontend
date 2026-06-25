import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "~/lib/utils"

type CheckedState = boolean | "indeterminate"

type CheckboxProps = {
  checked?: CheckedState
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  "aria-label"?: string
  className?: string
}

function Checkbox({
  className,
  checked = false,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const indeterminate = checked === "indeterminate"
  const isChecked = checked === true

  const handleToggle = () => {
    if (disabled) return
    onCheckedChange?.(!isChecked)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      handleToggle()
    }
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background shadow-xs transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        (indeterminate || isChecked) &&
          "border-primary bg-primary text-primary-foreground",
        className
      )}
    >
      {indeterminate ? (
        <MinusIcon className="size-3" />
      ) : isChecked ? (
        <CheckIcon className="size-3" />
      ) : null}
    </button>
  )
}

export { Checkbox }
