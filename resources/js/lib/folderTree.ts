/** Tree helpers for the drive (task 2.4). The server sends a flat list of
 *  active folders; the "Move to…" picker needs a tree so a user can see where
 *  each folder lives, and it must disable moving a folder into itself or one of
 *  its descendants before the request ever leaves the browser.
 */
import type { FolderItem } from '../types.js'

export interface FolderNode {
  folder: FolderItem
  children: FolderNode[]
  /** This folder and every descendant, so a move target can be ruled out. */
  descendants: Set<number>
}

/** Build the forest from a flat list, then fold each child's descendants up
 *  into its parent in one post-order pass. */
export function buildFolderTree(folders: readonly FolderItem[]): FolderNode[] {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, children: [], descendants: new Set([folder.id]) })
  }
  const roots: FolderNode[] = []
  for (const folder of folders) {
    const node = nodes.get(folder.id)!
    const parent = folder.parentId === null ? undefined : nodes.get(folder.parentId)
    if (parent === undefined) {
      roots.push(node)
    } else {
      parent.children.push(node)
    }
  }
  const fold = (node: FolderNode): void => {
    for (const child of node.children) {
      fold(child)
      for (const descendant of child.descendants) node.descendants.add(descendant)
    }
  }
  for (const root of roots) fold(root)
  return roots
}

/** A flat, depth-indented option list for the Move-to picker. The root is always
 *  first; folders named in `excluded` and their descendants are disabled. */
export interface FolderOption {
  id: number | null
  name: string
  depth: number
  disabled: boolean
}

export function folderOptions(folders: readonly FolderItem[], excluded: ReadonlySet<number> = new Set()): FolderOption[] {
  const tree = buildFolderTree(folders)
  const blocked = new Set(excluded)
  const visit = (node: FolderNode): void => {
    if (excluded.has(node.folder.id)) {
      for (const descendant of node.descendants) blocked.add(descendant)
    }
    for (const child of node.children) visit(child)
  }
  for (const root of tree) visit(root)

  const options: FolderOption[] = [{ id: null, name: 'My Files', depth: 0, disabled: false }]
  const walk = (node: FolderNode, depth: number): void => {
    options.push({
      id: node.folder.id,
      name: node.folder.name,
      depth,
      disabled: blocked.has(node.folder.id),
    })
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of tree) walk(root, 1)
  return options
}
