"use client"

import { useCallback, useEffect, useState } from "react"
import { FileTextIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { clientApiFetch } from "~/lib/api"
import type { AdminSkillResponse, AdminSkillsResponse } from "~/lib/api.types"

export function SkillsTab() {
  const [skills, setSkills] = useState<AdminSkillResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAdminSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await clientApiFetch<AdminSkillsResponse>("/admin/skills")
      setSkills(data.skills ?? [])
    } catch {
      setError("Failed to load skills")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAdminSkills()
  }, [loadAdminSkills])

  if (loading && skills === null) {
    return (
      <div
        role="status"
        aria-label="Loading skills"
        className="flex flex-col gap-3"
      >
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error && skills === null) {
    return (
      <div role="alert" className="flex items-center gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={loadAdminSkills}>
          Retry
        </Button>
      </div>
    )
  }

  if (skills !== null && skills.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>No skills deployed</EmptyTitle>
          <EmptyDescription>
            Skills are managed in revserp-backend/skills/ through Git and
            deployed with the backend. Nothing is available to Revbot yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section aria-label="Revbot skills" className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">
          Revbot skills{" "}
          <Badge
            variant="secondary"
            aria-label={`${skills?.length ?? 0} skills`}
          >
            {skills?.length ?? 0}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Skills are managed in revserp-backend/skills/ through Git and deployed
          with the backend. Revbot loads skill instructions and references only
          when the model requests them.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table aria-label="Deployed Revbot skills">
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead>Directory</TableHead>
              <TableHead>When to use</TableHead>
              <TableHead>Files</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(skills ?? []).map((skill) => (
              <TableRow key={skill.id}>
                <TableCell className="font-medium">{skill.name}</TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">
                    {skill.id}
                  </code>
                </TableCell>
                <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                  {skill.description}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Badge
                    variant="outline"
                    aria-label={`${skill.files.length} files in ${skill.name}`}
                  >
                    {skill.files.length}{" "}
                    {skill.files.length === 1 ? "file" : "files"}
                  </Badge>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {skill.files.map((file) => (
                      <li key={file}>
                        <code className="text-xs text-muted-foreground">
                          {file}
                        </code>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
