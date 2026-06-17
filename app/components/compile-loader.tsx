import { cn } from "~/lib/utils"

export function CompileLoader({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      aria-label="Loading"
      className={cn("shrink-0", className)}
      role="img"
      style={{ height: size, width: size }}
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Loading</title>
      <desc>Each column fills bottom-up, then releases as one.</desc>
      <defs>
        <circle id="compile-loader-background-dot" fill="currentColor" opacity="0.07" r="2.4" />
        <circle id="compile-loader-lit-dot" r="3.1" />
      </defs>
      <use href="#compile-loader-background-dot" x="6" y="6" />
      <use href="#compile-loader-background-dot" x="17" y="6" />
      <use href="#compile-loader-background-dot" x="28" y="6" />
      <use href="#compile-loader-background-dot" x="39" y="6" />
      <use href="#compile-loader-background-dot" x="50" y="6" />
      <use href="#compile-loader-background-dot" x="6" y="17" />
      <use href="#compile-loader-background-dot" x="17" y="17" />
      <use href="#compile-loader-background-dot" x="28" y="17" />
      <use href="#compile-loader-background-dot" x="39" y="17" />
      <use href="#compile-loader-background-dot" x="50" y="17" />
      <use href="#compile-loader-background-dot" x="6" y="28" />
      <use href="#compile-loader-background-dot" x="17" y="28" />
      <use href="#compile-loader-background-dot" x="28" y="28" />
      <use href="#compile-loader-background-dot" x="39" y="28" />
      <use href="#compile-loader-background-dot" x="50" y="28" />
      <use href="#compile-loader-background-dot" x="6" y="39" />
      <use href="#compile-loader-background-dot" x="17" y="39" />
      <use href="#compile-loader-background-dot" x="28" y="39" />
      <use href="#compile-loader-background-dot" x="39" y="39" />
      <use href="#compile-loader-background-dot" x="50" y="39" />
      <use href="#compile-loader-background-dot" x="6" y="50" />
      <use href="#compile-loader-background-dot" x="17" y="50" />
      <use href="#compile-loader-background-dot" x="28" y="50" />
      <use href="#compile-loader-background-dot" x="39" y="50" />
      <use href="#compile-loader-background-dot" x="50" y="50" />
      <use className="compile-loader-dot d00" href="#compile-loader-lit-dot" x="6" y="6" />
      <use className="compile-loader-dot d01" href="#compile-loader-lit-dot" x="17" y="6" />
      <use className="compile-loader-dot d02" href="#compile-loader-lit-dot" x="28" y="6" />
      <use className="compile-loader-dot d03" href="#compile-loader-lit-dot" x="39" y="6" />
      <use className="compile-loader-dot d04" href="#compile-loader-lit-dot" x="50" y="6" />
      <use className="compile-loader-dot d10" href="#compile-loader-lit-dot" x="6" y="17" />
      <use className="compile-loader-dot d11" href="#compile-loader-lit-dot" x="17" y="17" />
      <use className="compile-loader-dot d12" href="#compile-loader-lit-dot" x="28" y="17" />
      <use className="compile-loader-dot d13" href="#compile-loader-lit-dot" x="39" y="17" />
      <use className="compile-loader-dot d14" href="#compile-loader-lit-dot" x="50" y="17" />
      <use className="compile-loader-dot d20" href="#compile-loader-lit-dot" x="6" y="28" />
      <use className="compile-loader-dot d21" href="#compile-loader-lit-dot" x="17" y="28" />
      <use className="compile-loader-dot d22" href="#compile-loader-lit-dot" x="28" y="28" />
      <use className="compile-loader-dot d23" href="#compile-loader-lit-dot" x="39" y="28" />
      <use className="compile-loader-dot d24" href="#compile-loader-lit-dot" x="50" y="28" />
      <use className="compile-loader-dot d30" href="#compile-loader-lit-dot" x="6" y="39" />
      <use className="compile-loader-dot d31" href="#compile-loader-lit-dot" x="17" y="39" />
      <use className="compile-loader-dot d32" href="#compile-loader-lit-dot" x="28" y="39" />
      <use className="compile-loader-dot d33" href="#compile-loader-lit-dot" x="39" y="39" />
      <use className="compile-loader-dot d34" href="#compile-loader-lit-dot" x="50" y="39" />
      <use className="compile-loader-dot d40" href="#compile-loader-lit-dot" x="6" y="50" />
      <use className="compile-loader-dot d41" href="#compile-loader-lit-dot" x="17" y="50" />
      <use className="compile-loader-dot d42" href="#compile-loader-lit-dot" x="28" y="50" />
      <use className="compile-loader-dot d43" href="#compile-loader-lit-dot" x="39" y="50" />
      <use className="compile-loader-dot d44" href="#compile-loader-lit-dot" x="50" y="50" />
    </svg>
  )
}
