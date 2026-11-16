/** Touch long-press (500 ms) for the context menu (UI_SPEC §7). A drag, a
 *  scroll, a pointer-up or a press that starts on a button cancels it. */
import { useCallback, useEffect, useRef } from 'react'

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: (event: React.PointerEvent) => void
  onPointerCancel: (event: React.PointerEvent) => void
}

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

export function useLongPress(onTrigger: (x: number, y: number) => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number, y: number } | null>(null)
  const onTriggerRef = useRef(onTrigger)
  useEffect(() => {
    onTriggerRef.current = onTrigger
  }, [onTrigger])

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  return {
    onPointerDown: (event) => {
      if (event.pointerType !== 'touch') return
      if ((event.target as HTMLElement).closest('button, input, a, select, textarea')) return
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        const point = origin.current
        cancel()
        if (point) onTriggerRef.current(point.x, point.y)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event) => {
      const point = origin.current
      if (!point) return
      if (Math.hypot(event.clientX - point.x, event.clientY - point.y) > MOVE_TOLERANCE_PX) cancel()
    },
    onPointerUp: () => cancel(),
    onPointerCancel: () => cancel(),
  }
}
