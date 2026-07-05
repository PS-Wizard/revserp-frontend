/**
 * Renders a number whose digits pop in (blurred slide-up) whenever the value
 * changes. The digit group is keyed on `value` (and optionally `replayKey`),
 * which is what drives the replay: on a key change React remounts the group,
 * so the CSS `animation … both` runs again from the start; an unchanged key
 * keeps the same key and does not re-fire. Pass `replayKey` (e.g. a crawl id)
 * to force a replay even when two different values happen to be equal.
 * See `.t-digit-*` in app.css.
 */
export function NumberPopIn({
  value,
  replayKey,
}: {
  value: number
  replayKey?: string | number
}) {
  const chars = String(value).split("")
  return (
    <span
      className="t-digit-group is-animating"
      key={`${replayKey ?? ""}:${value}`}
    >
      {chars.map((ch, i) => {
        const stagger =
          i === chars.length - 2 ? "1" : i === chars.length - 1 ? "2" : undefined
        return (
          <span className="t-digit" data-stagger={stagger} key={i}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}
