# Revserp frontend — agent context

Compact notes from `feat/ai-chat-rewrite` work. Repo: `revserp-frontend/` (React Router v7, Tailwind v4, shadcn base-vega, bun).

## Stack & commands

- **Entry shell:** `app/routes/app.tsx` → `WorkspaceShellPreview` (`app/components/workspace-shell-preview.tsx`)
- **Alias:** `~/` → `app/` (not repo root — EvilCharts initially installed under `components/` and had to move to `app/components/evilcharts/`)
- **Scripts:** `bun run dev` | `typecheck` | `build` | `start`
- **Theme:** global `.dark` on `<html>` via `app/root.tsx` (`restoreThemeScript`)

## App shell layout

```
WorkspaceShellPreview
├── Sidebar (workspace-sidebar-nav) — ml-16 main offset
├── Header row (project / crawl / run crawl)
├── Main scroll area (view content from app.tsx children)
├── AI island (DynamicIsland*) — fixed z-[100], independent of main scroll
└── Modals: ProjectPanel, RunCrawlDialog, AutoCrawlDialog, BusinessProfileDrawer
```

- **Sidebar** uses `bg-sidebar` (`#080808`), not raw black.
- **Main content** sits in a scroll region; island is portaled/fixed and does **not** scroll with page.
- **Legacy command dock removed** from shell (`command-dock.tsx`, `nav-island.tsx`, `global-command-menu.tsx` deleted). Only `command-dock/project-panel.tsx` + `constants.ts` remain for the project picker modal.

## Views & routing

- **View state** lives in `app/routes/app.tsx` (`DashboardView`: `revserp-audit`, `search-console`, `compare`, `site-graph`, `revbot`, …).
- **Hash navigation:** `location.hash` drives tab switches (`#seo-tab`, `#aeo-tab`, …). Revbot citation links call `handleRevbotInternalLink` in shell — updates hash via `navigate` **without** docking the island.
- **Pillar tabs:** SEO / AEO / PageSpeed → `PillarAuditView` (`app/components/pillar-audit-view.tsx`) with `pillarId` from `app.tsx` config.
- **Full-page Revbot route** still exists (`revbot-view.tsx` lazy import) but **canonical UX is the island** in `WorkspaceShellPreview`.

## AI island (Revbot)

| File | Role |
|------|------|
| `dynamic-island-poc.tsx` | Island chrome — docked pill, minimized/maximized panel, conversation dropdown. Legacy filename; production code. |
| `workspace-shell-preview.tsx` | `islandState`, keyboard shortcuts, `useRevbot` instance (`islandRevbot`), morph layout |
| `revbot/use-revbot.ts` | Chat state, streaming, conversations, tool calls |
| `revbot/revbot-view.tsx` | Message list, history sidebar, composer host; `variant="dark"` in island |
| `revbot/revbot-composer.tsx` | Prompt input, autocomplete, effort picker; exports `focusRevbotPrompt()` + `REVBOT_PROMPT_INPUT_ID` |
| `revbot/revbot-turn-activity.tsx` | Tool-call accordion per turn |
| `revbot/revbot-markdown.tsx` | Markdown rendering (typeset.css) |

### Island states

`docked` → `minimized` → `maximized` (Escape steps down).

- **Docked:** bottom-right pill (`fixed bottom-6 right-6`). Streaming = `Loader2` spinner (no BorderBeam / ThinkingOrb / CrawlRunningGlimm).
- **Minimized:** `27rem` panel; history hidden (`hideHistory={islandState !== "maximized"}`).
- **Maximized:** `inset-3` overlay; history sidebar visible.

### Keyboard

- **⌘/Ctrl+K:** docked → open + focus prompt; minimized → maximize + focus; maximized → focus only.
- **Escape:** maximized → minimized → docked.
- Focus targets `[role="dialog"][aria-label="Revbot"]` then `#revbot-prompt` (double `requestAnimationFrame` after state change).

### Tool-call UI (`revbot-turn-activity.tsx`)

- Rows **collapsed by default** (running + success); failed/partial auto-expand.
- Param meta (`limit: 10 · compare: true`) hidden until expanded; shown in header row when open.
- Turn header: "Thought for X.Xs" accordion with persisted timestamps in `use-revbot.ts`.

### Island persistence

- Citation / internal links no longer call `dockIsland()` — minimized chat stays open on navigation.
- Tab switches never docked the island; citations were the main culprit.

## Dark theme & surfaces

Elevation ladder in `app/app.css` `.dark`:

| Token | Hex | Use |
|-------|-----|-----|
| `--background` | `#050505` | Page canvas |
| `--sidebar` / `--secondary` | `#080808` | Sidebar |
| `--card` / `--popover` | `#101214` | Cards (still used by token consumers) |
| `--accent` | `#1e2023` | Hover pill fill |

**CSS surface classes** (gradients + inset top highlight):

- `.surface-card` — dashboard cards (`ui/card.tsx`)
- `.surface-dialog` — **canonical overlay tone** (dialogs, drawers, dropdowns, popovers, select, command, island, AI chat, project panel)
- `.surface-popover` — same gradient as dialog (legacy alias)
- `.app-noise` — fixed SVG fractal noise overlay in `root.tsx` (2.5% opacity in dark)

