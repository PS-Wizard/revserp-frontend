import type { ProjectResponse } from "~/lib/api.types"

const projectNameCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
})

export function sortProjectsByName(
  projects: readonly ProjectResponse[]
): ProjectResponse[] {
  return [...projects].sort(
    (left, right) =>
      projectNameCollator.compare(left.name, right.name) ||
      left.id.localeCompare(right.id, "en")
  )
}
