export type ReleaseAnnouncementSlide = {
  id: string
  title: string
  description: string
  image: string
  imagePosition?: string
  bullets?: readonly string[]
}

export type ReleaseAnnouncementSection = {
  title: string
  items: readonly string[]
}

export type ReleaseAnnouncement = {
  id: string
  title: string
  version?: string
  publishedAt: string
  summary: string
  coverImage: string
  slides: readonly ReleaseAnnouncementSlide[]
  sections: readonly ReleaseAnnouncementSection[]
}

export const RELEASE_ANNOUNCEMENTS: readonly ReleaseAnnouncement[] = [
  {
    id: "2026-10-october-update",
    title: "October update",
    publishedAt: "2026-10-16T00:00:00Z",
    summary: "A stronger crawl engine, a clearer audit workflow, a more focused RevBot, and a new setup flow for locations.",
    coverImage: "/announcements/october-2026/cloud-texture.jpg",
    slides: [
      {
        id: "locations",
        title: "Get each location ready to work",
        description: "A new location setup workflow coordinates initialization tasks, with independent work running in parallel.",
        image: "/announcements/october-2026/pixel-clouds.jpg",
        imagePosition: "50% 35%",
        bullets: ["Location initialization workflow", "Parallel background tasks"],
      },
      {
        id: "crawling",
        title: "More reliable crawls. More control.",
        description: "Memory and timeout fixes help large crawls finish. Saved exclusion rules and updated schedules give you more control over the next run.",
        image: "/announcements/october-2026/cloud-texture.jpg",
        imagePosition: "50% 45%",
        bullets: ["Lower memory use during crawl analysis", "Cancellation that also stops analysis", "Exclusions saved per user and project"],
      },
      {
        id: "audit-changes",
        title: "See what your last crawl changed",
        description: "Find fixed and newly detected issues by bucket and category. Score deltas make the overall change easier to spot.",
        image: "/announcements/october-2026/mountain-dither.jpg",
        imagePosition: "50% 55%",
        bullets: ["Fixed and new issue cards", "Excluded URLs marked separately", "Score deltas and crawl duration"],
      },
      {
        id: "revbot",
        title: "A more focused RevBot",
        description: "Fewer unnecessary questions and less tool-call narration. Clearer answers show the result, the evidence, and what to do next.",
        image: "/announcements/october-2026/pixel-clouds.jpg",
        imagePosition: "50% 45%",
        bullets: ["Live progress while tools work", "Next-task suggestions", "Better use of recent tool results"],
      },
      {
        id: "workspace",
        title: "A smoother everyday workspace",
        description: "Rename projects, open their websites in a new tab, and return to the project you last used. New-user onboarding and the manager role round out the update.",
        image: "/announcements/october-2026/mountain-dither.jpg",
        imagePosition: "50% 35%",
        bullets: ["Project renaming and website shortcuts", "Alphabetical project lists", "New-user onboarding and manager access"],
      },
      {
        id: "fixes",
        title: "The details got attention, too",
        description: "This release also improves issue guidance, integrations, tool history, and several parts of the daily workflow.",
        image: "/announcements/october-2026/cloud-texture.jpg",
        imagePosition: "50% 30%",
        bullets: ["Completed issue handbook and clearer descriptions", "Web fetch and tool-history fixes", "Full release notes in All updates"],
      },
    ],
    sections: [
      {
        title: "Locations and setup",
        items: [
          "Added the location initialization workflow, with independent background tasks running in parallel.",
          "Added project onboarding for new users.",
          "Prepopulated project competitor lists to reduce setup work.",
          "Added a manager role for workspace management.",
        ],
      },
      {
        title: "Crawling and performance",
        items: [
          "Fixed memory-limit failures affecting large Cloudinary crawls.",
          "Changed link-status resolution to avoid expensive bulk updates during analysis.",
          "Increased the default crawl-analysis timeout to 30 minutes.",
          "Fixed analysis continuing after a crawl was cancelled.",
          "Reduced excessive map allocation during duplicate detection.",
          "Added editable crawl exclusions, saved per user and project.",
          "Updated automatic crawl scheduling, including 30-day and 60-day intervals.",
        ],
      },
      {
        title: "Audits and issue guidance",
        items: [
          "Added fixed and newly detected issue cards by bucket and category.",
          "Marked excluded URLs separately so they are not mistaken for confirmed fixes.",
          "Added crawl-to-crawl deltas to overview scorecards.",
          "Fixed the Recommend fixes selection limit.",
          "Completed the issue handbook.",
          "Expanded issue-type descriptions with more useful guidance.",
        ],
      },
      {
        title: "RevBot",
        items: [
          "Reduced unnecessary clarifying questions during safe, read-only work.",
          "Added suggestions for useful next tasks.",
          "Replaced repetitive tool-call narration with activity progress.",
          "Improved answer structure: Result, Evidence, and Next Steps.",
          "Included tool calls in conversation history.",
          "Improved use of recent tool results to reduce repeated calls.",
          "Completed the ask_user tool for questions that need user input.",
          "Fixed web_fetch behavior for Revserp.",
          "Added RevBot guidance and skills for crawl issue detection and fixes.",
        ],
      },
      {
        title: "Projects and integrations",
        items: [
          "Added Rename project and Open website to both project context menus.",
          "Fixed restoration of the last-opened project.",
          "Sorted project lists alphabetically.",
          "Added crawl duration beside the date in the project selector.",
          "Fixed integrations resetting selection to the first project.",
          "Removed the redundant Integrations tab.",
          "Added the Marketplace entry to Claude's LLM integration section.",
        ],
      },
    ],
  },
]

/** Published release announcements, newest first; scheduled releases stay hidden. */
export function getPublishedReleaseAnnouncements(now = Date.now()): ReleaseAnnouncement[] {
  return RELEASE_ANNOUNCEMENTS
    .filter((release) => Date.parse(release.publishedAt) <= now)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
