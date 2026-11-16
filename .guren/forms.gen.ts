// Generated — DO NOT EDIT
// Run `guren codegen` to regenerate.
import type { RouteFormContract } from '@guren/inertia-client/forms'
import type { ApiRoutes } from './api-client.gen'

export const foldersStoreForm: RouteFormContract<'folders.store', 'POST', '/folders', ApiRoutes['folders.store']['body']> = {
  route: 'folders.store',
  method: 'POST',
  path: '/folders',
  fields: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    parentId: { type: 'object', required: true },
  },
}

export const foldersUpdateForm: RouteFormContract<'folders.update', 'PATCH', '/folders/:id', ApiRoutes['folders.update']['body']> = {
  route: 'folders.update',
  method: 'PATCH',
  path: '/folders/:id',
  fields: {
    name: { type: 'string', required: false, minLength: 1, maxLength: 255 },
    parentId: { type: 'object', required: true },
  },
}

export const imagesUpdateForm: RouteFormContract<'images.update', 'PATCH', '/images/:id', ApiRoutes['images.update']['body']> = {
  route: 'images.update',
  method: 'PATCH',
  path: '/images/:id',
  fields: {
    name: { type: 'string', required: false, minLength: 1, maxLength: 255 },
  },
}

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
