/** The right-click / long-press menu (UI_SPEC §4/§7). Fixed at the gesture
 *  point, clamped to the viewport, closed by a scrim press, outside press or
 *  Esc. The ⋮ button opens the same menu, so the two never drift. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ImageMenuItem } from '../../lib/imageMenu.js'

export interface ContextMenuProps {
  label: string
  items: ImageMenuItem[]
  x: number
  y: number
  onClose: () => void
}

export default function ContextMenu({ label, items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [position, setPosition] = useState<{ x: number, y: number } | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Clamp after the first layout, then focus the first item. The opener is
  // restored on unmount (UI_SPEC §10).
  useLayoutEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    const menu = menuRef.current
    if (menu) {
      const rect = menu.getBoundingClientRect()
      setPosition({
        x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      })
      menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
  }, [x, y])

  useEffect(() => () => openerRef.current?.focus(), [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onCloseRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCloseRef.current()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const focusable = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (focusable.length === 0) return
    event.preventDefault()
    const current = focusable.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (event.key === 'End') next = focusable.length - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % focusable.length
    else next = current < 0 ? focusable.length - 1 : (current - 1 + focusable.length) % focusable.length
    focusable[next]?.focus()
  }

  const visible = items.filter((item) => !item.hidden)

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        aria-hidden
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onCloseRef.current()
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={position ? { left: position.x, top: position.y } : { left: 0, top: 0 }}
        className={`fixed z-30 w-56 rounded-g-card border border-g-line bg-g-panel p-1 shadow-g-float outline-none ${
          position ? '' : 'opacity-0'
        }`}
      >
        {visible.map((item) => {
          const icon = <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          const content = (
            <>
              {icon}
              {item.label}
            </>
          )
          const className = `flex w-full items-center gap-2 rounded-g-ctl px-3 py-2 text-sm transition hover:bg-g-raised outline-none focus-visible:ring-2 focus-visible:ring-g-accent ${
            item.danger ? 'text-g-danger hover:text-g-danger' : 'text-g-text hover:text-g-heading'
          }`
          if (item.href) {
            return (
              <a
                key={item.key}
                role="menuitem"
                href={item.href}
                download
                onClick={() => onCloseRef.current()}
                className={className}
              >
                {content}
              </a>
            )
          }
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect?.()
                onCloseRef.current()
              }}
              className={className}
            >
              {content}
            </button>
          )
        })}
      </div>
    </>
  )
}
