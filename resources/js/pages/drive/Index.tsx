import { Deferred, Head, usePage } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../../components/Layout.js'
import Breadcrumbs from '../../components/drive/Breadcrumbs.js'
import EmptyState from '../../components/drive/EmptyState.js'
import FolderCard from '../../components/drive/FolderCard.js'
import ImageCard from '../../components/drive/ImageCard.js'
import ImageListView from '../../components/drive/ImageListView.js'
import DriveSkeleton from '../../components/drive/DriveSkeleton.js'
import SortMenu from '../../components/drive/SortMenu.js'
import ViewToggle from '../../components/drive/ViewToggle.js'
import type { RenameTarget } from '../../components/drive/RenameInput.js'
import { clearRenameAttempt, takeFailedRename } from '../../components/drive/RenameInput.js'
import type { Crumb, FolderItem, ImageItem } from '../../types.js'
import { driveViewUrl, readDriveView, sortImages, type DriveView } from '../../lib/driveView.js'

// `images` is deferred (DriveController): undefined until the follow-up
// partial reload lands, which <Deferred> turns into the skeleton state.
interface Props {
  folder: FolderItem | null
  breadcrumbs: Crumb[]
  folders: FolderItem[]
  images?: ImageItem[]
}

export default function DriveIndex({ folder, breadcrumbs, folders, images }: Props) {
  const { url, props } = usePage()
  const [viewState, setViewState] = useState<DriveView>(() => readDriveView(url))
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())

  // Inline rename (task 2.2): F2 on hovered card or ⋮ menu; shared across grid/list.
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const [hovered, setHovered] = useState<RenameTarget | null>(null)
  // A failed rename comes back from the framework's redirect as the page's
  // flashed `errors.name` (Validation guide), so the input reopens with it.
  const [renameFailure, setRenameFailure] = useState<{ target: RenameTarget, attemptedName: string, message: string } | null>(null)
  const serverErrors = (props as { errors?: Record<string, string> }).errors

  useEffect(() => {
    const failed = takeFailedRename(serverErrors)
    if (!failed) {
      clearRenameAttempt()
      return
    }
    setRenaming(failed.attempt.target)
    setRenameFailure({ target: failed.attempt.target, attemptedName: failed.attempt.name, message: failed.message })
  }, [serverErrors])

  const startRename = useCallback((target: RenameTarget) => {
    setRenameFailure(null)
    setRenaming(target)
  }, [])

  const finishRename = useCallback(() => {
    setRenaming(null)
    setRenameFailure(null)
    clearRenameAttempt()
  }, [])

  const renameProps = (target: RenameTarget): { renaming: boolean, renameValue?: string, renameError: string | null } => {
    const failed = renameFailure && renameFailure.target.kind === target.kind && renameFailure.target.id === target.id
      ? renameFailure
      : null
    return {
      renaming: renaming?.kind === target.kind && renaming.id === target.id,
      renameValue: failed?.attemptedName,
      renameError: failed?.message ?? null,
    }
  }

  // F2 starts rename on hovered item.
  useEffect(() => {
    if (renaming !== null) return
    const target = hovered
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return
      // Never while typing (New-folder dialog, the rename input itself).
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement | null)?.isContentEditable) return
      event.preventDefault()
      startRename(target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [renaming, hovered, startRename])

  const hoverFolder = useCallback((id: number, h: boolean) => {
    if (h) setHovered({ kind: 'folder', id })
    else setHovered((prev) => prev && prev.kind === 'folder' && prev.id === id ? null : prev)
  }, [])
  const hoverImage = useCallback((id: number, h: boolean) => {
    if (h) setHovered({ kind: 'image', id })
    else setHovered((prev) => prev && prev.kind === 'image' && prev.id === id ? null : prev)
  }, [])

  const updateView = useCallback((patch: Partial<DriveView>) => {
    setViewState((previous) => {
      const next = { ...previous, ...patch }
      if (typeof window !== 'undefined') {
        window.history.replaceState(window.history.state, '', driveViewUrl(window.location.pathname, next))
      }
      return next
    })
  }, [])

  // Visual selection only for now: the floating bar and the keyboard rules
  // (click, Ctrl/Shift ranges, Esc) are task 2.3.
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const sorted = useMemo(() => sortImages(images ?? [], viewState), [images, viewState])

  return (
    <Layout>
      <Head title={folder ? folder.name : 'My Files'} />
      <div className="flex h-full flex-col px-4 sm:px-6">
        <div className="-mx-4 sticky top-16 z-10 flex items-center justify-between gap-3 border-b border-g-line bg-g-page px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
            <Breadcrumbs crumbs={breadcrumbs} />
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={viewState.view} onChange={(view) => updateView({ view })} />
            <SortMenu view={viewState} onChange={updateView} />
          </div>
        </div>

        <div className="flex flex-col gap-4 py-6">
          {folders.length > 0 && (
            <section aria-label="Folders">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-g-muted">Folders</h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {folders.map((child) => (
                  <FolderCard
                    key={`f${child.id}`}
                    folder={child}
                    {...renameProps({ kind: 'folder', id: child.id })}
                    onStartRename={() => startRename({ kind: 'folder', id: child.id })}
                    onRenameDone={finishRename}
                    onRenameCancel={finishRename}
                    onHoverChange={(h) => hoverFolder(child.id, h)}
                  />
                ))}
              </ul>
            </section>
          )}
          <Deferred data="images" fallback={<DriveSkeleton view={viewState.view} />}>
            {sorted.length === 0 && folders.length === 0 ? (
              <EmptyState
                icon={ImagePlus}
                title="Drop images here or press New"
                hint="Nothing is uploaded until you confirm it in the review dialog. Uploads are converted to WebP or AVIF and metadata such as GPS is removed."
              />
            ) : sorted.length > 0 && viewState.view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {sorted.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    selected={selectedIds.has(image.id)}
                    onToggleSelect={() => toggleSelect(image.id)}
                    {...renameProps({ kind: 'image', id: image.id })}
                    onStartRename={() => startRename({ kind: 'image', id: image.id })}
                    onRenameDone={finishRename}
                    onRenameCancel={finishRename}
                    onHoverChange={(h) => hoverImage(image.id, h)}
                  />
                ))}
              </ul>
            ) : sorted.length > 0 ? (
              <ImageListView
                images={sorted}
                view={viewState}
                onChange={updateView}
                renaming={renaming?.kind === 'image' ? renaming : null}
                renameValue={
                  renameFailure?.target.kind === 'image' && renameFailure.target.id === renaming?.id
                    ? renameFailure.attemptedName
                    : undefined
                }
                renameError={
                  renameFailure?.target.kind === 'image' && renameFailure.target.id === renaming?.id
                    ? renameFailure.message
                    : null
                }
                onRenameDone={finishRename}
                onRenameCancel={finishRename}
                onHoverChange={hoverImage}
              />
            ) : null}
          </Deferred>
        </div>
      </div>
    </Layout>
  )
}
