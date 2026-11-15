import { Controller, ValidationException } from '@guren/core'
import { pages } from '@/.guren/pages.gen'

export default class LoginController extends Controller {
  async show(): Promise<Response> {
    const email = this.request.query('email') ?? ''
    return this.inertia(pages.auth.Login, { email }, { title: 'Login' })
  }

  async store(): Promise<Response> {
    const { email, password, remember } = this.validated('login.store').body

    this.auth.session()?.regenerate()

    const authenticated = await this.auth.attempt({ email, password }, remember)

    if (!authenticated) {
      throw ValidationException.withMessages({ message: 'Invalid credentials.' })
    }

    return this.redirect('/files')
  }

  async destroy(): Promise<Response> {
    await this.auth.logout()
    this.auth.session()?.invalidate()
    // Logging out must not bounce through a protected page: straight to the
    // sign-in card (TASKS 1.2 AC).
    return this.redirect('/login')
  }
}
