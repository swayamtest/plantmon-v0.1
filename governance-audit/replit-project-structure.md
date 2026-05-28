# PLANTMON — Replit Project Structure Governance Audit

**Scope:** Full workspace — all packages and artifacts  
**Type:** Read-only documentation  
**Generated:** May 2026  
**Purpose:** Governance-grade project structure reference for PLANTMON  

---

## 1 — TOP-LEVEL FOLDERS

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/` | Deployable application artifacts. Each sub-folder is an independently deployable unit registered with the Replit proxy router via `artifact.toml`. | YES |
| `artifacts/mobile/` | The PLANTMON React Native (Expo) mobile application. Primary product artifact. Contains all application source, SQL files, documentation, build tooling, and production server. | YES |
| `artifacts/api-server/` | Express API server scaffold. Currently a placeholder with no defined routes. Not consumed by the mobile artifact — mobile uses Supabase directly. | NO (currently dormant) |
| `artifacts/mockup-sandbox/` | Vite-based design canvas component preview server. Used for UI mockup exploration only. Independent from PLANTMON product. | NO (design tooling) |
| `lib/` | Shared TypeScript libraries consumed across workspace packages. All packages are composite (emit declarations via `tsc --build`). | DEPENDS ON PACKAGE |
| `lib/api-client-react/` | Generated React Query hooks from the OpenAPI spec. Scaffold only — no spec content defined. Declared as a dependency in `artifacts/mobile/package.json` but never imported by the mobile app. | NO |
| `lib/api-spec/` | OpenAPI specification source and Orval codegen configuration. Scaffold only — no API contract defined. | NO |
| `lib/api-zod/` | Zod validation schemas generated from the OpenAPI spec. Scaffold only — no content generated. | NO |
| `lib/db/` | Drizzle ORM schema and database client configuration. Targets the Express API server's PostgreSQL database. Not used by the mobile artifact (mobile uses Supabase directly). | NO |
| `scripts/` | Workspace-level utility scripts (`@workspace/scripts` package). Contains `post-merge.sh` (run after task agent merges) and a scaffold placeholder. | INFRA ONLY |
| `governance-audit/` | Read-only governance documentation. Not part of the application runtime. | NO |
| `.agents/` | Agent memory and skill files. Contains `memory/MEMORY.md`, topic files, and `.local/` skill definitions. Not part of the application runtime. | NO |
| `.local/` | Replit agent local state: skills, session plans, transcripts. Not committed to application source control. | NO |
| `attached_assets/` | Development prompt history and reference documents auto-attached by the Replit agent. Not runtime artifacts. Not in application source control. | NO |

---

## 2 — DATABASE-RELATED FOLDERS

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/` | Root of all PLANTMON database SQL, as the mobile app uses Supabase (not a local ORM). All DB-related files live here alongside application source. | YES |
| `lib/db/` | Drizzle ORM schema for the Express API server's PostgreSQL database. Contains `schema.ts`, `index.ts`, `drizzle.config.ts`. Completely separate from the Supabase database used by PLANTMON mobile. | NO (api-server only) |

### PLANTMON Mobile — Supabase Database Tables (as of Phase 2.1)

Live in Supabase (pre-migration-v2):

| Table | Purpose | Runtime-Critical |
|---|---|---|
| `plant_care_profiles` | Species-level care intelligence. Source of truth for watering frequency, light, humidity, difficulty, care methods. Admin-seeded. | YES |
| `plants` | User-owned plant instances. Holds display identity, optional species reference, placement, enrichment, and Phase 2.1 canonical fields (pending migration). | YES |
| `care_tasks` | Generated operational actions per plant. Drives watering scheduler. | YES |
| `care_logs` | Append-only record of completed care actions. Audit trail. | YES |
| `journal_entries` | Free-form user observation notes per plant. Not yet used by app UI. | NO (future) |
| `health_logs` | Plant health score history. Not yet used by app UI. | NO (future) |

Defined in SQL (pending migration via `supabase-migration-v2.sql`):

