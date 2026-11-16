import { Deferred, Head, usePage } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { router as inertiaRouter } from '@inertiajs/react'
import Layout from '../../components/Layout.js'
import Breadcrumbs from '../../components/drive/Breadcrumbs.js'
import EmptyState from '../../components/drive/EmptyState.js'
import FolderCard from '../../components/drive/FolderCard.js'
import ImageCard, { type SelectModifiers } from '../../components/drive/ImageCard.js'
import ImageListView from '../../components/drive/ImageListView.js'
import DriveSkeleton from '../../components/drive/DriveSkeleton.js'
import SortMenu from '../../components/drive/SortMenu.js'
import ViewToggle from '../../components/drive/ViewToggle.js'
import SelectionBar from '../../components/drive/SelectionBar.js'
import MoveToPicker from '../../components/drive/MoveToPicker.js'
import type { RenameTarget } from '../../components/drive/RenameInput.js'
import { clearRenameAttempt, takeFailedRename } from '../../components/drive/RenameInput.js'
import type { Crumb, FolderItem, ImageItem } from '../../types.js'
import { driveViewUrl, readDriveView, sortImages, type DriveView } from '../../lib/driveView.js'
import {
  EMPTY_SELECTION,
  applySelection,
  clearSelection,
  selectAll,
  selectionMode,
  toggleSelection,
  type SelectionState,
} from '../../lib/selection.js'
import { MOVE_TO_ROOT_EVENT, dragPayload, startDrag, type ItemDragPayload } from '../../lib/itemDrag.js'
import { showToast } from '../../lib/toastStore.js'

// `images` is deferred (DriveController): undefined until the follow-up
// partial reload lands, which <Deferred> turns into the skeleton state.
interface Props {
  folder: FolderItem | null
  breadcrumbs: Crumb[]
  folders: FolderItem[]
  images?: ImageItem[]
  moveTargets: FolderItem[]
}

/** Text entry owns Ctrl/Cmd+A, Esc and friends; checkboxes and buttons do not,
 *  so the selection keys keep working after clicking a card's checkbox. */
function isTextEntry(target: HTMLElement | null): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(target.type)
  }
  return false
}

