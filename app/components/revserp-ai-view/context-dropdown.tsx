"use client"

import { CheckIcon, ChevronDownIcon, LayersIcon } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
} from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"

export function ContextDropdown({
  pillars,
  selectedPillar,
  selectedPillarId,
  selectedPillarBuckets,
  selectedIssueTypeIds,
  issueTypeLabel,
  onSelectPillar,
  onToggleIssueType,
  onSelectAllIssueTypes,
}: {
  pillars: ScoreBreakdownPillarResponse[]
  selectedPillar: ScoreBreakdownPillarResponse | null
  selectedPillarId: string
  selectedPillarBuckets: ScoreBreakdownBucketResponse[]
  selectedIssueTypeIds: string[]
  issueTypeLabel: string
  onSelectPillar: (pillar: ScoreBreakdownPillarResponse) => void
  onToggleIssueType: (issueType: ScoreBreakdownIssueTypeResponse) => void
  onSelectAllIssueTypes: () => void
}) {
  const triggerLabel = selectedPillar
    ? selectedPillarBuckets.length === 1
      ? `${selectedPillar.label} \u00b7 ${formatBucketLabel(selectedPillarBuckets[0].id, selectedPillarBuckets[0].label)} \u00b7 ${issueTypeLabel}`
      : `${selectedPillar.label} \u00b7 ${issueTypeLabel}`
    : "Context"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-7 justify-start gap-1.5 px-2 text-xs font-normal text-muted-foreground/80 hover:text-foreground"
          />
        }
      >
        <LayersIcon className="size-3.5 shrink-0" />
        <span className="max-w-44 truncate">{triggerLabel}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-2xl p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Pillar</DropdownMenuLabel>
          {pillars.map((pillar) => (
            <DropdownMenuItem
              key={pillar.id}
              onClick={() => onSelectPillar(pillar)}
            >
              <span className="truncate">{pillar.label}</span>
              {selectedPillarId === pillar.id ? (
                <CheckIcon className="ml-auto size-4 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        {selectedPillar && selectedPillarBuckets.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Issue types</DropdownMenuLabel>
              <DropdownMenuItem onClick={onSelectAllIssueTypes}>
                All issue types
                {selectedIssueTypeIds.length === 0 ? (
                  <CheckIcon className="ml-auto size-4 shrink-0" />
                ) : null}
              </DropdownMenuItem>
              {selectedPillarBuckets.map((bucket) => (
                <DropdownMenuSub key={bucket.id}>
                  <DropdownMenuSubTrigger>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {formatBucketLabel(bucket.id, bucket.label)}
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-1 shrink-0 px-1 text-[10px] leading-none"
                    >
                      {bucket.affected_url_count}
                    </Badge>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto rounded-xl p-1.5">
                    {bucket.issues.map((issueType) => (
                      <DropdownMenuCheckboxItem
                        key={issueType.id}
                        checked={selectedIssueTypeIds.includes(issueType.id)}
                        onCheckedChange={() => onToggleIssueType(issueType)}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {issueType.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="ml-1 shrink-0 px-1 text-[10px] leading-none"
                        >
                          {issueType.affected_url_count}
                        </Badge>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
