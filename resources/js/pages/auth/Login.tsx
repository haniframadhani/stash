import { Head } from '@inertiajs/react'
import { Cloud } from 'lucide-react'
import { useRouteForm } from '@guren/inertia-client/forms'
import { loginStoreForm } from '@/.guren/forms.gen'
import { Field } from '@/resources/js/components/ui/Field'
import { Button } from '@/resources/js/components/ui/Button'
import type { ValidationErrors } from '@guren/core'

interface Props {
  email?: string
  errors?: ValidationErrors<'email' | 'password'>
}

// The sign-in card (UI_SPEC §9): email and password only — no register and no
// forgot-password link, because the single seeded owner has no way to use them.
export default function Login({ email = '', errors = {} }: Props) {
  // Shows a redirect-back's field errors even when this form did not make the visit.
  const form = useRouteForm(loginStoreForm, { email, password: '', remember: false }, { adoptPageErrors: true })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-g-page px-4 font-sans text-sm text-g-text">
      <Head title="Sign in" />
      <section className="w-full max-w-sm rounded-g-card border border-g-line bg-g-panel p-8 shadow-g-card">
        <p className="flex items-center justify-center gap-2 text-lg font-bold text-g-heading">
          <Cloud className="h-6 w-6 text-g-accent" aria-hidden />
          Stash
        </p>
        <h1 className="mt-6 text-center text-xl font-bold text-g-heading">Sign in</h1>
        <p className="mt-1 text-center text-g-text-2">Use your account credentials to continue.</p>

        {errors.message && (
          <p className="mt-4 rounded-g-ctl border border-g-danger-chip bg-g-danger-tint px-3 py-2 text-g-danger" role="alert">
            {errors.message}
          </p>
        )}

        <form method="post" action={loginStoreForm.path} className="mt-6 space-y-4" onSubmit={form.handleSubmit}>
          <Field form={form} name="email" />
          <Field form={form} name="password" as="password" />
          <Field form={form} name="remember" label="Remember me" />
          <Button type="submit" disabled={form.processing} block>
            Sign in
          </Button>
        </form>
      </section>
    </div>
  )
}