export default function DriveIndex({ folder, breadcrumbs, folders, images, moveTargets }: Props) {
  const { url, props } = usePage()
  const [viewState, setViewState] = useState<DriveView>(() => readDriveView(url))
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION)
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const [hovered, setHovered] = useState<RenameTarget | null>(null)
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

  useEffect(() => {
    if (renaming !== null) return
    const target = hovered
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return
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

  const sorted = useMemo(() => sortImages(images ?? [], viewState), [images, viewState])
  const sortedIds = useMemo(() => sorted.map((image) => image.id), [sorted])

  useEffect(() => {
    setSelection(EMPTY_SELECTION)
  }, [folder?.id])

  const selectImage = useCallback(
    (id: number, modifiers: SelectModifiers) => {
      setSelection((current) => applySelection(current, sortedIds, id, selectionMode(modifiers)))
    },
    [sortedIds],
  )

  const toggleImage = useCallback((id: number) => {
    setSelection((current) => toggleSelection(current, id))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEntry(event.target as HTMLElement | null)) return
      if (event.key === 'Escape') {
        setSelection((current) => (current.ids.size === 0 ? current : clearSelection()))
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
        event.preventDefault()
        setSelection(selectAll(sortedIds))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sortedIds])

  // Task 2.4 Move orchestration.
  const [picker, setPicker] = useState<ItemDragPayload | null>(null)
  const [optimisticMove, setOptimisticMove] = useState<ItemDragPayload | null>(null)

  const moveItems = useCallback(async (payload: ItemDragPayload, targetFolderId: number | null) => {
    const imageIds = [...payload.imageIds]
    const folderIds = [...payload.folderIds]
    if (imageIds.length + folderIds.length === 0) return
    setOptimisticMove({ imageIds, folderIds })
    setSelection(EMPTY_SELECTION)
    await inertiaRouter.post('/items/move', { imageIds, folderIds, targetFolderId }, {
      preserveScroll: true,
      preserveState: true,
      onError: (errors) => {
        setOptimisticMove(null)
        const message = errors.targetFolderId ?? errors.items ?? 'Could not move the items.'
        showToast('error', message)
      },
      onFinish: () => setOptimisticMove(null),
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      const payload = dragPayload()
      if (payload) moveItems(payload, null)
    }
    window.addEventListener(MOVE_TO_ROOT_EVENT, handler)
    return () => window.removeEventListener(MOVE_TO_ROOT_EVENT, handler)
  }, [moveItems])

  const hiddenImages = useMemo(() => new Set(optimisticMove?.imageIds ?? []), [optimisticMove])
  const hiddenFolders = useMemo(() => new Set(optimisticMove?.folderIds ?? []), [optimisticMove])
  const sortedImages = useMemo(() => sorted.filter((image) => !hiddenImages.has(image.id)), [sorted, hiddenImages])
  const visibleFolders = useMemo(() => folders.filter((child) => !hiddenFolders.has(child.id)), [folders, hiddenFolders])

  const handleCardDragStart = useCallback(
    (event: React.DragEvent, imageId: number, selected: boolean) => {
      event.dataTransfer.effectAllowed = 'move'
      const payload = { imageIds: selected ? [...selection.ids] : [imageId], folderIds: [] }
      startDrag(payload, event.dataTransfer)
      setSelection(EMPTY_SELECTION)
    },
    [selection.ids],
  )

  const handleFolderDragStart = useCallback((event: React.DragEvent, folderId: number) => {
    event.dataTransfer.effectAllowed = 'move'
    startDrag({ imageIds: [], folderIds: [folderId] }, event.dataTransfer)
    setSelection(EMPTY_SELECTION)
  }, [])

  const handleDropInto = useCallback(
    (targetFolderId: number) => {
      const payload = dragPayload()
      if (!payload) return
      moveItems(payload, targetFolderId)
    },
    [moveItems],
  )

  const openPicker = useCallback((payload: ItemDragPayload) => {
    setPicker(payload)
  }, [])

  const confirmPickerMove = useCallback(
    (payload: ItemDragPayload, targetFolderId: number | null) => {
      setPicker(null)
      moveItems(payload, targetFolderId)
    },
    [moveItems],
  )

  return (
    <Layout>
      <Head title={folder ? folder.name : 'My Files'} />
      <div className="flex h-full flex-col px-4 sm:px-6">
        <div className="-mx-4 sticky top-16 z-10 flex items-center justify-between gap-3 border-b border-g-line bg-g-page px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden="true" className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
            <Breadcrumbs
              crumbs={breadcrumbs}
              onDrop={(folderId) => {
                const payload = dragPayload()
                if (!payload) return
                moveItems(payload, folderId)
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={viewState.view} onChange={(view) => updateView({ view })} />
            <SortMenu view={viewState} onChange={updateView} />
          </div>
        </div>

        <div className="flex flex-col gap-4 py-6">
          {visibleFolders.length > 0 && (
            <section aria-label="Folders">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-g-muted">Folders</h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleFolders.map((child) => (
                  <FolderCard
                    key={`f${child.id}`}
                    folder={child}
                    {...renameProps({ kind: 'folder', id: child.id })}
                    onStartRename={() => startRename({ kind: 'folder', id: child.id })}
                    onRenameDone={finishRename}
                    onRenameCancel={finishRename}
                    onHoverChange={(h) => hoverFolder(child.id, h)}
                    onDragStart={(event) => handleFolderDragStart(event, child.id)}
                    onDropFolder={(targetId) => handleDropInto(targetId)}
                  />
                ))}
              </ul>
            </section>
          )}
          <Deferred data="images" fallback={<DriveSkeleton view={viewState.view} />}>
            {sortedImages.length === 0 && visibleFolders.length === 0 ? (
              <EmptyState
                icon={ImagePlus}
                title="Drop images here or press New"
                hint="Nothing is uploaded until you confirm it in the review dialog. Uploads are converted to WebP or AVIF and metadata such as GPS is removed."
              />
            ) : sortedImages.length > 0 && viewState.view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {sortedImages.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    selected={selection.ids.has(image.id)}
                    onSelect={(modifiers) => selectImage(image.id, modifiers)}
                    onToggleSelect={() => toggleImage(image.id)}
                    {...renameProps({ kind: 'image', id: image.id })}
                    onStartRename={() => startRename({ kind: 'image', id: image.id })}
                    onRenameDone={finishRename}
                    onRenameCancel={finishRename}
                    onHoverChange={(h) => hoverImage(image.id, h)}
                    onDragStart={(event) => {
                      const selected = selection.ids.has(image.id)
                      handleCardDragStart(event, image.id, selected)
                    }}
                  />
                ))}
              </ul>
            ) : sortedImages.length > 0 ? (
              <ImageListView
                images={sortedImages}
                view={viewState}
                onChange={updateView}
                selectedIds={selection.ids}
                onSelect={selectImage}
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
                onDragStart={(event) => {
                  const target = event.currentTarget as HTMLElement
                  const imageId = Number(target.getAttribute('data-image-id'))
                  const selected = selection.ids.has(imageId)
                  handleCardDragStart(event, imageId, selected)
                }}
              />
            ) : null}
          </Deferred>
        </div>
      </div>
      <SelectionBar
        count={selection.ids.size}
        onClear={() => setSelection(clearSelection())}
        onMove={() => {
          if (selection.ids.size === 0) return
          openPicker({ imageIds: [...selection.ids], folderIds: [] })
        }}
      />
      {picker && (
        <MoveToPicker
          folders={moveTargets}
          currentFolderId={folder?.id ?? null}
          excluded={new Set<number>([...picker.imageIds, ...picker.folderIds])}
          title="Move items"
          busy={false}
          onCancel={() => setPicker(null)}
          onConfirm={(targetFolderId) => confirmPickerMove(picker, targetFolderId)}
        />
      )}
    </Layout>
  )
}