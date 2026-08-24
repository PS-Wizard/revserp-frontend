"use client"

import { useRef } from "react"
import type { ComponentPropsWithoutRef } from "react"

import { ArtifactExportMenu } from "./revbot-artifact-menu"
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

  return (
    <div className="group/revbot-artifact relative">
      <table ref={tableRef} {...props}>
        {children}
      </table>
      <ArtifactExportMenu
        className="top-1 right-1"
        filename="revbot-table"
        getCsv={() => {
          if (!tableRef.current) throw new Error("Table not available")
          return tableToCsv(tableRef.current)
        }}
        imageRef={tableRef}
      />
    </div>
  )
}
