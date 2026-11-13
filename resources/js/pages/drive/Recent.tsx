import { Head } from '@inertiajs/react'
import { Clock } from 'lucide-react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'

interface ImageSummary {
  id: number
  name: string
  starred: boolean
}

interface Props {
  images: ImageSummary[]
}

export default function DriveRecent({ images }: Props) {
  return (
    <Layout>
      <Head title="Recent" />
      <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="flex items-center gap-3 text-xl font-bold text-g-heading">
          <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
          Recent
        </h1>
        {images.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nothing here yet"
            hint="The images you upload appear here first, newest day by day."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {images.map((image) => (
              <li key={image.id} className="rounded-g-card border border-g-line bg-g-panel px-4 py-2 text-g-text">
                {image.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