| Table | Purpose | Runtime-Critical |
|---|---|---|
| `canonical_species` | Permanent operational identity registry. Immutable `PLANT_0001`-format IDs. Central backbone of Phase 2.2 identity system. | YES (post-migration) |
| `plant_aliases` | Recognition and onboarding normalization layer. Maps common/regional names to canonical IDs. | YES (post-migration) |
| `collapse_mappings` | Operational normalization layer. Maps variant species inputs to one canonical identity. | YES (post-migration) |

---

## 3 — MIGRATION-RELATED FOLDERS AND FILES

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/supabase-migration-v2.sql` | **Phase 2.1 additive live-DB migration.** Adds 3 new tables (`canonical_species`, `plant_aliases`, `collapse_mappings`) and new columns to 5 existing tables. Safe to run on live DB. Idempotent (`IF NOT EXISTS` + `DROP/ADD CONSTRAINT` patterns). Status: PENDING EXECUTION on live Supabase. | YES — must run before Phase 2.2 |
| `artifacts/mobile/supabase-setup.sql` | **Full Phase 2.1 schema reset for fresh installs.** Starts with `DROP TABLE IF EXISTS … CASCADE` for all 9 tables. Contains 46 care profile seed rows using canonical enum values. **NEVER run on live DB** — for clean-slate dev installs only. | DEV ONLY |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | **Phase B2.0 runtime hardening migration.** Strictly additive. Adds indexes (UNIQUE partial, composite, GIN trigram, canonical), hardens RLS policy semantics (`WITH CHECK`), validates `species_name` UNIQUE constraint. Run after `supabase-migration-v2.sql`, before dataset seeding. | YES — must run before dataset seeding |
| `artifacts/mobile/LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | Phase B1.5A authoritative audit of the runtime compatibility synchronization layer. Documents all shims, deferred activation systems, and known remaining gaps. | REFERENCE |
| `artifacts/mobile/RUNTIME_TOPOLOGY_AUDIT_v1.md` | Phase B1.75 governance-grade implementation topology map. Complete file inventory, runtime coupling audit, scheduler evolution analysis, migration readiness assessment. | REFERENCE |
| `artifacts/mobile/RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` | Authoritative reference for actual implemented state (not aspirational). Documents live vs local schema divergence, all runtime data flows, and Section 9 migration readiness classification. | REFERENCE |
| `artifacts/mobile/SCHEMA_INVENTORY_v0.1.md` | Phase 1.5 schema inventory. Documents live DB state at that point. Partially stale post-B1.5A; useful as historical baseline. | REFERENCE |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` | Phase B2.0 migration report. Documents every operation, safety analysis, runtime impact, rollback procedure, and Phase 2.2 readiness. | REFERENCE |

### Migration Execution Sequence

```
supabase-setup.sql          → Fresh install only (never on live)
supabase-migration-v2.sql   → Phase 2.1 (PENDING — must run next)
PRE_DATASET_HARDENING_MIGRATION_v1.sql → Phase B2.0 (run after v2 migration)
[dataset seeding]           → Phase B2.1/B2.2 (canonical_species, aliases)
[Phase 2.2 code activation] → identity routing, shim removal
```

---

## 4 — SCHEDULER-RELATED FILES

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/types/plant.ts` | Defines `getDaysUntilWatering(plant)` and `needsWatering(plant)` — the core scheduler computation functions used by all UI components. Computes from `last_completed_at + frequency_days * ms`. **Known gap:** ignores stored `next_due_at`. | YES |
| `artifacts/mobile/hooks/usePlants.ts` | `useWaterPlant()` — the watering mutation. Inserts a `care_logs` row and updates `care_tasks` (`last_completed_at`, `next_due_at`). Also contains `useCreatePlant` which calls `generateDefaultCareTasks` to seed initial tasks. | YES |
| `artifacts/mobile/lib/careProfiles.ts` | Routing entry point for care intelligence. Contains `resolveSpeciesProfile()`, `generateDefaultCareTasks()`, `getEffectiveWateringFrequency()`, `getEffectiveFertilizingFrequency()`. Phase 2.2 canonical and alias lookup slots are present but commented out. Seasonal frequency routing slots present but inactive. | YES |
| `artifacts/mobile/app/(tabs)/index.tsx` | Home/Garden screen. Applies `needsWatering` and `getDaysUntilWatering` filters to render "Urgent", "Due Soon", and "All" plant filter views. Scheduler consumer. | YES |
| `artifacts/mobile/components/PlantCard.tsx` | Plant list item. Calls `getDaysUntilWatering` and `needsWatering` to render the watering countdown badge. Quick-water button calls `useWaterPlant`. | YES |
| `artifacts/mobile/components/WateringStatus.tsx` | Dashboard status summary chip (urgent / due soon / ok counts). Aggregates `needsWatering` and `getDaysUntilWatering` across all plants. Pure display — no mutations. | MEDIUM |
| `artifacts/mobile/app/plant/[id].tsx` | Plant detail screen. Displays watering schedule, last watered date, next due date. Uses `getWateringTask` and `getDaysUntilWatering`. | YES |

