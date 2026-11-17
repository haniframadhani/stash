/** Share dialog (UI_SPEC §5, task 3.3 MVP): the latest link, the pinned version
 *  link, Markdown/HTML snippets, the AVIF warning and the localhost hint. Every
 *  URL comes from the server ImageItem (`urls.*`) so UrlBuilder stays the one
 *  place that shapes them; the snippets are pure string work (`lib/share.ts`).
 *
 *  Not in this release: the share-page row (task 3.4) and multi-select copy
 *  plus the selection-bar 🔗 (R1.2). */
import { useEffect, useRef, useState } from 'react'
import { Copy, X } from 'lucide-react'
import type { ImageItem } from '../../types.js'
import { isLocalhost, snippetFor } from '../../lib/share.js'
import { showToast } from '../../lib/toastStore.js'

export interface ShareDialogProps {
  image: ImageItem
  onClose: () => void
}

function LinkRow({ label, hint, value, onCopy }: { label: string, hint: string, value: string, onCopy: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-g-heading">{label}</p>
        <p className="truncate text-xs text-g-text" title={value}>
          {value}
        </p>
        <p className="text-xs text-g-muted">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()} link`}
        className="flex shrink-0 items-center gap-1 rounded-g-ctl border border-g-line px-2 py-1 text-xs font-bold text-g-text transition hover:bg-g-raised hover:text-g-heading"
      >
        <Copy className="h-3 w-3" aria-hidden />
        Copy
      </button>
    </div>
  )
}

export default function ShareDialog({ image, onClose }: ShareDialogProps) {
  const [tab, setTab] = useState<'markdown' | 'html'>('markdown')
  const dialogRef = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const snippet = snippetFor(image, tab)

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener.current?.focus()
    }
  }, [onClose])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('success', 'Link copied')
    } catch {
      showToast('error', 'Could not copy to the clipboard.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${image.name}`}
      className="fixed inset-0 z-60 flex items-center justify-center bg-g-ink/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="w-full max-w-lg rounded-g-card border border-g-line bg-g-panel p-4 shadow-g-float">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-g-heading">Share &ldquo;{image.name}&rdquo;</h2>
            <p className="text-xs text-g-muted">Anyone with the link can view. No login required.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="rounded-g-ctl p-1 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <LinkRow
            label="Always latest"
            hint="Updates when you replace the image."
            value={image.urls.latest}
            onCopy={() => void copy(image.urls.latest)}
          />
          <LinkRow
            label="This version"
            hint="Permanent. Never changes."
            value={image.urls.permanent}
            onCopy={() => void copy(image.urls.permanent)}
          />
          {/* The share-page row arrives with task 3.4. */}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-g-muted">Embed</span>
            <div role="tablist" aria-label="Embed format" className="flex rounded-g-ctl border border-g-line p-0.5">
              {(['markdown', 'html'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`rounded-g-ctl px-2 py-0.5 text-xs font-bold transition ${
                    tab === key ? 'bg-g-accent-tint text-g-accent-text' : 'text-g-text-2 hover:text-g-heading'
                  }`}
                >
                  {key === 'markdown' ? 'Markdown' : 'HTML'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <code className="min-w-0 flex-1 truncate rounded-g-ctl border border-g-line bg-g-page px-2 py-1 text-xs text-g-text" title={snippet}>
              {snippet}
            </code>
            <button
              type="button"
              onClick={() => void copy(snippet)}
              aria-label="Copy embed snippet"
              className="flex shrink-0 items-center gap-1 rounded-g-ctl border border-g-line px-2 py-1 text-xs font-bold text-g-text transition hover:bg-g-raised hover:text-g-heading"
            >
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </button>
          </div>
        </div>

        {image.format === 'avif' && (
          <p className="mt-3 text-xs text-g-muted">⚠ AVIF may not display in some chat apps and older viewers.</p>
        )}
        {isLocalhost([image.urls.latest, image.urls.permanent, image.urls.page]) && (
          <p className="mt-1 text-xs text-g-muted">Only reachable on this machine. Set PUBLIC_BASE_URL to share with others.</p>
        )}
      </div>
    </div>
  )
}
