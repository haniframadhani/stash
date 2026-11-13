import { Router, requireAuthenticated, requireGuest } from '@guren/core'
import LoginController from '../app/Http/Controllers/Auth/LoginController.js'
import { throttleLogin, throttleProfileUpdate } from '../app/Http/Middleware/AuthThrottle.js'
import { LoginSchema } from '../app/Http/Validators/LoginValidator.js'
import { ProfileUpdateSchema } from '../app/Http/Validators/ProfileValidator.js'
import ProfileController from '../app/Http/Controllers/ProfileController.js'

export function registerAuthRoutes(router: Router): void {
  router.get('/login', [LoginController, 'show'], requireGuest({ redirectTo: '/files' })).name('login')
  router.post('/login', { name: 'login.store', body: LoginSchema, middlewares: [requireGuest({ redirectTo: '/files' }), throttleLogin] }, [LoginController, 'store'])
  router.post('/logout', [LoginController, 'destroy'], requireAuthenticated({ redirectTo: '/login' })).name('logout')

  router.get('/profile', [ProfileController, 'edit'], requireAuthenticated({ redirectTo: '/login' })).name('profile.edit')
  router.put('/profile', { name: 'profile.update', body: ProfileUpdateSchema, middlewares: [requireAuthenticated({ redirectTo: '/login' }), throttleProfileUpdate] }, [ProfileController, 'update'])
}
