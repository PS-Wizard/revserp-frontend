// Deterministic client-side panel map. Keyed on the `tool_call` SSE frame's
// `name`, applied the moment a tool_call frame arrives. The model has ZERO say:
// there is no panel SSE event and no set_panel tool. This is intentionally a
// plain constant so the mapping is auditable and impossible to override from the
// server. See ai-contract.md "Deterministic panel-state map".

export type PanelState = "collapsed" | "mini" | "maximized"

// Tools not listed here ("list_projects") intentionally leave the panel state
// unchanged.
const TOOL_PANEL_MAP: Record<string, PanelState> = {
  // maximize
  list_issues: "maximized",
  get_recommended_fix: "maximized",
  get_page_content: "maximized",
  get_score_summary: "maximized",
  list_pages: "maximized",
  get_business_profile: "maximized",
  update_business_profile: "maximized",
  get_search_console_data: "maximized",
  render_chart: "maximized",
  // minimize
  export_crawl: "mini",
  export_audit: "mini",
  // Mini, not collapsed like the other view-changing tools: a competitor
  // analysis both opens the compare view and explains it, so the panel has to
  // stay readable next to the view it just opened.
  compare_projects: "mini",
  // collapse
  start_crawl: "collapsed",
  configure_auto_crawl: "collapsed",
  navigate: "collapsed",
  switch_project: "collapsed",
}

export function panelStateForTool(toolName: string): PanelState | undefined {
  return TOOL_PANEL_MAP[toolName]
}
