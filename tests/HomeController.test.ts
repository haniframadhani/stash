import { beforeAll, describe, it } from 'bun:test'
import { TestApp } from '@guren/testing'
import app from '../src/app.js'

// Boots the real src/app.ts so tests share its configuration.
describe('app', () => {
  let http: TestApp

  beforeAll(async () => {
    http = await TestApp.fromApp(app)
  })

  it('funnels the app root into the drive', async () => {
    await http.get('/').assertRedirect('/files')
  })

  it('answers the health check', async () => {
    await http.get('/health').assertOk()
  })
})
