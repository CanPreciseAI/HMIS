# CanPreciseAI

CanPreciseAI is a TanStack Start application with Supabase Auth and Postgres.
The HMIS schema is defined by the SQL files in `drizzle/migrations` and is
based on the accompanying HMIS design detail document.

## Use your own Supabase project

1. Create a Supabase project in your account, or select a project you own.
2. Copy `.env.example` to `.env.local` and set the project URL, publishable
   key, and database connection string from that project's settings.
3. Use the project's session-pooler connection string for `SUPABASE_DB_URL`
   when your network cannot reach its direct database host.
4. Apply the schema with `npm run db:apply`. Add demo records separately with
   `npm run db:seed` if needed.
5. Run `npm run dev`.

The included migrations create the HMIS tables and backend workflows described
in the design document. The document identifies several clinical, merge, and
accounting rules as proposed defaults that still require your organization's
approval; applying schema does not establish those policies for you.

Never expose the database connection string, a Supabase secret key, or a
service-role key in browser code or commit them to source control. The
`VITE_SUPABASE_PUBLISHABLE_KEY` is public and must be protected by the
database's row-level security policies.

## Local checks

```sh
npm install
npm test
npx tsc --noEmit
npm run build
```

The production build targets Cloudflare Workers through Nitro. Supabase is the
application backend; it is independent of the frontend hosting provider.
