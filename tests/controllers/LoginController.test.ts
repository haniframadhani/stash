import { beforeAll, beforeEach, describe, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../../src/app.js'
import { resetDatabase } from '../../config/database.js'
import { User } from '../../app/Models/User.js'

describe('auth', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  it('shows the sign-in page', async () => {
    await http.json().get('/login').assertInertia('auth/Login')
  })

  it('signs the owner in and starts a session', async () => {
    await User.create({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' })

    const browser = await http.withCsrf()
    const response = await browser.post('/login', {
      email: 'owner@example.com',
      password: 'correct-horse-battery',
    })
    // Post-login lands on the drive (TASKS 1.2).
    response.assertRedirect('/files')

    // Login regenerates the session id; carry the new cookies, as a browser would.
    const cookie = response.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0] ?? '')
      .join('; ')
    await browser.withHeaders({ Cookie: cookie }).json().get('/files').assertInertia('drive/Index')
  })

  it('has no registration or password-reset routes', async () => {
    await http.get('/register').assertNotFound()
    await http.get('/forgot-password').assertNotFound()
    await http.get('/password/reset').assertNotFound()
  })

  it('throttles repeated bad logins', async () => {
    const browser = await http.withCsrf()

    for (let attempt = 0; attempt < 5; attempt++) {
      await browser
        .post('/login', { email: 'intruder@example.com', password: 'wrong' })
        .assertUnprocessable()
    }

    await browser.post('/login', { email: 'intruder@example.com', password: 'wrong' }).assertStatus(429)
  })
})
