import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'

describe('dashboard', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('sends a guest to the sign-in page', async () => {
    await http.get('/dashboard').assertRedirect('/login')
  })

  it('shows the signed-in owner', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

    const response = await http
      .json()
      .actingAs(owner)
      .get('/dashboard')
      .assertInertia('dashboard/Index', {
        user: { id: owner.id, name: owner.name, email: owner.email },
      })
    response.assertOk()
    expect(owner.passwordHash.startsWith('$scrypt$')).toBe(true)
  })
})
