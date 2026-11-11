import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'

describe('profile', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('sends a guest to the sign-in page', async () => {
    await http.get('/profile').assertRedirect('/login')
  })

  it('updates the owner name without asking for a password', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const browser = await http.actingAs(owner).withCsrf()

    await browser
      .put('/profile', { name: 'Renamed Owner', email: owner.email, password: '', currentPassword: '' })
      .assertOk()

    expect((await User.find(owner.id))?.name).toBe('Renamed Owner')
  })

  it('requires the current password to change the email', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })
    const browser = await http.actingAs(owner).withCsrf()

    const response = await browser.put('/profile', {
      name: owner.name,
      email: 'new@example.com',
      password: '',
      currentPassword: '',
    })
    response.assertUnprocessable()
    expect((await User.find(owner.id))?.email).toBe('owner@example.com')
  })
})