### Scheduler Architecture Summary

The scheduler is entirely **client-side and reactive**. There is no background worker, no server-side scheduling, and no push notification system. All watering urgency is computed on-demand at render time from `last_completed_at + frequency_days`. Seasonal scheduler infrastructure (seasonal frequency columns, `getEffectiveWateringFrequency` slots) is structurally prepared but not yet activated.

---

## 5 — ONBOARDING / SEARCH-RELATED FILES

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/app/(auth)/login.tsx` | Login screen. Calls `signIn(email, password)` from `AuthContext`. Manual length/presence validation only. | YES |
| `artifacts/mobile/app/(auth)/signup.tsx` | Signup screen. Calls `signUp(email, password)`. Password minimum 6 characters (hardcoded). | YES |
| `artifacts/mobile/app/(auth)/_layout.tsx` | Auth route group layout. Redirects authenticated users to the main tab navigator. One of three auth guard locations. | YES |
| `artifacts/mobile/app/plant/new.tsx` | New plant modal screen. The identity entry point — the first moment a species name enters the system. Renders `PlantForm`, calls `useCreatePlant`. | YES |
| `artifacts/mobile/components/PlantForm.tsx` | Create/edit plant form. Captures `display_name` (required), `species_name` (free text, optional), `user_entered_name` (Phase 2.1 field — captured but not yet persisted to DB), `room_location`, `notes`. No species autocomplete yet — planned for Phase 2.2. | YES |
| `artifacts/mobile/lib/careProfiles.ts` | Care profile resolution via `lookupBySpeciesNameIlike()` — the sole species-matching path currently. Returns `null` (silent default fallback) if no profile matches. Phase 2.2 will add alias and canonical lookup paths. | YES |
| `artifacts/mobile/lib/runtimeValidation.ts` | Pure runtime diagnostic utilities. `isReadyForCanonicalResolution()`, `getIdentityStatus()`, `getSchemaMigrationStatus()`. No mutations. Used for Phase 2.2 activation gating. | MEDIUM (utility) |

### Onboarding Species Resolution Flow (current)

```
User types species name (PlantForm)
  → user_entered_name captured in PlantInput (not yet persisted)
  → useCreatePlant strips Phase 2.1 fields (shim active)
  → INSERT plants with species_name only
  → generateDefaultCareTasks(plantId, species_name)
  → resolveSpeciesProfile({ species_name })
  → lookupBySpeciesNameIlike(species_name)  ← only active path
  → PlantCareProfile | null
  → getEffectiveWateringFrequency(profile)  ← 7 days default if null
  → INSERT care_tasks (watering [+ fertilizing if profile found])
