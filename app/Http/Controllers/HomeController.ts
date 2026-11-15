import { Controller } from '@guren/core'

// The app root funnels into the drive: a guest chasing `/` lands on `/files`,
// whose auth middleware sends it to `/login`. `/files` is the one real path;
// there is no `/dashboard` anymore (2026-11-13).
export default class HomeController extends Controller {
  async index(): Promise<Response> {
    return this.redirect('/files')
  }
}
