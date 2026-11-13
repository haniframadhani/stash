import { Head } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'

// Keep the shapes narrow until task 1.4 swaps them for API Resources with URLs.
interface Crumb {
  id: number | null
  name: string
}

interface FolderSummary {
  id: number
  name: string
}

interface ImageSummary {
  id: number
  name: string
  starred: boolean
}

interface Props {
  folder: null
  breadcrumbs: Crumb[]
  folders: FolderSummary[]
  images: ImageSummary[]
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
          <ul className="flex flex-col gap-2">
            {folders.map((folder) => (
              <li key={`f${folder.id}`} className="rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text">
                {folder.name}
              </li>
            ))}
            {images.map((image) => (
              <li key={`i${image.id}`} className="rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text">
                {image.name}
                {image.starred && <span className="ml-2 text-g-accent-text">★</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
