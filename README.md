# brixa-web

The staff web app for Brixa HMIS, a hospital management system for Kenyan Level 4 hospitals. The API and every domain rule live in [`brixa-api`](https://github.com/mwakunin/brixa-api); this app is its screens.

Read `CLAUDE.md` before changing anything. It holds the conventions the screens follow and where the work stands.

## Running it

```sh
pnpm install
cp .env.example .env.local
pnpm dev          # http://localhost:3000
```

The API must be running (`pnpm dev` in `brixa-api`, port 9999) with its `APP_URL` set to this app's origin, which is its default.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | The development server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Route types, then `tsc` |
| `pnpm test` | Vitest, on the plain functions |
| `pnpm build` | A production build |
| `pnpm codegen` | Regenerates `src/lib/api/schema.d.ts` from the running API's `/doc` |
