import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBucketLabel(id: string, label: string) {
  return id === "psi_cwv" ? "Google PSI" : label
}
