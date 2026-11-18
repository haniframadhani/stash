/** The image actions shared by the context menu and (later) the lightbox and
 *  selection bar (UI_SPEC §4/§7). Items whose task has not shipped are present
 *  with `hidden: true`, so the menu never shows a dead action; the owner task
 *  passes the handler and the item appears. */
import {
  Download,
  FolderInput,
  Pencil,
  RefreshCw,
  Share2,
  SquareArrowOutUpRight,
  Star,
  Trash,
  type LucideIcon,
} from 'lucide-react'
import type { ImageItem } from '../types.js'

export interface ImageMenuActions {
  onOpen: () => void
  onRename: () => void
  onMove: () => void
  /** 3.3 Share dialog. */
  onShare?: () => void
  /** 3.1 Replace image. */
  onReplace?: () => void
  /** 4.1 Star. */
  onStar?: () => void
  /** 4.2 Move to trash. */
  onTrash?: () => void
}

export interface ImageMenuItem {
  key: string
  label: string
  icon: LucideIcon
  /** Not built yet: rendered nowhere until its task supplies the handler. */
  hidden?: boolean
  danger?: boolean
  /** A download link is an anchor, not a button. */
  href?: string
  onSelect?: () => void
}

/** The current version's URL, with `?download=1` on the private preview route
 *  so the browser saves it instead of navigating. Bucket links open as-is. */
export function imageDownloadUrl(image: ImageItem): string {
  const url = new URL(image.urls.view, window.location.origin)
  if (url.pathname.startsWith('/preview/')) url.searchParams.set('download', '1')
  return url.toString()
}

export function imageMenuItems(image: ImageItem, actions: ImageMenuActions): ImageMenuItem[] {
  return [
    { key: 'open', label: 'Open', icon: SquareArrowOutUpRight, onSelect: actions.onOpen },
    { key: 'share', label: 'Share', icon: Share2, hidden: !actions.onShare, onSelect: actions.onShare },
    { key: 'download', label: 'Download', icon: Download, href: imageDownloadUrl(image) },
    { key: 'rename', label: 'Rename', icon: Pencil, onSelect: actions.onRename },
    { key: 'replace', label: 'Replace image…', icon: RefreshCw, hidden: !actions.onReplace, onSelect: actions.onReplace },
    { key: 'move', label: 'Move to…', icon: FolderInput, onSelect: actions.onMove },
    { key: 'star', label: image.starred ? 'Unstar' : 'Star', icon: Star, hidden: !actions.onStar, onSelect: actions.onStar },
    { key: 'trash', label: 'Move to trash', icon: Trash, danger: true, hidden: !actions.onTrash, onSelect: actions.onTrash },
  ]
}
