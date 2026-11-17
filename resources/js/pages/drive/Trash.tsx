/** Trash page (UI_SPEC §9 state "Trash is empty"; task 4.2). Lists the
 *  top-level trashed folders and every trashed image with Restore and Delete
 *  forever, plus Empty trash. Every action is a bulk Inertia post/delete to the
 *  same endpoints the drive page uses, so the routes stay the one source of
 *  truth; the page reloads through the redirect with a flash. */
import { Head, router } from '@inertiajs/react'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'
import ConfirmDialog from '../../components/drive/ConfirmDialog.js'

interface Props {
  folders: { id: number, name: string }[]
  images: { id: number, name: string, starred: boolean }[]
}

/** One batch, shared by every action so the endpoints never disagree. */
type Batch = { imageIds: number[], folderIds: number[] }

export default function DriveTrash({ folders, images }: Props) {
  const [confirm, setConfirm] = useState<{ kind: 'empty' | 'delete', batch?: Batch, label: string } | null>(null)
  const empty = folders.length === 0 && images.length === 0

  const post = (url: string, batch: Batch) => {
    router.post(url, batch, { preserveScroll: true })
  }

  const restore = (batch: Batch) => post('/items/restore', batch)
  const deleteForever = (batch: Batch) => post('/items/delete', batch)
  const emptyTrash = () => router.delete('/trash', { preserveScroll: true })

  return (
    <Layout>
      <Head title="Trash" />
      <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-xl font-bold text-g-heading">
            <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
            Trash
          </h1>
          {!empty && (
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'empty', label: 'Empty the Trash?' })}
              className="rounded-g-ctl border border-g-danger/40 px-3 py-1.5 text-sm font-bold text-g-danger transition hover:bg-g-danger-tint"
            >
              Empty trash
            </button>
          )}
        </div>

        {empty ? (
          <EmptyState icon={Trash2} title="Trash is empty" hint="Items you move to trash stay here before they are deleted." />
        ) : (
          <ul className="flex flex-col gap-2">
            {folders.map((folder) => {
              const batch = { imageIds: [], folderIds: [folder.id] }
              return (
                <li
                  key={`f${folder.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text"
                >
                  <span className="truncate">{folder.name}</span>
                  <ItemActions
                    onRestore={() => restore(batch)}
                    onDelete={() => setConfirm({ kind: 'delete', batch, label: `Delete "${folder.name}" forever?` })}
                  />
                </li>
              )
            })}
            {images.map((image) => {
              const batch = { imageIds: [image.id], folderIds: [] }
              return (
                <li
                  key={`i${image.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text"
                >
                  <span className="truncate">{image.name}</span>
                  <ItemActions
                    onRestore={() => restore(batch)}
                    onDelete={() => setConfirm({ kind: 'delete', batch, label: `Delete "${image.name}" forever?` })}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.label}
          message={
            confirm.kind === 'empty'
              ? 'Every item in the Trash and all of its versions will be deleted permanently. This cannot be undone.'
              : 'This removes every version of the item and its files from storage. This cannot be undone.'
          }
          confirmLabel={confirm.kind === 'empty' ? 'Empty trash' : 'Delete forever'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'empty') emptyTrash()
            else if (confirm.batch) deleteForever(confirm.batch)
            setConfirm(null)
          }}
        />
      )}
    </Layout>
  )
}

function ItemActions({ onRestore, onDelete }: { onRestore: () => void, onDelete: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onRestore}
        className="rounded-g-ctl px-2.5 py-1 text-xs font-bold text-g-text transition hover:bg-g-raised hover:text-g-heading"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-g-ctl px-2.5 py-1 text-xs font-bold text-g-danger transition hover:bg-g-danger-tint"
      >
        Delete forever
      </button>
    </div>
  )
}
