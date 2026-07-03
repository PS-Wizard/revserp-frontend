import { useCallback, useEffect, useRef } from "react"

/**
 * Drag-to-paint row selection.
 *
 * A plain click never toggles a row — only the checkbox does (so double-click to
 * drill in doesn't accidentally toggle). Pressing on a row arms an anchor; the
 * drag only begins once the pointer crosses into another row, at which point the
 * anchor's current state decides the paint mode (select vs deselect) and every
 * row dragged over is set to that mode. A mutable working set drives updates so
 * rapid pointer-enter events never read a stale committed value.
 */
export function useDragSelection(
  checkedKeys: string[],
  onChange: (keys: string[]) => void
) {
  const checkedRef = useRef(checkedKeys)
  checkedRef.current = checkedKeys

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const anchorRef = useRef<{ key: string; wasChecked: boolean } | null>(null)
  const workingRef = useRef<Set<string> | null>(null)
  const selectModeRef = useRef(false)

  const apply = useCallback((key: string) => {
    const working = workingRef.current
    if (!working) return
    if (selectModeRef.current) {
      working.add(key)
    } else {
      working.delete(key)
    }
    onChangeRef.current([...working])
  }, [])

  useEffect(() => {
    const endDrag = () => {
      anchorRef.current = null
      workingRef.current = null
    }
    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)
    return () => {
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  const getRowProps = useCallback(
    (key: string) => ({
      onPointerDown: (event: React.PointerEvent) => {
        if (event.button !== 0) return
        anchorRef.current = { key, wasChecked: checkedRef.current.includes(key) }
        workingRef.current = null
      },
      onPointerEnter: (event: React.PointerEvent) => {
        const anchor = anchorRef.current
        if (!anchor) return
        // Primary button released outside a row — abandon the drag.
        if ((event.buttons & 1) === 0) {
          anchorRef.current = null
          return
        }
        if (!workingRef.current) {
          selectModeRef.current = !anchor.wasChecked
          workingRef.current = new Set(checkedRef.current)
          apply(anchor.key)
        }
        apply(key)
      },
    }),
    [apply]
  )

  return { getRowProps }
}

export type RowSelectionProps = ReturnType<
  ReturnType<typeof useDragSelection>["getRowProps"]
>
