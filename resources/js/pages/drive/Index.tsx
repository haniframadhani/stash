import { Head } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'
import type { ImageItem } from '../../types.js'

// The shapes stay narrow; task 1.6/2.x grow them (versions, selection).
interface Crumb {
  id: number | null
  name: string
}

interface FolderSummary {
  id: number
  name: string
}

interface Props {
  folder: null
  breadcrumbs: Crumb[]
  folders: FolderSummary[]
  images: ImageItem[]
}

export default function DriveIndex({ folders, images }: Props) {
  const empty = folders.length === 0 && images.length === 0
  return (
    <Layout>
      <Head title="My Files" />
      <div className="flex h-full flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-3 text-xl font-bold text-g-heading">
            <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
            My Files
          </h1>
        </div>

        {empty ? (
          <EmptyState
            icon={ImagePlus}
            title="Drop images here or press New"
            hint="Nothing is uploaded until you confirm it in the review dialog. Uploads are converted to WebP or AVIF and metadata such as GPS is removed."
          />
        ) : (
          <>
            {folders.length > 0 && (
              <ul className="flex flex-col gap-2">
                {folders.map((folder) => (
                  <li key={`f${folder.id}`} className="rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text">
                    {folder.name}
                  </li>
                ))}
              </ul>
            )}
            {/* Simple grid for now; ImageCard interactions land in 1.5/1.6
                (UI_SPEC §ImageCard). width/height keep the layout stable. */}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {images.map((image) => (
                <li key={image.id} className="overflow-hidden rounded-g-card border border-g-line bg-g-panel">
                  <img
                    src={image.urls.thumb}
                    alt={image.name}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="truncate text-sm text-g-heading" title={image.name}>
                      {image.name}
                    </span>
                    {image.starred && <span className="shrink-0 text-g-accent-text" aria-label="Starred">★</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Layout>
  )
}
