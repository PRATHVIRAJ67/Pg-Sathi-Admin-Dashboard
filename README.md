# Pg Sathi admin

The owner dashboard for Pg Sathi. PG owners sign up, set up their business,
and manage everything from one place: properties, rooms and beds, residents,
monthly rent, payments, deposits, expenses and reports.

Built with React 19, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Query
and Supabase.

## Run it

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Without Supabase settings the app runs in **demo mode**: the real database
schema runs in your browser with fictional sample data, and nothing is sent to
a server. Open the sample workspace with `owner@demo.pgsaas.local` /
`demo-owner-2026`, or sign up as a new owner to go through onboarding.

## Connect Supabase

1. Create a Supabase project. Apply the files in `supabase/migrations` in
   filename order, then run `supabase/seed.sql` (it creates subscription
   plans only).
2. In Authentication settings, turn on **Confirm email**. Add
   `<your-url>/auth/callback` and `<your-url>/reset-password` as redirect
   URLs.
3. Copy `.env.example` to `.env` and fill in:

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable/anon key>
   ```

   Use only the public (anon) key. The app refuses to start with a secret key.

## Build

```bash
npm run build      # type-check and production build into dist/
npm run preview
```

Production builds need the Supabase variables, unless you set
`VITE_ENABLE_DEMO=true` for a public demo.

## Layout

| Path | Contents |
| --- | --- |
| `src/` | The dashboard (`src/features/*` per area, `src/app/*` for auth, routing and backend) |
| `packages/` | Shared code: domain types and money utilities, validation, API client, UI kit, design tokens, in-browser demo database |
| `supabase/` | Database migrations (schema, Row Level Security, API functions) and the plans seed |

The database is shared with the Pg Sathi super-admin and mobile apps. All of
them must use the same Supabase project and the same migrations.
