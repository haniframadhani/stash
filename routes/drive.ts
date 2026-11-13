import { Router, requireAuthenticated } from '@guren/core'
import HomeController from '../app/Http/Controllers/HomeController.js'
import DriveController from '../app/Http/Controllers/DriveController.js'

// The private drive pages (ROUTES_SPEC §3). `/` funnels into the drive; a guest
// chasing it lands on `/files` and is sent to `/login` by its middleware.
// `/dashboard` is gone: `/files` is the only path (2026-11-13).
export function registerDriveRoutes(router: Router): void {
  router.get('/', [HomeController, 'index']).name('home')

  router.get('/files', [DriveController, 'index'], requireAuthenticated({ redirectTo: '/login' })).name('drive.index')
  router.get('/recent', [DriveController, 'recent'], requireAuthenticated({ redirectTo: '/login' })).name('drive.recent')
  router.get('/starred', [DriveController, 'starred'], requireAuthenticated({ redirectTo: '/login' })).name('drive.starred')
  router.get('/trash', [DriveController, 'trash'], requireAuthenticated({ redirectTo: '/login' })).name('drive.trash')
}
