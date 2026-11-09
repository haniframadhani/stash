# File Management S3

## Overview

A fullstack TypeScript application built with the Guren framework (Laravel-inspired, running on Bun).

## AI Agents: Start Here

Before exploring `node_modules`, use the built-in introspection commands:

```bash
bunx guren context         # project map: models, routes, controllers, pages (add --json for JSON)
bunx guren context User    # everything about one entity: model, routes, pages, linked docs — start entity work here
bunx guren check           # validate route ↔ controller ↔ page consistency, doc links, and spec freshness — run after changes
bunx guren docs:graph --path <file>  # which docs govern this file, which spec views derive from it — ask BEFORE renaming/moving
bunx guren codegen         # regenerate .guren/*.gen.ts typed manifests (also runs via `bun run dev`)
bunx guren spec:generate   # regenerate docs/spec/ views (ER, domain, screens, modules) after schema/model/route changes
bunx guren make:adr "..."  # record an architecture decision under docs/adr/ (--entity <Model> links it)
```

## Session Workflow

Nothing runs these steps for you automatically (hook support varies by agent),
so make them part of your loop:

1. **At session start**, run `bunx guren context` and read the output. It ends
   with a "Guren API Signatures" digest of the ORM, controller, and testing
   APIs — read it before writing any code. With the MCP server connected, the
   `guren_get_context` tool returns the same map.
2. **After editing** routes, controllers, models, `db/schema.ts`, or pages,
   run `bunx guren check` and fix what it reports before moving on. With an
   `.oxlintrc.json` in the app (`bunx guren add lint`), run `bun run lint` on
   what you edited as well; its warnings are for you to act on.
3. **When the change is complete**, run `bunx guren gate` and fix what it
   reports until it exits 0. It runs the stages CI runs — codegen, typecheck,
   lint, `check`, `audit`, and the test suite — and a change is not done
   while any of them fails. `--changed` narrows `check` and lint to the files
   you touched. Cursor and Codex run it for you from a stop hook
   (`.cursor/hooks.json`, `.codex/hooks.json`) when a turn ends with
   uncommitted changes, feeding the findings back into the turn (Codex asks
   you to trust the hook once, via `/hooks`; Cursor reads the config from the
   workspace root, so open the app as its own workspace); Copilot and
   OpenCode have no such hook, so run it yourself. The hook also reports
   `audit` warnings on files you changed (a mutating action with no
   authorization, request data in a force write), which never fail the gate. The same hook verifies the
   plan step `bunx guren plan:next` marked (`plan-implement` skill); without
   it, run `bunx guren plan:verify <plan> --step <id>` yourself before
   committing the step.
4. Framework-managed files (`.agents/rules/`, `.agents/skills/`) can be
   refreshed anytime with `bunx guren agent:sync`.

Reusable skills (SKILL.md, the Agent Skills format) live in
`.agents/skills/` — agents that support the standard discover them there
automatically.

Detailed, verified API rules live in `.agents/rules/*.md`; each file's `paths`
frontmatter states which paths it covers — read the matching rule before
editing those paths.

The rule files: `orm-models.md` (models, mass assignment, queries that bite),
`controllers-http.md` (validation, Inertia, auth), `routes-codegen.md`
(registering routes, codegen), `testing.md` (TestApp, assertions, common
mistakes), `docs-and-spec.md` (docs under `docs/`), `comments.md` (what a
comment may carry), `ui.md` (design tokens and the red budget on pages).
Most end with what their full reference under
`.agents/skills/guren-api/reference/` adds; read that file only when the task
needs it. For framework signatures, check the `guren context` digest first,
then the matching rule; only read `node_modules/@guren/*` for APIs neither covers.

## Project Structure

```
app/
├── Http/
│   ├── Controllers/    # Request handlers
│   ├── Middleware/      # HTTP middleware
│   └── Resources/       # API resource transformers
├── Models/              # Drizzle ORM models
├── Events/              # Event classes
├── Listeners/           # Event listeners
├── Jobs/                # Queue job classes
├── Mail/                # Mailable classes
├── Notifications/       # Notification classes
├── Providers/           # Service providers
├── Exceptions/          # Custom exceptions
└── Console/Commands/    # CLI commands
bin/
└── serve.ts             # Server entry point
config/                  # Application configuration
db/
├── schema.ts            # Drizzle table definitions
├── migrations/          # SQL migration files
├── factories/           # Model factories
└── seeders/             # Database seeders
resources/js/
├── pages/               # Inertia.js React pages
├── components/          # Shared React components
└── layouts/             # Page layouts
routes/
├── web.ts               # Web routes
└── api.ts               # API routes (if applicable)
tests/
├── controllers/         # Controller tests
└── models/              # Model tests
```

## Development Commands

```bash
# Start development server
bun run dev

# Generate components
bunx guren make:controller <Name>
bunx guren make:model <Name>
bunx guren make:migration <name>
bunx guren make:view <path>
bunx guren make:middleware <Name>
bunx guren make:job <Name>
bunx guren make:event <Name>
bunx guren make:listener <Name> --event=<EventName>
bunx guren make:mail <Name>
bunx guren make:test <Name>

# Growing past a flat app/? Scaffold a self-contained module:
bunx guren make:module <Name>                    # modules/<name>/{index.ts,routes.ts,db/schema.ts}, wired into src/app.ts
bunx guren make:controller <Name> --module <name> # most make:* commands accept --module

# Database workflow: edit db/schema.ts first, then
bunx guren make:migration <name>   # generate SQL migration via drizzle-kit into db/migrations/
bun run db:migrate                 # apply pending migrations; refuses a drop, narrowing or rename without
                                   # `-- guren:allow-destructive: <reason>` (ask the user first; db-manage skill)
bunx guren db:status               # show applied/pending state
bun run db:seed                    # run seeders
# Migrations are forward-only (no rollback). Dev reset: bunx guren db:reset --seed

# Build & test
bun run build
bun run test
bunx guren gate                    # every CI stage (codegen, typecheck, lint, check, audit, test); exit 0 = done
```

Implementation plans: the `plan-write` and `plan-implement` skills. A plan is
built only after a person approves it, so before writing one read step 0 of
`plan-write`, which says what to do in a session nobody approves from (a
non-interactive run, a request that says nobody will review). Browser
verification: the `verify-in-browser` skill. Each lists its own commands.

## MCP Server (AI Agent Integration)

`bun run dev` serves an MCP endpoint at `http://localhost:3333/_guren/mcp`
(loopback only; `GUREN_MCP=1` in the `dev` script). Its tools mirror the CLI
(`guren_get_context`, `guren_check`, `guren_gate`, …); the `dev-workflow` skill
lists them.

## Architecture Overview

`routes/web.ts` registers routes on a `Router`, each pointing at a
`[Controller, 'method']` tuple. A route's Zod `body`/`query`/`params` schemas are
validated before the action (422) and feed `bunx guren codegen`. Controllers read
`this.validated('<route name>')`, query models and render Inertia pages or JSON.
The signatures are in the `guren context` digest; each file kind's rules attach
from `.agents/rules/` when you open it.

## Testing

`bun:test` + `@guren/testing`; requests run in-process through `TestApp`, no
server. Rules: `.agents/rules/testing.md`.

## Key Files

| Path | Purpose |
|------|---------|
| `.agents/rules/` | Verified API rules (each file's `paths` frontmatter states the covered paths) |
| `.agents/skills/guren-api/reference/` | The full API reference behind each rule, read on demand |
