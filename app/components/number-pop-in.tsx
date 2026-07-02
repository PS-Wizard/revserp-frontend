/**
 * Renders a number whose digits pop in (blurred slide-up) whenever the value
 * changes. The `key={value}` on the digit group is what drives the replay:
 * on a value change React remounts the group, so the CSS `animation … both`
 * runs again from the start; an unchanged value keeps the same key and does
 * not re-fire. See `.t-digit-*` in app.css.
 */
export function NumberPopIn({ value }: { value: number }) {
  const chars = String(value).split("")
  return (
    <span className="t-digit-group is-animating" key={value}>
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