```

Phase 2.2 will add alias and canonical lookup before the ilike fallback.

---

## 6 — SUPABASE-RELATED FILES

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/lib/supabase.ts` | Supabase client singleton. Initializes `@supabase/supabase-js` with `AsyncStorage` session persistence. **Note:** env vars are swapped — `EXPO_PUBLIC_SUPABASE_URL` holds the anon key and `EXPO_PUBLIC_SUPABASE_ANON_KEY` holds the URL. The file auto-detects this by checking which env var starts with `https://`. `detectSessionInUrl: false` for React Native compatibility. | YES |
| `artifacts/mobile/contexts/AuthContext.tsx` | Supabase auth state provider. Wraps the app in a React context exposing `session`, `user`, `loading`, `signIn`, `signUp`, `signOut`. Subscribes to `auth.onAuthStateChange`. Single source of auth truth. | YES |
| `artifacts/mobile/hooks/usePlants.ts` | All Supabase data operations for plants. Queries: `plants` (with `care_tasks` join via `select("*, care_tasks(*)")`), `care_tasks`, `care_logs`. Mutations: INSERT/UPDATE/DELETE plants, INSERT care_logs, UPDATE/INSERT care_tasks. | YES |
| `artifacts/mobile/lib/careProfiles.ts` | Supabase queries for `plant_care_profiles` (read-only via `ilike` lookup). Also writes `care_tasks` rows via `generateDefaultCareTasks`. Future: will query `plant_aliases`, `canonical_species`. | YES |
| `artifacts/mobile/lib/runtimeValidation.ts` | No Supabase queries. Pure TypeScript inspection of already-loaded data objects. | NO |
| `artifacts/mobile/supabase-migration-v2.sql` | SQL run directly in Supabase Dashboard SQL Editor. Defines the Phase 2.1 schema additions. | MIGRATION |
| `artifacts/mobile/supabase-setup.sql` | SQL for fresh Supabase project setup. Never run on live. | DEV ONLY |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | SQL run in Supabase Dashboard SQL Editor. Phase B2.0 hardening. | MIGRATION |

### Supabase Query Surface Map

| Table | Operations | File |
|---|---|---|
| `auth.users` | read (via auth API) | `contexts/AuthContext.tsx` |
| `plants` | SELECT `*, care_tasks(*)`, INSERT, UPDATE, DELETE | `hooks/usePlants.ts` |
| `care_tasks` | INSERT (via `generateDefaultCareTasks`), UPDATE (`last_completed_at`, `next_due_at`) | `hooks/usePlants.ts`, `lib/careProfiles.ts` |
| `care_logs` | INSERT (`plant_id`, `task_type`, `completed_at`) | `hooks/usePlants.ts` |
| `plant_care_profiles` | SELECT `*` via `ilike("species_name", …)` | `lib/careProfiles.ts` |
| `plant_aliases` | Not yet queried (table exists post-migration; Phase 2.2) | — |
| `canonical_species` | Not yet queried (table exists post-migration; Phase 2.2) | — |
| `collapse_mappings` | Not yet queried (table exists post-migration; Phase 2.2) | — |
| `journal_entries` | Not yet queried (table exists in Supabase) | — |
| `health_logs` | Not yet queried (table exists in Supabase) | — |

### Environment Variables

