import { Head } from '@inertiajs/react'
import { Trash2 } from 'lucide-react'
import Layout from '../../components/Layout.js'
import EmptyState from '../../components/drive/EmptyState.js'

interface Props {
  folders: { id: number, name: string }[]
  images: { id: number, name: string, starred: boolean }[]
}

export default function DriveTrash({ folders, images }: Props) {
  const empty = folders.length === 0 && images.length === 0
  return (
    <Layout>
      <Head title="Trash" />
      <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="flex items-center gap-3 text-xl font-bold text-g-heading">
          <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[image:var(--g-tick)]" />
          Trash
        </h1>
        {empty ? (
          <EmptyState icon={Trash2} title="Trash is empty" hint="Items you move to trash stay here before they are deleted." />
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
