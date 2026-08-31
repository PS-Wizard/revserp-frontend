// Splits text on http(s) URLs and renders the URLs as new-tab links.
// Commas terminate matches because duplicate-content details contain
// comma-separated URL lists.
const URL_SPLIT_PATTERN = /(https?:\/\/[^\s,]+)/g

export function Linkify({
  text,
  tone = "primary",
}: {
  text: string
  tone?: "primary" | "inherit"
}) {
  if (!text) return null
  return (
    <>
      {text.split(URL_SPLIT_PATTERN).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            className={
              tone === "inherit"
                ? "break-all text-inherit underline decoration-current/40 underline-offset-2 hover:decoration-current"
                : "break-all text-primary hover:underline"
            }
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  )
}