**Rule of thumb:** floating UI → `surface-dialog border border-border`. Cards on page → `surface-card`.

### Hover pill pattern

`app/components/ui/hover-pill.tsx`:

- `useHoverPill()` + `<HoverPill />` sliding background
- `DROPDOWN_PILL_ITEM_CLASS` — items use `data-selected:!bg-transparent` so Command/cmdk selected state doesn't eat the pill
- `DropdownPillSurface` — wraps `DropdownMenuContent` with isolated pill state

Used in: sidebar nav, issue tables, island conversation dropdown, project panel (projects + crawl rows).

## Project picker

- Opened via `isProjectPanelOpen` in shell; backdrop `bg-black/50 backdrop-blur-sm` + `AnimatePresence`.
- **`command-dock/project-panel.tsx`** — Command list + crawl list; `surface-dialog` shell.
- Crawl rows use `CrawlContextRow` with `buttonClassName` to suppress native hover bg so pill shows through.

## Crawl dialogs

- `app-navbar/run-crawl-dialog.tsx` — main run crawl modal
- `app-navbar/auto-crawl-dialog.tsx` — auto-crawl settings
- `app-navbar/run-crawl-popover.tsx` — popover variant (also `surface-dialog`)
- All use `DialogContent` → `surface-dialog` via `ui/dialog.tsx`

## Pillar audit & charts

### Layout (`pillar-audit-view.tsx`)

1. **`BucketScoreHistoryChart`** — full-width, no card wrapper; legends below chart; padded divider above bucket cards grid
2. Radial score + `BucketScoreCards` grid
3. Issue treemap + explorer

### Bucket history chart (`bucket-score-history-chart.tsx`)

- **EvilCharts** `EChartsAreaChart` at `app/components/evilcharts/` (installed via `bunx shadcn add @evilcharts/echarts-area-chart`; registry in `components.json`)
- **Critical:** chart container needs explicit `height` (~300px) — `flex-1` alone = 0px ECharts canvas
- `variant="lines"` for checkered/stripe fills; `Dot variant="border"` + `ActiveDot variant="default"`
- Legends: bottom row, centered, click-to-focus series (dims others to 40%); no selected bg state
- Grid `left/right: 24` insets x-axis labels from screen edges
- Colors from `lib/pillar-colors.ts` → `getPillarChartColor(pillarId, index)`

### Other charts

- **Overview tab:** `summary-score-history-chart.tsx` — still **ApexCharts** (`use-apex-chart` hook)
- **GSC:** `gsc-overview/performance-chart.tsx`, date range in `gsc-date-range-picker.tsx` (calendar popover)
- Shared utils: `score-history-chart-utils.ts`

### Pillar colors

- SEO = blue family, PageSpeed = teal/green, **AEO = muted brown-orange** (h 6–34, s ~42–50) — bright amber was tried and reverted
- Dark `--chart-4`: `#fbbf24`

## Crawl overlay

- `crawl-running-glimm.tsx` — azure Glimm sweep, 3s interval; shown on main content when viewing a **running** crawl (`app/routes/app.tsx`). Not used on island docked state anymore.

## Feature flags

- `features.ai_chat` gates island + shortcuts
- `features.ai_allowed_reasoning_efforts` passed to `useRevbot`
- Admin toggles in `admin/features-tab.tsx`

## Dependencies worth knowing

| Package | Where |
|---------|-------|
| `echarts` + EvilCharts | Pillar bucket history charts |
| `apexcharts` | Summary/overview charts, vite prebundle |
| `border-beam`, `thinking-orbs` | Still in package.json; **removed from island docked UI** |
| `glimm` | Crawl-running overlay only |
| `motion/react` | Island morph, project panel backdrop |
| `cmdk` | Project panel Command list |

## Common gotchas

1. **ECharts height** — parent must have explicit height.
2. **shadcn EvilCharts path** — installs to repo `components/` by default; move under `app/components/` for `~/` alias.
3. **`chartOptions` merge** in EvilCharts is shallow — don't pass partial `xAxis` or it wipes the built config.
4. **Hover pill vs `data-selected`** — Command items need transparent selected bg.
5. **Island vs page theme** — island uses `variant="dark"` + `surface-dialog`; don't assume `bg-card` tokens match overlay tone.
6. **Composer scroll fade** — dark mode uses `from-[#0b0b0c]` to match dialog gradient bottom.
7. **Git repo** is `revserp-frontend/` itself (not monorepo root). Branch: `feat/ai-chat-rewrite`.

## Files touched most in this arc

`app.css`, `workspace-shell-preview.tsx`, `dynamic-island-poc.tsx`, `revbot/*`, `bucket-score-history-chart.tsx`, `pillar-audit-view.tsx`, `command-dock/project-panel.tsx`, `ui/{dialog,drawer,dropdown-menu,popover,select,command,hover-pill,card}.tsx`, `app-navbar/*-dialog.tsx`, `root.tsx`, `vite.config.ts`, `components.json`, `package.json`
