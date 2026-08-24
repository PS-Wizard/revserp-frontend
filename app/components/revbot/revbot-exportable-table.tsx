"use client"

import { useCallback, useRef } from "react"
import type { ComponentPropsWithoutRef } from "react"

import {
  ArtifactExportContextMenu,
  ArtifactExportMenu,
} from "./revbot-artifact-menu"
import { tableToCsv } from "./revbot-artifact-export"

type RevbotExportableTableProps = ComponentPropsWithoutRef<"table"> & {
  node?: unknown
}

export function RevbotExportableTable({
  node: _node,
  children,
  ...props
}: RevbotExportableTableProps) {
  const tableRef = useRef<HTMLTableElement>(null)
  const getCsv = useCallback(() => {
    if (!tableRef.current) throw new Error("Table not available")
    return tableToCsv(tableRef.current)
  }, [])

  return (
    <ArtifactExportContextMenu
      filename="revbot-table"
      getCsv={getCsv}
      imageRef={tableRef}
    >
      <div className="group/revbot-artifact relative">
        <table ref={tableRef} {...props}>
          {children}
        </table>
        <ArtifactExportMenu
          className="top-1 right-1"
          filename="revbot-table"
          getCsv={getCsv}
          imageRef={tableRef}
        />
      </div>
    </ArtifactExportContextMenu>
  )
}
