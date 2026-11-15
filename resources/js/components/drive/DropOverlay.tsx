/** The window-wide drop overlay (UI_SPEC §4): a dashed accent frame while a
 *  file drag is over the window. Dropping is handled at the window level in
 *  Layout; this is only the visual. */
export default function DropOverlay({ folderName }: { folderName?: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 p-3 sm:p-4" aria-hidden>
      <div className="flex h-full items-center justify-center rounded-g-card border-2 border-dashed border-g-accent bg-g-accent-tint/70 text-center text-lg font-bold text-g-accent-text">
        {folderName ? (
          <p>
            Drop images to upload to <em>{folderName}</em>
          </p>
        ) : (
          <p>Drop images to upload</p>
        )}
      </div>
    </div>
  )
}
