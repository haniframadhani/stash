// Generated — DO NOT EDIT
// Run `guren codegen` to regenerate.
import type { RouteFormContract } from '@guren/inertia-client/forms'
import type { ApiRoutes } from './api-client.gen'

export const loginStoreForm: RouteFormContract<'login.store', 'POST', '/login', ApiRoutes['login.store']['body']> = {
  route: 'login.store',
  method: 'POST',
  path: '/login',
  fields: {
    email: { type: 'string', required: true, format: 'email', minLength: 1 },
    password: { type: 'string', required: true, minLength: 1 },
    remember: { type: 'boolean', required: false },
  },
}

export const profileUpdateForm: RouteFormContract<'profile.update', 'PUT', '/profile', ApiRoutes['profile.update']['body']> = {
  route: 'profile.update',
  method: 'PUT',
  path: '/profile',
  fields: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 120 },
    email: { type: 'string', required: true, format: 'email', minLength: 1 },
    password: { type: 'string', required: false },
    currentPassword: { type: 'string', required: false },
  },
}

export const uploadsStoreForm: RouteFormContract<'uploads.store', 'POST', '/uploads', ApiRoutes['uploads.store']['body']> = {
  route: 'uploads.store',
  method: 'POST',
  path: '/uploads',
  fields: {
    format: { type: 'object', required: true },
    quality: { type: 'object', required: true },
    maxDimension: { type: 'object', required: true },
    folderId: { type: 'object', required: true },
    name: { type: 'object', required: true },
  },
}
