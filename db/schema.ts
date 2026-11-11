import { index, integer, sqliteTable, text } from '@guren/orm/drizzle/sqlite'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  rememberToken: text('remember_token'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => [index('sessions_expires_at_idx').on(t.expiresAt)])

export const folders = sqliteTable('folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id'),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('folders_deleted_at_idx').on(t.deletedAt),
  index('folders_parent_id_idx').on(t.parentId),
])

export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id').notNull().unique(),
  folderId: integer('folder_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  starred: integer('starred').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('images_deleted_at_idx').on(t.deletedAt),
])

export const imageVersions = sqliteTable('image_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  imageId: integer('image_id').notNull().references(() => images.id),
  version: integer('version').notNull(),
  format: text('format').notNull(),
  mime: text('mime').notNull(),
  ext: text('ext').notNull(),
  size: integer('size').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sha256: text('sha256').notNull(),
  storageKey: text('storage_key').notNull(),
  thumbKey: text('thumb_key').notNull(),
  originalName: text('original_name').notNull(),
  originalFormat: text('original_format').notNull(),
  originalSize: integer('original_size').notNull(),
  convertOptions: text('convert_options').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => [
  index('image_versions_image_id_idx').on(t.imageId),
  // UNIQUE(image_id, version)
  index('uq_image_versions_image_version').on(t.imageId, t.version),
])
