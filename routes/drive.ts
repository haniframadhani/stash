import { Router, requireAuthenticated } from '@guren/core'
import HomeController from '../app/Http/Controllers/HomeController.js'
import DriveController from '../app/Http/Controllers/DriveController.js'
import FolderController from '../app/Http/Controllers/FolderController.js'
import ImageController from '../app/Http/Controllers/ImageController.js'
import ItemController from '../app/Http/Controllers/ItemController.js'
import UploadController from '../app/Http/Controllers/UploadController.js'
import { FolderIdParams, FolderStoreSchema, FolderUpdateSchema } from '../app/Http/Validators/FolderValidator.js'
import { ImageIdParams, ImageUpdateSchema } from '../app/Http/Validators/ImageValidator.js'
import { ItemBatchSchema, ItemMoveSchema } from '../app/Http/Validators/ItemValidator.js'
import { UploadOptionsSchema } from '../app/Http/Validators/UploadValidator.js'

// The private drive pages (ROUTES_SPEC §3). `/` funnels into the drive; a guest
// chasing it lands on `/files` and is sent to `/login` by its middleware.
// `/dashboard` is gone: `/files` is the only path (2026-11-13).
// `drive.index` and `drive.folder` share DriveController's action pair: Guren
// codegen keys types by route name, so the two paths cannot share one name.
export function registerDriveRoutes(router: Router): void {
  router.get('/', [HomeController, 'index']).name('home')

  router.get('/files', [DriveController, 'index'], requireAuthenticated({ redirectTo: '/login' })).name('drive.index')
  router.get(
    '/files/:folderId',
    { name: 'drive.folder', middlewares: [requireAuthenticated({ redirectTo: '/login' })] },
    [DriveController, 'folder'],
  )
  router.get('/recent', [DriveController, 'recent'], requireAuthenticated({ redirectTo: '/login' })).name('drive.recent')
  router.get('/starred', [DriveController, 'starred'], requireAuthenticated({ redirectTo: '/login' })).name('drive.starred')
  router.get('/trash', [DriveController, 'trash'], requireAuthenticated({ redirectTo: '/login' })).name('drive.trash')

  // folders.store / folders.update (ROUTES_SPEC §4): redirect responses for
  // Inertia form posts; both mutations sit behind the auth middleware.
  router.post(
    '/folders',
    { name: 'folders.store', body: FolderStoreSchema },
    [FolderController, 'store'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
  router.patch(
    '/folders/:id',
    { name: 'folders.update', params: FolderIdParams, body: FolderUpdateSchema },
    [FolderController, 'update'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))

  // images.update (ROUTES_SPEC §4): rename only until Move (2.4) and Star
  // (4.1) grow the contract; the redirect keeps the browser on the folder.
  router.patch(
    '/images/:id',
    { name: 'images.update', params: ImageIdParams, body: ImageUpdateSchema },
    [ImageController, 'update'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))

  // items.move / trash / restore / delete (ROUTES_SPEC §4): one bulk request
  // per action; cycles and clashes reject the whole batch before any write.
  router.post(
    '/items/move',
    { name: 'items.move', body: ItemMoveSchema },
    [ItemController, 'move'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
  router.post(
    '/items/trash',
    { name: 'items.trash', body: ItemBatchSchema },
    [ItemController, 'trash'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
  router.post(
    '/items/restore',
    { name: 'items.restore', body: ItemBatchSchema },
    [ItemController, 'restore'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
  router.post(
    '/items/delete',
    { name: 'items.delete', body: ItemBatchSchema },
    [ItemController, 'delete'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
  // DELETE /trash (trash.empty) has no body: it wipes everything in the Trash.
  router.delete(
    '/trash',
    { name: 'trash.empty' },
    [ItemController, 'empty'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))

  // uploads.store (ROUTES_SPEC §4): JSON only, one file per request.
  router.post(
    '/uploads',
    { name: 'uploads.store', body: UploadOptionsSchema },
    [UploadController, 'store'],
  ).middleware(requireAuthenticated({ redirectTo: '/login' }))
}
