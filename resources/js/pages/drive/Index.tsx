import { Deferred, Head, usePage } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import ContextMenu from '../../components/drive/ContextMenu.js'
import ReviewDialog, { type ReviewUpload } from '../../components/drive/ReviewDialog.js'
import { Lightbox } from '../../components/drive/Lightbox.js'
import ShareDialog from '../../components/drive/ShareDialog.js'
import { startReplace } from '../../components/drive/upload.js'
import type { RenameTarget } from '../../components/drive/RenameInput.js'
import { clearRenameAttempt, takeFailedRename } from '../../components/drive/RenameInput.js'
import type { Crumb, FolderItem, ImageItem } from '../../types.js'
import { driveViewUrl, readDriveView, sortImages, type DriveView } from '../../lib/driveView.js'
import { imageDownloadUrl, imageMenuItems } from '../../lib/imageMenu.js'
import { classifyReviewFiles, type ReviewRow } from '../../lib/reviewFiles.js'
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
/** The lightbox lives in the URL (`?image=<id>`, UI_SPEC §8) so a deep link
 *  opens it and Back closes it, without a router dependency. */
function lightboxIdFromUrl(url: string): number | null {
  try {
    const raw = new URL(url, window.location.origin).searchParams.get('image')
    const id = raw === null ? NaN : Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function writeLightboxParam(id: number | null) {
  const url = new URL(window.location.href)
  if (id === null) url.searchParams.delete('image')
  else url.searchParams.set('image', String(id))
  window.history.replaceState(window.history.state, '', url.pathname + url.search)
}

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
  const [menu, setMenu] = useState<{ image: ImageItem, x: number, y: number } | null>(null)
  // Task 3.3: the share dialog targets one image at a time.
  const [sharing, setSharing] = useState<ImageItem | null>(null)
  // Task 3.1: replace reuses the Review dialog for exactly one file.
  const [replacing, setReplacing] = useState<{ image: ImageItem, rows: ReviewRow[] } | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<ImageItem | null>(null)
  const [lightboxId, setLightboxId] = useState<number | null>(() => lightboxIdFromUrl(url))
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
        const url = new URL(driveViewUrl(window.location.pathname, next), window.location.origin)
        if (lightboxId !== null) url.searchParams.set('image', String(lightboxId))
        window.history.replaceState(window.history.state, '', url.pathname + url.search)
      }
      return next
    })
  }, [lightboxId])

  const sorted = useMemo(() => sortImages(images ?? [], viewState), [images, viewState])
  const sortedIds = useMemo(() => sorted.map((image) => image.id), [sorted])

  const previousFolderId = useRef(folder?.id)
  useEffect(() => {
    if (previousFolderId.current === folder?.id) return
    previousFolderId.current = folder?.id
    setSelection(EMPTY_SELECTION)
    setMenu(null)
    setLightboxId(null)
    writeLightboxParam(null)
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
      // The lightbox and the context menu own Esc while they are open.
      if (menu !== null || lightboxId !== null) return
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
  }, [sortedIds, menu, lightboxId])

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

  /** Task 4.2: optimistic trash — the cards leave at once and the request
   *  reloads the page through its redirect; a 422 rolls nothing back because
   *  trash only removes rows from the current view. */
  const trashItems = useCallback((batch: { imageIds: number[], folderIds: number[] }) => {
    setSelection(EMPTY_SELECTION)
    inertiaRouter.post('/items/trash', batch, {
      preserveScroll: true,
      onError: () => showToast('error', 'Could not move the selection to trash.'),
    })
  }, [])

  const hiddenImages = useMemo(() => new Set(optimisticMove?.imageIds ?? []), [optimisticMove])
  const hiddenFolders = useMemo(() => new Set(optimisticMove?.folderIds ?? []), [optimisticMove])
  const sortedImages = useMemo(() => sorted.filter((image) => !hiddenImages.has(image.id)), [sorted, hiddenImages])
  const visibleFolders = useMemo(() => folders.filter((child) => !hiddenFolders.has(child.id)), [folders, hiddenFolders])

  // Task 2.5: context menu and lightbox.
  const openImage = useCallback((id: number) => {
    setLightboxId(id)
    writeLightboxParam(id)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxId(null)
    writeLightboxParam(null)
  }, [])

  const lightboxIndex = lightboxId === null ? -1 : sortedImages.findIndex((image) => image.id === lightboxId)
  const lightboxImage = lightboxIndex >= 0 ? sortedImages[lightboxIndex] : null

  // The drive defers `images`, so a props reload (e.g. Make current) briefly
  // unmounts the lightbox and would drop its Info panel. Keep the last image
  // of this lightbox id on screen until the fresh list lands.
  const [lastLightbox, setLastLightbox] = useState<ImageItem | null>(null)
  useEffect(() => {
    if (lightboxImage) setLastLightbox(lightboxImage)
  }, [lightboxImage])
  const shownImage = lightboxImage ?? (lastLightbox && lastLightbox.id === lightboxId ? lastLightbox : null)

  const stepLightbox = useCallback(
    (delta: number) => {
      if (lightboxIndex < 0) return
      const next = lightboxIndex + delta
      if (next < 0 || next >= sortedImages.length) return
      setLightboxId(sortedImages[next].id)
      writeLightboxParam(sortedImages[next].id)
    },
    [lightboxIndex, sortedImages],
  )

  useEffect(() => {
    const onPop = () => setLightboxId(lightboxIdFromUrl(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Deep link: once the deferred images land, an id outside this folder closes
  // instead of showing an empty overlay.
  useEffect(() => {
    if (images === undefined || lightboxId === null) return
    if (!sortedImages.some((image) => image.id === lightboxId)) {
      setLightboxId(null)
      writeLightboxParam(null)
    }
  }, [images, lightboxId, sortedImages])

  const openImageMenu = useCallback(
    (image: ImageItem, x: number, y: number) => {
      setSelection((current) =>
        current.ids.has(image.id) ? current : applySelection(current, sortedIds, image.id, 'replace'),
      )
      setMenu({ image, x, y })
    },
    [sortedIds],
  )

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

  // Task 3.1 Replace image: picker → the same Review dialog (single file) →
  // POST /images/:id/versions; the server writes v(n+1) and the old versions
  // keep their keys. The dialog stages only, nothing is sent before Confirm.
  const openReplace = useCallback((image: ImageItem) => {
    replaceTarget.current = image
    replaceInputRef.current?.click()
  }, [])

  const pickReplaceFile = useCallback((file: File | undefined) => {
    const target = replaceTarget.current
    if (!file || !target) return
    const { avif, maxUploadMb } = props.capabilities
    void classifyReviewFiles([file], { avif, maxUploadMb })
      .then((rows) => setReplacing({ image: target, rows }))
  }, [props.capabilities])

  const confirmReplace = useCallback((uploads: readonly ReviewUpload[]) => {
    const target = replacing?.image
    const upload = uploads[0]
    setReplacing(null)
    if (!target || !upload) return

    const handle = startReplace(target.id, upload.file, upload.options)
    void handle.promise.then((outcome) => {
      if (outcome.ok) {
        showToast('success', `${target.name} replaced with v${target.version + 1}${outcome.savedPercent !== undefined ? ` (−${outcome.savedPercent}%)` : ''}`)
        inertiaRouter.reload({
          only: ['folder', 'breadcrumbs', 'folders', 'images', 'storage'],
        })
      } else if (!outcome.canceled) {
        showToast('error', outcome.message ?? 'The image could not be replaced.')
      }
    })
  }, [replacing])

  /** Task 3.2: Make current moves the pointer only; the redirect reloads the
   *  page, and `preserveState` keeps the lightbox and its Info panel open. */
  const restoreVersion = useCallback((image: ImageItem, version: number) => {
    inertiaRouter.post(`/images/${image.id}/versions/${version}/restore`, {}, {
      preserveScroll: true,
      preserveState: true,
      onError: () => showToast('error', 'Could not make that version current.'),
    })
  }, [])

  const menuItems = menu
    ? imageMenuItems(menu.image, {
        onOpen: () => {
          setMenu(null)
          openImage(menu.image.id)
        },
        onRename: () => {
          setMenu(null)
          startRename({ kind: 'image', id: menu.image.id })
        },
        onMove: () => {
          setMenu(null)
          openPicker({ imageIds: [menu.image.id], folderIds: [] })
        },
        onShare: () => {
          setMenu(null)
          setSharing(menu.image)
        },
        onReplace: () => {
          const target = menu.image
          setMenu(null)
          openReplace(target)
        },
        onTrash: () => {
          const target = menu.image
          setMenu(null)
          trashItems({ imageIds: [target.id], folderIds: [] })
        },
      })
    : []

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
                    onTrash={() => trashItems({ imageIds: [], folderIds: [child.id] })}
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
                    onRenameDone={finishRename}
                    onRenameCancel={finishRename}
                    onHoverChange={(h) => hoverImage(image.id, h)}
                    onDragStart={(event) => {
                      const selected = selection.ids.has(image.id)
                      handleCardDragStart(event, image.id, selected)
                    }}
                    onOpen={() => openImage(image.id)}
                    onContextMenu={(x, y) => openImageMenu(image, x, y)}
                    onOpenMenu={(x, y) => openImageMenu(image, x, y)}
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
                onOpen={openImage}
                onContextMenu={(id, x, y) => {
                  const image = sortedImages.find((candidate) => candidate.id === id)
                  if (image) openImageMenu(image, x, y)
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
        onTrash={() => {
          if (selection.ids.size === 0) return
          trashItems({ imageIds: [...selection.ids], folderIds: [] })
        }}
      />
      {picker && (
        <MoveToPicker
          folders={moveTargets}
          currentFolderId={folder?.id ?? null}
          // Only folder ids: image ids share the same number space, and a
          // mixed set disabled unrelated folders whenever the ids collided.
          excluded={new Set<number>(picker.folderIds)}
          title="Move items"
          busy={false}
          onCancel={() => setPicker(null)}
          onConfirm={(targetFolderId) => confirmPickerMove(picker, targetFolderId)}
        />
      )}
      {menu && (
        <ContextMenu
          label={`Actions for ${menu.image.name}`}
          items={menuItems}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
      {shownImage && (
        <Lightbox
          image={shownImage}
          versions={shownImage.versions}
          canPrev={lightboxIndex > 0}
          canNext={lightboxIndex >= 0 && lightboxIndex < sortedImages.length - 1}
          onPrev={() => stepLightbox(-1)}
          onNext={() => stepLightbox(1)}
          onClose={closeLightbox}
          onDownload={(image) => {
            window.location.assign(imageDownloadUrl(image))
          }}
          onShare={() => setSharing(shownImage)}
          onRestoreVersion={(version) => restoreVersion(shownImage, version)}
        />
      )}
      {sharing && <ShareDialog image={sharing} onClose={() => setSharing(null)} />}
      {/* Single-file picker for Replace image… (task 3.1); the same review
          dialog stages it, nothing is sent before Confirm. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          pickReplaceFile(file)
        }}
      />
      {replacing && (
        <ReviewDialog
          rows={replacing.rows}
          caps={props.capabilities}
          heading={`Replace "${replacing.image.name}"`}
          confirmLabel="Replace"
          onCancel={() => setReplacing(null)}
          onConfirm={confirmReplace}
        />
      )}
    </Layout>
  )
}