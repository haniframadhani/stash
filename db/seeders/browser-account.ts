import { defineSeeder, Hash, type SqliteSeederContext } from '@guren/core'
import { users } from '../schema.js'

// Boot-time seeding and `db:seed --force` reach this file in every run, so the guard is here:
// only `guren browser:serve` sets GUREN_BROWSER_SEED, for the app it starts.
export default defineSeeder(async ({ db }: SqliteSeederContext) => {
  if (process.env.GUREN_BROWSER_SEED !== '1' || process.env.NODE_ENV === 'production') return
  const password = process.env.BROWSER_TEST_PASSWORD
  if (!password) {
    console.warn('BROWSER_TEST_PASSWORD is unset, so the browser account was not seeded.')
    return
  }
  const passwordHash = await new Hash().hash(password)
  await db
    .insert(users)
    .values({ name: 'Browser Tests', email: 'browser@example.test', passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } })
})
