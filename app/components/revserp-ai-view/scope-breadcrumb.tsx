import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
} from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"

export function ScopeBreadcrumb({
  pillars,
  selectedPillar,
  selectedPillarId,
  selectedPillarBuckets,
  selectedBucketIds,
  selectedIssueTypeIds,
  availableIssueTypes,
  bucketLabel,
  issueTypeLabel,
  onSelectPillar,
  onToggleBucket,
  onToggleIssueType,
  onSelectAllIssueTypes,
}: {
  pillars: ScoreBreakdownPillarResponse[]
  selectedPillar: ScoreBreakdownPillarResponse | null
  selectedPillarId: string
  selectedPillarBuckets: ScoreBreakdownBucketResponse[]
  selectedBucketIds: string[]
  selectedIssueTypeIds: string[]
  availableIssueTypes: ScoreBreakdownIssueTypeResponse[]
  bucketLabel: string
  issueTypeLabel: string
  onSelectPillar: (pillar: ScoreBreakdownPillarResponse) => void
  onToggleBucket: (bucket: ScoreBreakdownBucketResponse) => void
  onToggleIssueType: (issueType: ScoreBreakdownIssueTypeResponse) => void
  onSelectAllIssueTypes: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-1.5 py-1 text-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-36 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">
                  {selectedPillar?.label ?? "Pillar"}
                </span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Pillar</DropdownMenuLabel>
                  {pillars.map((pillar) => (
                    <DropdownMenuItem
                      key={pillar.id}
                      onClick={() => onSelectPillar(pillar)}
                    >
                      <span className="truncate">{pillar.label}</span>
                      {selectedPillarId === pillar.id ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-44 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">{bucketLabel}</span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-96 w-72 overflow-y-auto rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Buckets</DropdownMenuLabel>
                  {selectedPillarBuckets.map((bucket) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedBucketIds.includes(bucket.id)}
                      key={bucket.id}
                      onCheckedChange={() => onToggleBucket(bucket)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {formatBucketLabel(bucket.id, bucket.label)}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 text-[10px]"
                      >
                        {bucket.affected_url_count}
                      </Badge>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-52 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">{issueTypeLabel}</span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-96 w-80 overflow-y-auto rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Issue types</DropdownMenuLabel>
                  <DropdownMenuItem onClick={onSelectAllIssueTypes}>
                    All issue types
                    {selectedIssueTypeIds.length === 0 ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : null}
                  </DropdownMenuItem>
                  {availableIssueTypes.map((issueType) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedIssueTypeIds.includes(issueType.id)}
                      key={issueType.id}
                      onCheckedChange={() => onToggleIssueType(issueType)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {issueType.label}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 text-[10px]"
                      >
                        {issueType.affected_url_count}
                      </Badge>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
