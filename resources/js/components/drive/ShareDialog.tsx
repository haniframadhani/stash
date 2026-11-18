/** Share dialog (UI_SPEC §5, tasks 3.3 and 6.3): the copyable links,
 *  Markdown/HTML snippets and the AVIF warning. The app is local and dies with
 *  the machine, so only bucket-served links are offered; URLs come from the
 *  server ImageItem (`urls.*`) and the snippets are pure string work
 *  (`lib/share.ts`). Without a files domain the dialog explains what to set
 *  instead of handing out links that break.
 */
import { useEffect, useRef, useState } from 'react'
import { Copy, X } from 'lucide-react'
import type { ImageItem } from '../../types.js'
import { isLocalhost, shareLinks, snippetFor } from '../../lib/share.js'
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
  const links = shareLinks(image)

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
            <p className="text-xs text-g-muted">
              {links.length > 0
                ? 'Anyone with the link can view. No login required.'
                : 'Share links come from the bucket, not this app.'}
            </p>
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
          {links.map((link) => (
            <LinkRow
              key={link.key}
              label={link.label}
              hint={link.hint}
              value={link.url}
              onCopy={() => void copy(link.url)}
            />
          ))}
        </div>

        {links.length === 0 && (
          <p className="mt-3 rounded-g-ctl border border-g-line bg-g-page p-3 text-xs text-g-text">
            Sharing is off. Set <code className="font-bold">PUBLIC_FILES_BASE_URL</code> to the bucket&rsquo;s public
            domain so links open while this app is closed; previews stay private to this machine.
          </p>
        )}

        {snippet !== null && (
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
        )}

        {image.format === 'avif' && (
          <p className="mt-3 text-xs text-g-muted">⚠ AVIF may not display in some chat apps and older viewers.</p>
        )}
        {isLocalhost(links.map((link) => link.url)) && (
          <p className="mt-1 text-xs text-g-muted">This files domain is local. Use the bucket&rsquo;s public domain to share.</p>
        )}
      </div>
    </div>
  )
}
