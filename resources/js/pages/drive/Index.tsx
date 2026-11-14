import { Deferred, Head, usePage } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'
import ImageCard from '../../components/drive/ImageCard.js'
import ImageListView from '../../components/drive/ImageListView.js'
import DriveSkeleton from '../../components/drive/DriveSkeleton.js'
import SortMenu from '../../components/drive/SortMenu.js'
import ViewToggle from '../../components/drive/ViewToggle.js'
import type { ImageItem } from '../../types.js'
import { driveViewUrl, readDriveView, sortImages, type DriveView } from '../../lib/driveView.js'

// The shapes stay narrow; task 1.6/2.x grow them (versions, selection).
interface Crumb {
  id: number | null
  name: string
}

interface FolderSummary {
  id: number
  name: string
}

// `images` is deferred (DriveController): undefined until the follow-up
// partial reload lands, which <Deferred> turns into the skeleton state.
interface Props {
  folder: null
  breadcrumbs: Crumb[]
  folders: FolderSummary[]
  images?: ImageItem[]
}

export default function DriveIndex({ folders, images }: Props) {
  // View and sort live in the URL query (`view`, `sort`, `order`; ROUTES_SPEC
  // §3), so a refresh keeps them. React owns the state and rewrites the
  // address bar in place — an Inertia visit here would re-defer the images.
  const { url } = usePage()
  const [viewState, setViewState] = useState<DriveView>(() => readDriveView(url))
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())

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
      <Head title="My Files" />
      <div className="flex h-full flex-col px-4 sm:px-6">
        <div className="-mx-4 sticky top-16 z-10 flex items-center justify-between gap-3 border-b border-g-line bg-g-page px-4 py-3 sm:-mx-6 sm:px-6">
          <h1 className="flex items-center gap-3 text-xl font-bold text-g-heading">
            <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
            My Files
          </h1>
          <div className="flex items-center gap-2">
            <ViewToggle view={viewState.view} onChange={(view) => updateView({ view })} />
            <SortMenu view={viewState} onChange={updateView} />
          </div>
        </div>

        <div className="flex flex-col gap-4 py-6">
          {folders.length > 0 && (
            <ul className="flex flex-col gap-2">
              {folders.map((folder) => (
                <li key={`f${folder.id}`} className="rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text">
                  {folder.name}
                </li>
              ))}
            </ul>
          )}
          <Deferred data="images" fallback={<DriveSkeleton view={viewState.view} />}>
            {sorted.length === 0 && folders.length === 0 ? (
              <EmptyState
                icon={ImagePlus}
                title="Drop images here or press New"
                hint="Nothing is uploaded until you confirm it in the review dialog. Uploads are converted to WebP or AVIF and metadata such as GPS is removed."
              />
            ) : viewState.view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {sorted.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    selected={selectedIds.has(image.id)}
                    onToggleSelect={() => toggleSelect(image.id)}
                  />
                ))}
              </ul>
            ) : (
              <ImageListView images={sorted} view={viewState} onChange={updateView} />
            )}
          </Deferred>
        </div>
      </div>
    </Layout>
  )
}
