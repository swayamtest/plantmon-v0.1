# Plant Manager — `plantmon-v0.1`

A React Native (Expo) mobile app for personal plant care tracking.
Built with Supabase (auth + database), TanStack Query, and a forest-green UI.

---

## Architecture snapshot — v0.1

This tag represents a stable checkpoint before upcoming schema migrations,
onboarding refactors, and runtime scheduling work.

### What's in this snapshot

| Layer | Status |
|---|---|
| Auth (email/password, Supabase) | ✅ Stable |
| Route guards (`(auth)` / `(tabs)` layouts) | ✅ Stable |
| Core schema — 5 tables with RLS + indexes | ✅ Canonical |
| `plants` CRUD (list, detail, create, update, delete) | ✅ Operational |
| Care intelligence — `plant_care_profiles` (46 species) | ✅ Seeded |
| Auto-scheduling on plant creation (deterministic) | ✅ Operational |
| Watering action → `care_logs` + `care_tasks` sync | ✅ Operational |
| Error handling (create + edit forms) | ✅ Stable |

### Database schema (5 tables)

```
plant_care_profiles  — shared species-level care defaults (46 seeds)
plants               — user's plant inventory
care_tasks           — recurring schedules (watering, fertilizing, …)
care_logs            — immutable history of completed care actions
journal_entries      — free-form plant notes
health_logs          — health score history (1 Critical → 5 Thriving)
```

---

## Stack

- **Runtime**: Node.js 24, TypeScript 5.9
- **Mobile**: Expo SDK (React Native), Expo Router v6
- **Auth + DB**: Supabase (PostgreSQL + RLS)
- **State / data**: TanStack Query v5
- **Monorepo**: pnpm workspaces

## Project structure

```
artifacts/
  mobile/           # Expo app (main product)
    app/            # Expo Router file-based routes
    components/     # Shared UI components
    hooks/          # TanStack Query hooks
    lib/            # Supabase client, careProfiles logic
    types/          # Domain types
    contexts/       # AuthContext
    supabase-setup.sql  # Full schema migration (run in Supabase SQL Editor)
lib/                # Shared TypeScript libraries
scripts/            # Utility scripts
```

## Getting started

1. Create a Supabase project and disable email confirmation (Auth → Providers → Email)
2. Set env vars in Replit Secrets:
   - `EXPO_PUBLIC_SUPABASE_URL` — your project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — your anon key
3. Run `artifacts/mobile/supabase-setup.sql` in Supabase SQL Editor
4. `pnpm install`
5. Start the app: `pnpm --filter @workspace/mobile run dev`

## Upcoming (post v0.1)

- Recurring scheduling engine
- Push notifications for due tasks
- Onboarding flow improvements
- Supabase schema normalization
- Frontend restructuring

---

*Snapshot tag: `v0.1` — May 2026*