| Variable | Actual content (note: names are swapped) |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Holds the Supabase **anon key** (starts with `eyJ…`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Holds the Supabase **project URL** (starts with `https://`) |
| `SESSION_SECRET` | Session secret (api-server use) |

Detection: `lib/supabase.ts` checks `startsWith("https://")` to assign URL and anon key regardless of which env var holds which value.

---

## 7 — ORM / SCHEMA-RELATED FILES

### PLANTMON Mobile (Supabase — no ORM)

The PLANTMON mobile application does **not** use an ORM. It queries Supabase directly via the `@supabase/supabase-js` client. Schema is defined in SQL files only.

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/supabase-setup.sql` | Full Phase 2.1 schema definition: 9 tables, all constraints, RLS policies, indexes, `updated_at` trigger, 46 care profile seed rows. Fresh-install only. | DEV ONLY |
| `artifacts/mobile/supabase-migration-v2.sql` | Additive schema migration for live DB. Sections A–F: new tables, column additions, constraint expansions. Idempotent. | MIGRATION |
| `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` | Post-Phase-2.1 schema hardening: indexes, RLS corrections, constraint guard. Idempotent. | MIGRATION |

### API Server (Drizzle ORM — separate from PLANTMON mobile)

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `lib/db/schema.ts` | Drizzle ORM table definitions for the Express API server's PostgreSQL database. Completely separate from the Supabase database. | NO (api-server only) |
| `lib/db/index.ts` | Drizzle database client instantiation using `DATABASE_URL` env var. | NO (api-server only) |
| `lib/db/drizzle.config.ts` | Drizzle Kit configuration for schema push (`pnpm --filter @workspace/db run push`). | NO (api-server only) |

---

## 8 — TYPESCRIPT DATABASE TYPE FILES

| Path | Purpose Summary | Runtime-Critical |
|---|---|---|
| `artifacts/mobile/types/plant.ts` | **Primary domain type file.** Defines all runtime types: `Plant`, `PlantInput`, `PlantCareProfile`, `CareTask`, `CareLog`, `JournalEntry`, `HealthLog`. Defines scheduler utilities `getDaysUntilWatering()` and `needsWatering()`. Also defines `getWateringTask()`, `getFertilizingTask()`. Contains legacy/compat union types (`LightRequirementAny`, `DifficultyLevelAny`, `TaskTypeLegacy`) for dual-value enum tolerance during migration. | YES |
| `artifacts/mobile/types/canonical.ts` | **Centralized enum governance file.** Authoritative source for all governed enumerations: `SpeciesResolutionMethod`, `AliasType`, `IdentityStatus`, `TaskType`, `TaskTypeLegacy`, `LightRequirement`, `LightRequirementLegacy`, `HumidityPreference`, `DifficultyLevel`, `DifficultyLevelLegacy`, `WateringMethod`, `FertilizingMethod`, `RepottingMethod`, `CareTaskStatus` (defined but no DB column yet). | YES |
| `artifacts/mobile/lib/runtimeValidation.ts` | **Runtime diagnostic type utilities.** 10 pure functions for inspecting `Plant`, `CareTask`, `PlantCareProfile` instances against Phase 2.1/2.2 readiness criteria. No Supabase queries. No mutations. Intended for Phase 2.2 activation gating. | MEDIUM |
| `lib/api-zod/` | Zod validation schemas generated from the OpenAPI spec via Orval codegen. Scaffold only — no spec content; no generated output yet. Used by the Express API server, not by mobile. | NO |
| `lib/db/schema.ts` | Drizzle ORM table schema definitions using `drizzle-orm/pg-core`. Separate from PLANTMON mobile types. | NO (api-server only) |

### Type Governance Notes

**`types/plant.ts` — `Plant` interface column name mismatch:**  
The schema freeze document calls the user-facing plant name field `plant_name`. The live Supabase DB column and all application code use `display_name`. This divergence is intentional and preserved for backward compatibility during migration phases. The migration does not rename the column.

**`types/canonical.ts` — `CareTaskStatus` forward declaration:**  
`CareTaskStatus = "pending" | "completed" | "skipped" | "overdue"` is defined and exported but no DB column currently uses it. The live `care_tasks` table uses `active_status BOOLEAN` only. `CareTaskStatus` is a forward-declared type for a future task lifecycle system.

**Dual-value enum compat pattern:**  
Legacy enum values (`easy`, `hard`, `low`, `medium`, `full_sun`) and canonical Phase 2.1 values (`beginner`, `advanced`, `low_light`, `medium_indirect`, `direct_sun`) coexist as union types (`LightRequirementAny`, `DifficultyLevelAny`). The Phase 2.1 migration expands DB CHECK constraints to accept both. This dual-acceptance is intentional and remains until a future enum backfill pass normalizes all legacy rows to canonical values.

---

## APPENDIX — COMPLETE FILE COUNTS BY CATEGORY

| Category | File Count |
|---|---|
| Application screens (`app/`) | 8 |
| UI components (`components/`) | 6 |
| Hooks (`hooks/`) | 2 |
| Library modules (`lib/`) | 3 |
| Type definitions (`types/`) | 2 |
| Constants | 1 |
| Context providers | 1 |
| SQL migration files | 3 |
| SQL documentation/reports | 5 |
| Build + server infrastructure | 3 |
| Configuration files | 6 |
| Workspace root infra | 7 |
| Separate artifact files (api-server, mockup-sandbox) | 9 |
| Shared library scaffolds (api-client-react, api-zod, db) | 9 |
| Generated (`.expo/`) | 4 |
| Governance audit | this file |

---

*This document is read-only governance documentation. It reflects the project state as of Phase B2.0. No files were modified in its generation.*
