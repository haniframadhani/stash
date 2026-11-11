import { eq } from 'drizzle-orm'
import { defineSeeder, Hash, type SqliteSeederContext } from '@guren/core'
import env from '../../config/env.js'
import { users } from '../schema.js'

/**
 * Creates the single Stash owner from ADMIN_EMAIL/ADMIN_PASSWORD.
 * Re-running keeps the row, rewriting the hash only when the password changed.
 */
export default defineSeeder(async ({ db }: SqliteSeederContext) => {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = env.parse(undefined, { mode: 'report' }).values

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the owner account.')
  }

  const hasher = new Hash()
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!existing) {
    await db.insert(users).values({
      name: 'Owner',
      email,
      passwordHash: await hasher.hash(password),
    })
    return
  }

  if (!(await hasher.verify(existing.passwordHash, password))) {
    await db
      .update(users)
      .set({ passwordHash: await hasher.hash(password), updatedAt: new Date().toISOString() })
      .where(eq(users.email, email))
  }
})
