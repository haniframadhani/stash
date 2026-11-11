import { beforeEach, describe, expect, it } from 'bun:test'
import { Hash, type SqliteSeederContext } from '@guren/core'
import { getDatabase, resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'
import UsersSeeder from '../../db/seeders/UsersSeeder.js'

describe('UsersSeeder', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates the owner from ADMIN_EMAIL and ADMIN_PASSWORD, storing only a hash', async () => {
    const original = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    process.env.ADMIN_EMAIL = 'seeded@example.com'
    process.env.ADMIN_PASSWORD = 'seed-secret'

    try {
      const db = (await getDatabase()) as SqliteSeederContext['db']

      await UsersSeeder({ db })

      let rows = await User.all()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.email).toBe('seeded@example.com')
      expect(rows[0]?.passwordHash).not.toBe('seed-secret')
      expect(rows[0]?.passwordHash.startsWith('$scrypt$')).toBe(true)
      expect(await new Hash().verify(rows[0]!.passwordHash, 'seed-secret')).toBe(true)

      // Idempotent: a second run keeps the single row.
      await UsersSeeder({ db })
      rows = await User.all()
      expect(rows).toHaveLength(1)

      // A changed password rewrites the hash instead of adding a user.
      process.env.ADMIN_PASSWORD = 'new-seed-secret'
      await UsersSeeder({ db })
      rows = await User.all()
      expect(rows).toHaveLength(1)
      expect(await new Hash().verify(rows[0]!.passwordHash, 'new-seed-secret')).toBe(true)
    } finally {
      if (original.email === undefined) delete process.env.ADMIN_EMAIL
      else process.env.ADMIN_EMAIL = original.email
      if (original.password === undefined) delete process.env.ADMIN_PASSWORD
      else process.env.ADMIN_PASSWORD = original.password
    }
  })

  it('fails with a readable message when the owner is not configured', async () => {
    const original = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    delete process.env.ADMIN_EMAIL
    delete process.env.ADMIN_PASSWORD

    try {
      const db = (await getDatabase()) as SqliteSeederContext['db']
      await expect(UsersSeeder({ db })).rejects.toThrow('ADMIN_EMAIL and ADMIN_PASSWORD')
    } finally {
      if (original.email !== undefined) process.env.ADMIN_EMAIL = original.email
      if (original.password !== undefined) process.env.ADMIN_PASSWORD = original.password
    }
  })
})
