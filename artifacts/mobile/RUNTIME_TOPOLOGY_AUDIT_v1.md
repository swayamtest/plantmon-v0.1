# RUNTIME TOPOLOGY AUDIT v1
## Phase B1.75 — Implementation Topology + Architecture Scrub

**Scope:** Entire PLANTMON Replit codebase  
**Purpose:** Governance-grade runtime architecture audit  
**Generated:** May 2026  
**Status:** Authoritative implementation topology map  

---

## SECTION 1 — COMPLETE FILE INVENTORY

### 1.1 Mobile Artifact — Application Source Files

| filepath | runtime_role | category | criticality | active_status | migration_coupled | schema_coupled | identity_coupled | scheduler_coupled | onboarding_coupled | future_activation | deletion_safe | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `app/_layout.tsx` | Root layout — providers, font loading, QueryClient, stack navigator | runtime-critical | HIGH | active | no | no | no | no | no | no | no | AuthProvider, QueryClientProvider, ErrorBoundary, GestureHandlerRootView all wired here. Font gate blocks render until Inter fonts load. |
| `app/index.tsx` | Auth redirect gate | runtime-critical | HIGH | active | no | no | no | no | no | no | no | Reads `session` + `loading` from AuthContext. Redirects to `/(auth)/login` or `/(tabs)`. Thin — logic in AuthContext. |
| `app/(auth)/_layout.tsx` | Auth route group layout + redirect guard | runtime-critical | MEDIUM | active | no | no | no | no | no | no | no | DUPLICATE auth guard: redirects authenticated users to `/(tabs)`. Also covered by `app/index.tsx`. |
| `app/(auth)/login.tsx` | Login screen | onboarding-critical | HIGH | active | no | no | no | no | yes | no | no | Calls `signIn()` from AuthContext. No form validation library — manual length/presence check only. |
| `app/(auth)/signup.tsx` | Signup screen | onboarding-critical | MEDIUM | active | no | no | no | no | yes | no | no | Calls `signUp()`. Password min-length is 6 chars (hardcoded). Uses `accent` color, not `primary` — intentional visual distinction. |
| `app/(tabs)/_layout.tsx` | Tab navigator + auth guard | runtime-critical | HIGH | active | no | no | no | no | no | no | no | THIRD duplicate auth guard (session → replace `/(auth)/login`). Tab bar uses BlurView on iOS. |
| `app/(tabs)/index.tsx` | Home/Garden screen — plant list, filter, WateringStatus | runtime-critical | HIGH | active | no | yes | no | yes | no | no | no | Filter logic uses `needsWatering` + `getDaysUntilWatering` from types/plant.ts. "Due soon" = ≤2 days. Direct dependency on scheduler state via `getDaysUntilWatering`. |
| `app/(tabs)/profile.tsx` | Profile screen — user stats, sign out | UI-only | LOW | active | no | no | no | no | no | no | no | Displays plant count + `needsWatering` count. No write operations beyond signOut. |
| `app/plant/[id].tsx` | Plant detail screen — view, edit, water, delete | runtime-critical | HIGH | active | no | yes | no | yes | no | no | no | Uses `usePlant`, `useDeletePlant`, `useWaterPlant`, `useUpdatePlant`. Shows watering schedule. Inline edit mode via `PlantForm`. Error banner on update failure. |
| `app/plant/new.tsx` | New plant modal screen | onboarding-critical | HIGH | active | no | yes | yes | yes | yes | no | no | Calls `useCreatePlant` → `generateDefaultCareTasks`. This is the identity entry point — first time `species_name` enters the system. |
| `app/+not-found.tsx` | 404 fallback screen | utility-only | LOW | active | no | no | no | no | no | no | no | Expo Router standard scaffold. Uses `useColors`. |
| `components/PlantCard.tsx` | Plant list item — name, species, watering badge, quick-water | runtime-critical | HIGH | active | no | yes | no | yes | no | no | no | Calls `getDaysUntilWatering` + `needsWatering`. Quick-water button calls `useWaterPlant`. Navigates to `plant/[id]` on press. |
| `components/PlantForm.tsx` | Create/edit plant form | onboarding-critical | HIGH | active | no | yes | yes | no | yes | yes | no | Captures `display_name`, `species_name`, `user_entered_name` (Phase 2.1 — passed but not yet DB-persisted), `room_location`, `notes`. No species autocomplete yet. user_entered_name is now populated as Phase 2.1 compat layer. |
| `components/WateringStatus.tsx` | Dashboard status summary (urgent/soon/ok counts) | UI-only | MEDIUM | active | no | no | no | yes | no | no | no | Computed from `needsWatering` + `getDaysUntilWatering` across all plants. Pure display — no mutations. |
| `components/ErrorBoundary.tsx` | React class error boundary | infra-only | MEDIUM | active | no | no | no | no | no | no | no | Class component required by React error boundary API. Wraps entire app in `_layout.tsx`. |
| `components/ErrorFallback.tsx` | Error fallback UI with stack trace viewer | infra-only | MEDIUM | active | no | no | no | no | no | no | no | Dev-only stack trace modal via `__DEV__`. Calls `reloadAppAsync()` for restart. |
| `components/KeyboardAwareScrollViewCompat.tsx` | Platform-aware keyboard scroll wrapper | utility-only | LOW | active | no | no | no | no | no | no | no | Web gets plain ScrollView; native gets KeyboardAwareScrollView. Used by PlantForm only. |
| `contexts/AuthContext.tsx` | Supabase auth state provider | Supabase-critical | HIGH | active | no | no | no | no | no | no | no | Exposes `session`, `user`, `loading`, `signIn`, `signUp`, `signOut`. Subscribes to `onAuthStateChange`. Single source of auth truth. |
| `hooks/usePlants.ts` | All plant CRUD mutations + watering | runtime-critical | HIGH | active | yes | yes | yes | yes | no | yes | no | Contains Phase 2.1 compat shims (4-field destructuring). `PLANT_SELECT = "*, care_tasks(*)"`. `useCreatePlant` calls `generateDefaultCareTasks` after insert. Post-migration activation markers present. |
| `hooks/useColors.ts` | Color scheme/theme hook | utility-only | LOW | active | no | no | no | no | no | no | no | Returns `colors.light` or `colors.dark` based on `useColorScheme()`. Falls back to light. |
| `lib/careProfiles.ts` | Care profile resolution + task generation (routing layer) | scheduler-critical | HIGH | active | yes | yes | yes | yes | yes | yes | no | Routing entry point `resolveSpeciesProfile()`. Phase 2.2 canonical/alias slots commented out. `getEffectiveWateringFrequency()` seasonal slot present. `lookupCareProfile()` preserved as compat wrapper. |
| `lib/runtimeValidation.ts` | Pure runtime inspection utilities | utility-only | LOW | active | yes | yes | yes | no | no | yes | no | 10 pure functions. No mutations. Identity status, migration detection, Phase 2.2 gate checks. No Supabase queries. |
| `lib/supabase.ts` | Supabase client singleton | Supabase-critical | HIGH | active | no | no | no | no | no | no | no | Auto-detects swapped env vars by `https://` prefix test. AsyncStorage session persistence. `detectSessionInUrl: false` for RN. |
| `types/canonical.ts` | Centralized enum governance | identity-critical | HIGH | active | yes | yes | yes | no | no | yes | no | Authoritative source for all enums. `SpeciesResolutionMethod`, `AliasType`, `TaskType`, `TaskTypeLegacy` etc. `CareTaskStatus` defined but NO DB column uses it. |
| `types/plant.ts` | All domain types | runtime-critical | HIGH | active | yes | yes | yes | yes | no | yes | no | `Plant`, `PlantInput`, `PlantCareProfile`, `CareTask`, `CareLog`, `JournalEntry`, `HealthLog`. Helper functions `getDaysUntilWatering`, `needsWatering`. display_name ≠ plant_name (legacy column name retained). |
| `constants/colors.ts` | Design token palette | UI-only | LOW | active | no | no | no | no | no | no | no | Forest-green theme. Both `light` and `dark` palettes defined. Splash background `#F7FAF8` matches light background. |

---

### 1.2 Mobile Artifact — Infrastructure Files

| filepath | runtime_role | category | criticality | active_status | migration_coupled | schema_coupled | deletion_safe | notes |
|---|---|---|---|---|---|---|---|---|
| `app.json` | Expo app config — name, slug, plugins, experiments | infra-only | HIGH | active | no | no | no | `newArchEnabled: true`. React Compiler experiment enabled. expo-router plugin sets `origin: "https://replit.com/"`. |
| `babel.config.js` | Babel transpilation config | infra-only | MEDIUM | active | no | no | no | Minimal — expo preset + `unstable_transformImportMeta`. |
| `metro.config.js` | Metro bundler config | infra-only | MEDIUM | active | no | no | no | Minimal — default Expo config. No custom resolvers. |
| `tsconfig.json` | TypeScript compiler config | infra-only | MEDIUM | active | no | no | no | `strict: true`. `baseUrl: "."`. `@/*` alias maps to root. References `@workspace/api-client-react` (UNUSED — see Section 3). |
| `package.json` | Dependencies + scripts | infra-only | HIGH | active | no | no | no | `@workspace/api-client-react: workspace:*` declared but never imported. See Section 3. |
| `.replit-artifact/artifact.toml` | Replit artifact routing + deployment config | infra-only | HIGH | active | no | no | no | `router: "expo-domain"`. Dev runs Metro on port 18115. Prod: `build.js` → `serve.js`. |
| `expo-env.d.ts` | Expo Router type declarations | infra-only | LOW | active | no | no | no | Auto-generated by Expo. Contains typed route declarations. DO NOT edit manually. |
| `assets/images/icon.png` | App icon | infra-only | LOW | active | no | no | no | Used as splash screen and favicon. Default placeholder. |
| `.gitignore` | Git exclusion rules | infra-only | LOW | active | no | no | no | Should cover `node_modules/`, `static-build/`, `.expo/`, `.env*`. |

---

### 1.3 Mobile Artifact — Build + Production Server

| filepath | runtime_role | category | criticality | active_status | deletion_safe | notes |
|---|---|---|---|---|---|---|
| `scripts/build.js` | Production build orchestration — Metro → static bundle → manifests | automation-critical | HIGH | active | no | Starts Metro, downloads iOS+Android bundles, extracts assets, rewrites URLs for deployment domain, outputs `static-build/`. Complex domain detection logic for Replit deployment. |
| `server/serve.js` | Production static server — manifest routing, landing page, file serving | automation-critical | HIGH | active | no | Zero-dependency Node.js http server. Routes: expo-platform header → manifest JSON; `/` without header → landing page; everything else → static files. Reads `static-build/`. |
| `server/templates/landing-page.html` | Expo "open in app" landing page template | automation-critical | MEDIUM | active | no | Template with `BASE_URL_PLACEHOLDER`, `EXPS_URL_PLACEHOLDER`, `APP_NAME_PLACEHOLDER`. Rendered by serve.js at request time. 461 lines — includes QR code and deep-link logic. |

---

### 1.4 Mobile Artifact — SQL Files

| filepath | runtime_role | category | criticality | active_status | migration_coupled | deletion_safe | notes |
|---|---|---|---|---|---|---|---|
| `supabase-migration-v2.sql` | Phase 2.1 additive live-DB migration | migration-critical | HIGH | PENDING_EXECUTION | yes | no | Sections A–F. Idempotent (IF NOT EXISTS + DROP CONSTRAINT patterns). Adds 3 new tables + columns to 5 existing tables. Safe to run on live DB. MUST be run before Phase 2.2. |
| `supabase-setup.sql` | Full Phase 2.1 schema reset (dev only) | migration-critical | HIGH | dormant | yes | no | Starts with `DROP TABLE IF EXISTS … CASCADE` for all 9 tables. NEVER run on live DB — for fresh installs only. Contains 46 care profile seed rows. |

---

### 1.5 Mobile Artifact — Documentation Files

| filepath | category | active_status | deletion_safe | notes |
|---|---|---|---|---|
| `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | migration-critical | active | no | Phase B1.5A authoritative compatibility record. Post-migration activation checklist. DO NOT modify before migration is confirmed. |
| `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` | migration-critical | active | no | 9-section authoritative reference: actual implemented state, aspirational schema, Section 9 classifies migration as READY. |
| `SCHEMA_INVENTORY_v0.1.md` | migration-critical | active | no | Phase 1.5 audit. Documents live DB state at that point. May be partially stale post-B1.5A. |

---

### 1.6 Expo Generated Files (Not Source)

| filepath | category | active_status | deletion_safe | notes |
|---|---|---|---|---|
| `.expo/devices.json` | generated | active | yes | Expo dev tools device registry. Regenerated on each `expo start`. Should be in `.gitignore`. |
| `.expo/README.md` | generated | active | yes | Expo-generated README for the `.expo/` directory. Safe to delete. |
| `.expo/types/router.d.ts` | generated | active | no | Typed route declarations generated by `expo-router` from the `app/` file structure. Must not be manually edited; do not delete. |
| `.expo/web/cache/…/favicon-48.png` | generated | dormant | yes | Expo web cache artifact. Safe to delete; regenerated on next web build. |

---

### 1.7 Workspace Root Files

| filepath | category | active_status | deletion_safe | notes |
|---|---|---|---|---|
| `package.json` | infra-only | active | no | Root workspace — shared dev tooling (TypeScript, Prettier, ESLint, Vitest). |
| `pnpm-workspace.yaml` | infra-only | active | no | Package discovery. Catalog pins for React, react-dom, @tanstack/react-query, zod. |
| `tsconfig.json` | infra-only | active | no | Root TS solution file for composite libs (api-client-react, api-zod, db). Leaf artifacts NOT included. |
| `tsconfig.base.json` | infra-only | active | no | Shared strict TS base. Mobile artifact uses `expo/tsconfig.base` instead. |
| `replit.md` | infra-only | active | no | Project README + user preferences. |
| `.replit` | infra-only | active | no | Replit environment config. |
| `README.md` | infra-only | active | yes | Workspace scaffold README — effectively empty for this project. |
| `scripts/post-merge.sh` | infra-only | active | no | Post-merge setup script run after task agent merges. |
| `scripts/src/hello.ts` | stale | dormant | yes | Scaffold placeholder script. No content of value. |

---

### 1.8 Separate Artifacts (Not PLANTMON)

| artifact | category | active_status | notes |
|---|---|---|---|
| `artifacts/api-server/` | infra-only | dormant | Express API server scaffold. Currently has build.mjs, package.json, tsconfig.json only. No routes defined. Not used by mobile. |
| `artifacts/mockup-sandbox/` | infra-only | active | Design canvas mockup server (Vite). Independent from PLANTMON. |
| `lib/api-client-react/` | infra-only | dormant | OpenAPI React Query hooks. Generated output destination. Not consumed by mobile. |
| `lib/api-spec/` | infra-only | dormant | OpenAPI spec + Orval config. No spec content beyond scaffold. |
| `lib/api-zod/` | infra-only | dormant | Zod schemas from OpenAPI codegen. Empty scaffold. |
| `lib/db/` | infra-only | dormant | Drizzle ORM schema + config. For api-server use only; mobile uses Supabase directly. |

---

### 1.9 Attached Assets (Not Runtime)

| filepath | category | deletion_safe | notes |
|---|---|---|---|
| `attached_assets/Pasted-*.txt` | stale | yes | Development prompt history files auto-attached by Replit. Not runtime artifacts. Not in source control. 10 files. |
| `attached_assets/PLANTMON_—_MVP_SCHEMA_FREEZE_DOCUMENT_*.md` | migration-critical | no | Authoritative schema freeze document from user. Referenced by implementation. |

---

## SECTION 2 — FILE CATEGORY CLASSIFICATION

| Category | Files |
|---|---|
| **runtime-critical** | `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/plant/[id].tsx`, `app/plant/new.tsx`, `components/PlantCard.tsx`, `hooks/usePlants.ts`, `types/plant.ts`, `lib/supabase.ts` |
| **onboarding-critical** | `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `app/plant/new.tsx`, `components/PlantForm.tsx` |
| **scheduler-critical** | `lib/careProfiles.ts`, `hooks/usePlants.ts` (`useWaterPlant`, `useCreatePlant`), `types/plant.ts` (`getDaysUntilWatering`, `needsWatering`) |
| **identity-critical** | `types/canonical.ts`, `types/plant.ts`, `lib/careProfiles.ts`, `components/PlantForm.tsx`, `hooks/usePlants.ts` |
| **Supabase-critical** | `lib/supabase.ts`, `contexts/AuthContext.tsx`, `hooks/usePlants.ts`, `lib/careProfiles.ts` |
| **migration-critical** | `supabase-migration-v2.sql`, `supabase-setup.sql`, `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md`, `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md`, `hooks/usePlants.ts` (shims), `lib/careProfiles.ts` (slots) |
| **automation-critical** | `scripts/build.js`, `server/serve.js`, `server/templates/landing-page.html` |
| **UI-only** | `app/(tabs)/profile.tsx`, `components/WateringStatus.tsx`, `app/+not-found.tsx`, `constants/colors.ts` |
| **utility-only** | `hooks/useColors.ts`, `components/KeyboardAwareScrollViewCompat.tsx`, `lib/runtimeValidation.ts` |
| **infra-only** | `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `package.json`, `.replit-artifact/artifact.toml`, `expo-env.d.ts`, workspace root files |
| **compatibility-layer** | `hooks/usePlants.ts` (shim block), `lib/careProfiles.ts` (routing slots + `lookupCareProfile` wrapper), `types/plant.ts` (`TaskTypeLegacy`, `LightRequirementAny`, `DifficultyLevelAny`) |
| **future-activation** | `lib/careProfiles.ts` (`lookupByCanonicalId` slot, `lookupByAlias` slot, seasonal freq slots), `hooks/usePlants.ts` (post-migration lines), `lib/runtimeValidation.ts` (`isReadyForCanonicalResolution`, `getSchemaMigrationStatus`) |
| **technical-debt** | `app/(tabs)/_layout.tsx` + `app/(auth)/_layout.tsx` (duplicate auth guards), `types/plant.ts` (`getDaysUntilWatering` ignores `next_due_at`), `hooks/usePlants.ts` (care_logs missing canonical_species_id), `types/canonical.ts` (`CareTaskStatus` unused) |
| **generated** | `.expo/devices.json`, `.expo/README.md`, `.expo/types/router.d.ts`, `.expo/web/cache/` |
| **stale/dead** | `scripts/src/hello.ts`, `assets/images/icon.png` (placeholder), `attached_assets/Pasted-*.txt` |

---

## SECTION 3 — DEAD / STALE FILE DETECTION

### 3.1 `@workspace/api-client-react` — Declared but Unused

**Why it appears stale:** `package.json` declares `"@workspace/api-client-react": "workspace:*"` and `tsconfig.json` has `{ "path": "../../lib/api-client-react" }` in references. However, zero files in the mobile artifact import anything from `@workspace/api-client-react`. The lib contains generated React Query hooks from the OpenAPI spec — hooks that target the Express API server, not the Supabase client that PLANTMON uses.

**Risk level:** Low  
**Deletion safety:** The tsconfig reference and package.json dependency can be removed safely. This would reduce typecheck time and eliminate a misleading dependency declaration.  
**Migration implications:** None.

---

### 3.2 `scripts/src/hello.ts` — Scaffold Placeholder

**Why it appears stale:** Contains no PLANTMON-relevant logic. Is the default scaffold content from workspace initialization.

**Risk level:** None  
**Deletion safety:** Safe to delete. Not imported by anything.  
**Migration implications:** None.

---

### 3.3 `.expo/devices.json`, `.expo/web/cache/` — Generated Artifacts

**Why they appear stale:** These are Expo dev tools runtime caches. `devices.json` lists QR-scanned physical devices. `web/cache/` contains a pre-generated favicon. Both are regenerated by Expo tooling.

**Risk level:** None  
**Deletion safety:** Safe to delete; will be regenerated.  
**Migration implications:** None. Should be in `.gitignore` to avoid accumulation.

---

### 3.4 `types/canonical.ts` — `CareTaskStatus` Type (Unused)

**Why it appears stale:** `CareTaskStatus = "pending" | "completed" | "skipped" | "overdue"` is defined and exported. However, no DB column with this type exists — the only task state column is `active_status BOOLEAN`. No file in the runtime consumes `CareTaskStatus` for actual DB reads.

**Risk level:** Low — the type is not actively harmful, but it creates a false impression that task statuses beyond `active_status` exist in the DB.  
**Deletion safety:** NOT safe yet — this is a planned type for the future task lifecycle system.  
**Migration implications:** Will become active when a `status` column is added to `care_tasks`.

---

### 3.5 `SCHEMA_INVENTORY_v0.1.md` — Partially Stale

**Why it appears stale:** Documents the live DB state at Phase 1.5. Since then, Phase 2.1 work has completed and Phase B1.5A has synchronized the runtime. The "live Supabase state" sections are now pre-migration state, which will become inaccurate once `supabase-migration-v2.sql` runs.

**Risk level:** Low — documentation only.  
**Deletion safety:** Not safe to delete — it is the historical phase-1.5 record.  
**Migration implications:** Should be annotated as "pre-migration state" after migration runs.

---

### 3.6 `assets/images/icon.png` — Default Placeholder Icon

**Why it appears stale:** The app icon is the default scaffold asset. "Plant Manager" does not yet have a custom branded icon.

**Risk level:** None  
**Deletion safety:** NOT safe to delete — required for splash screen and Expo build.  
**Migration implications:** None. Replace with a custom icon when branding is established.

---

### 3.7 `lib/db/`, `lib/api-spec/`, `lib/api-zod/`, `artifacts/api-server/` — Backend Scaffold

**Why they appear stale:** These are the scaffold for a potential Express API server backend. PLANTMON mobile uses Supabase directly from the client. None of these lib packages are imported by the mobile artifact.

**Risk level:** Low  
**Deletion safety:** Safe to remove from the mobile artifact's perspective; the scaffolds may be intentional for future server-side work.  
**Migration implications:** None for PLANTMON mobile.

---

## SECTION 4 — RUNTIME COUPLING AUDIT

### 4.1 Critical: `getDaysUntilWatering` Ignores `next_due_at`

**Location:** `types/plant.ts` → `getDaysUntilWatering()`  
**Assumption:** Next watering is always `last_completed_at + frequency_days * 86400s`.  
**The problem:** `useWaterPlant` writes `next_due_at` to the DB after each watering. But the UI display functions (`getDaysUntilWatering`, `needsWatering`) ignore `next_due_at` entirely and recalculate from `last_completed_at + frequency_days`. These will agree only if `frequency_days` hasn't changed. If `next_due_at` is ever set by any other mechanism (e.g. a Supabase trigger, admin override, or seasonal recalculation), the UI will silently disagree with the DB state.

**Coupling risk:** HIGH  
**Files affected:** `types/plant.ts`, `components/PlantCard.tsx`, `components/WateringStatus.tsx`, `app/(tabs)/index.tsx`, `app/plant/[id].tsx`  
**Phase 2.2 implication:** When seasonal frequency changes, `next_due_at` will be recalculated by the scheduler logic. If the UI still uses the `last_completed_at + legacy_frequency` path, it will show wrong countdowns.  
**Fix required before:** Seasonal scheduler migration.

---

### 4.2 Medium: Duplicate Auth Guard Logic

**Locations:** `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/(tabs)/_layout.tsx`  
**Assumption:** Each independently checks `session` + `loading` from AuthContext and redirects accordingly.  
**The problem:** Three separate route segments implement the same auth redirect. If auth behavior needs to change (e.g. email verification required, 2FA, session expiry handling), all three must be updated in sync.

**Coupling risk:** MEDIUM  
**Files affected:** 3 route files  
**Phase 2.2 implication:** Low — not identity-related.  
**Fix required before:** Production hardening.

---

### 4.3 Medium: `PLANT_SELECT = "*, care_tasks(*)"` — Unbounded Eager Load

**Location:** `hooks/usePlants.ts`  
**Assumption:** Every plant query loads ALL columns + ALL care_tasks at once.  
**The problem:** For a user with many plants and many historical tasks, this could be expensive. `care_tasks` is not paginated or filtered to `active_status = true`. At current scale (development use) this is fine. At 100+ plants with 3+ task types each, this SELECT returns a large payload per list render.

**Coupling risk:** LOW (current scale), MEDIUM (at scale)  
**Files affected:** `hooks/usePlants.ts`  
**Phase 2.2 implication:** When canonical_species_id is populated and care profiles evolve, care_tasks may grow (misting, pruning, cleaning tasks added). The unbounded join grows with it.

---

### 4.4 Medium: `generateDefaultCareTasks` Only Creates Watering + Fertilizing

**Location:** `lib/careProfiles.ts` → `generateDefaultCareTasks()`  
**Assumption:** Only `watering` and `fertilizing` tasks are auto-generated at plant creation.  
**The problem:** `PlantCareProfile` has `repotting_frequency_months` and the enum includes `misting` and `cleaning`. The `plant_care_profiles` seed data does not include any of these beyond watering/fertilizing. If future profiles add misting frequency, the task generator must be updated to pick them up.

**Coupling risk:** LOW  
**Files affected:** `lib/careProfiles.ts`  
**Phase 2.2 implication:** Task generation needs to be extended for full Phase 2.2 care intelligence.

---

### 4.5 High: `care_logs` Insert Missing `canonical_species_id`

**Location:** `hooks/usePlants.ts` → `useWaterPlant()`  
**Assumption:** `care_logs` inserts carry only `plant_id`, `task_type`, `completed_at`.  
**The problem:** After migration, `canonical_species_id` will be a nullable FK on `care_logs`. For any plant that has a `canonical_species_id` set (post Phase 2.2), the care log entries will permanently lack the canonical link unless the insert is updated. Historical log records will have `canonical_species_id = NULL` even for canonically-resolved plants.

**Coupling risk:** HIGH (historical data integrity)  
**Files affected:** `hooks/usePlants.ts`  
**Phase 2.2 implication:** Must be fixed at Phase 2.2 activation: look up `plant.canonical_species_id` and include it in care_log insert.

---

### 4.6 Low: `species_name` ilike as Sole Care Profile Resolution Path

**Location:** `lib/careProfiles.ts` → `lookupBySpeciesNameIlike()`  
**Assumption:** Users type the exact (or near-exact) scientific name that matches `plant_care_profiles.species_name`.  
**The problem:** If a user types "money plant", "golden pothos", "devil's ivy", or any regional/common name, the ilike will miss or return a wrong match. The DEFAULT_WATERING_DAYS fallback fires silently.  There is no indication to the user that no profile was found.

**Coupling risk:** MEDIUM (UX correctness), LOW (system integrity)  
**Files affected:** `lib/careProfiles.ts`, `components/PlantForm.tsx`  
**Phase 2.2 implication:** Alias lookup resolves this. This is the primary motivation for the alias system.

---

### 4.7 Low: `useWaterPlant` Has No Optimistic Update

**Location:** `hooks/usePlants.ts` → `useWaterPlant()`  
**Assumption:** Watering reflects in UI only after `queryClient.invalidateQueries` triggers a refetch.  
**The problem:** There is a 500–1500ms window where the watering button has been pressed and the haptic feedback fired, but the UI still shows the old state. On slow connections, this lag is user-visible.

**Coupling risk:** LOW  
**Files affected:** `hooks/usePlants.ts`  
**Phase 2.2 implication:** None directly.

---

## SECTION 5 — SUPABASE DEPENDENCY AUDIT

### 5.1 `lib/supabase.ts` — Client Creation

| Field | Value |
|---|---|
| **Tables accessed** | None directly — creates the singleton |
| **Schema assumptions** | None — pure client instantiation |
| **Migration risk** | LOW — only changes if Supabase project URL/anon key changes |
| **Compatibility risk** | Credential swap detection relies on `startsWith("https://")` — brittle if a future anon key starts with `https://` (extremely unlikely) |
| **Phase 2.2 implications** | None |

---

### 5.2 `contexts/AuthContext.tsx` — Auth State

| Field | Value |
|---|---|
| **Supabase APIs used** | `auth.getSession()`, `auth.onAuthStateChange()`, `auth.signInWithPassword()`, `auth.signUp()`, `auth.signOut()` |
| **Tables accessed** | `auth.users` (via Supabase auth system only) |
| **Schema assumptions** | Assumes email/password auth is enabled in Supabase project |
| **Migration risk** | LOW — no schema coupling |
| **Compatibility risk** | None — standard Supabase auth APIs |
| **Phase 2.2 implications** | May need to read `user.id` to look up canonical species assignments during onboarding — low impact |

---

### 5.3 `hooks/usePlants.ts` — Plant CRUD Core

| Field | Value |
|---|---|
| **Tables accessed** | `plants`, `care_tasks`, `care_logs` |
| **Columns read** | `plants.*` + `care_tasks.*` via `select("*", care_tasks(*))` |
| **Columns written — plants** | `display_name`, `species_name`, `room_location`, `notes`, `image_url`, `botanical_name`, `light_conditions`, `watering_preferences`, `user_id`, `updated_at` (v0.1 fields only, Phase 2.1 fields stripped until migration) |
| **Columns written — care_tasks** | `plant_id`, `task_type`, `last_completed_at`, `next_due_at`, `frequency_days`, `active_status` |
| **Columns written — care_logs** | `plant_id`, `task_type`, `completed_at` |
| **Enum assumptions** | `task_type: "watering"` hardcoded in `useWaterPlant` and `useCreatePlant` duplicate guard |
| **RLS assumption** | `auth.uid() = user_id` on plants; care_tasks/logs via plant ownership check |
| **Migration risk** | HIGH — v0.1 shim must be removed post-migration |
| **Compatibility risk** | `care_logs` insert will miss `canonical_species_id` post-migration until Phase 2.2 activation |
| **Phase 2.2 implications** | After migration: remove shims, add canonical field population, include `canonical_species_id` in care_logs inserts |

---

### 5.4 `lib/careProfiles.ts` — Care Profile Resolution

| Field | Value |
|---|---|
| **Tables accessed** | `plant_care_profiles` (read only); future: `plant_aliases`, `canonical_species` |
| **Columns read** | `*` via `select("*")` |
| **Query type** | `ilike("species_name", ...)` — case-insensitive partial match, `limit(1)`, `order("species_name")` |
| **Enum assumptions** | Assumes `task_type` CHECK constraint accepts `"watering"` and `"fertilizing"` |
| **Tables written** | `care_tasks` — `plant_id`, `task_type`, `frequency_days`, `next_due_at`, `active_status` |
| **Migration risk** | LOW — reads use `*` (forward compatible); writes use v0.1-compatible columns |
| **Compatibility risk** | ilike still works post-migration; `canonical_species_id` on `plant_care_profiles` will be null until seeded |
| **Phase 2.2 implications** | Uncomment `lookupByCanonicalId` and `lookupByAlias` slots; pass `canonical_species_id` to `generateDefaultCareTasks` |

---

### 5.5 Schema Column Existence Assumptions Summary

| Table | Assumed Columns | Pre-Migration Safe | Post-Migration State |
|---|---|---|---|
| `plants` | display_name, species_name, room_location, notes, image_url, botanical_name, light_conditions, watering_preferences, user_id, created_at, updated_at | ✅ Yes | canonical_species_id, user_entered_name etc. arrive as null (safe) |
| `care_tasks` | plant_id, task_type, frequency_days, last_completed_at, next_due_at, active_status | ✅ Yes | canonical_species_id arrives as null |
| `care_logs` | plant_id, task_type, completed_at | ✅ Yes | canonical_species_id not populated until Phase 2.2 activation |
| `plant_care_profiles` | species_name, watering_frequency_days, fertilizing_frequency_days, * | ✅ Yes | New columns return null post-migration |

---

## SECTION 6 — IDENTITY ACTIVATION TOUCHPOINT AUDIT

### 6.1 Identity Entry Point: `app/plant/new.tsx` + `components/PlantForm.tsx`

| Field | Value |
|---|---|
| **Current runtime behavior** | User types `display_name` (required) + `species_name` (optional free text). `user_entered_name` is captured in submit payload but stripped from DB insert by Phase 2.1 shim. |
| **Future Phase 2.2 role** | PlantForm becomes the canonical identity resolution UX: species name field gains alias search autocomplete → selects canonical_species_id → resolution method set to `alias_match` or `direct_species_match`. |
| **Migration readiness** | `user_entered_name` is captured and held in PlantInput. DB shim in place. Ready for migration. |
| **Coupling risk** | MEDIUM — current form has no autocomplete; Phase 2.2 requires significant UI addition |

---

### 6.2 Species Name Flow

```
User types species name (PlantForm)
        ↓
user_entered_name captured (PlantInput)
        ↓
useCreatePlant: strips canonical fields, inserts with species_name only
        ↓
generateDefaultCareTasks(plantId, species_name)
        ↓
resolveSpeciesProfile({ species_name })
        ↓
lookupBySpeciesNameIlike(species_name)    ← CURRENT ACTIVE PATH
        ↓
PlantCareProfile | null
        ↓
getEffectiveWateringFrequency(profile)    ← 7 days default if null
        ↓
INSERT care_tasks (watering, [fertilizing])
```

**Phase 2.2 path (inactive — slots present):**
```
resolveSpeciesProfile({ species_name, canonical_species_id })
        ↓
[slot] lookupByCanonicalId(canonical_species_id)
        ↓
[slot] lookupByAlias(species_name)
        ↓
lookupBySpeciesNameIlike(species_name)    ← fallback
```

---

### 6.3 Care Profile Lookup Touchpoints

| File | Function | Identity Path | Phase 2.2 Role |
|---|---|---|---|
| `lib/careProfiles.ts` | `resolveSpeciesProfile()` | ilike on species_name | Routing entry point — canonical/alias slots present |
| `lib/careProfiles.ts` | `lookupCareProfile()` | delegates to resolveSpeciesProfile | Backward-compat wrapper — may deprecate |
| `lib/careProfiles.ts` | `generateDefaultCareTasks()` | calls resolveSpeciesProfile | Passes canonical_species_id to resolver (slot ready) |
| `hooks/usePlants.ts` | `useCreatePlant` | calls generateDefaultCareTasks | Will pass canonical_species_id post-Phase 2.2 |

---

### 6.4 Identity Status Classification (via `lib/runtimeValidation.ts`)

| Status | Condition | Current Plant Count |
|---|---|---|
| `display_name_only` | No species_name, no canonical_species_id | Likely 0–some (depends on user behavior) |
| `species_known` | species_name set, canonical_species_id null | ALL current plants (migration not run) |
| `canonical` | canonical_species_id set | 0 (will be populated after Phase 2.2) |

---

## SECTION 7 — SCHEDULER EVOLUTION AUDIT

### 7.1 Current Scheduler Architecture

The scheduler is entirely **client-side and reactive**. There is no background worker, no push notification system, and no server-side scheduling. All watering urgency is computed on-demand at render time.

**Active scheduler files:**

| File | Role |
|---|---|
| `types/plant.ts` | `getDaysUntilWatering()`, `needsWatering()` — UI computation |
| `hooks/usePlants.ts` | `useWaterPlant()` — updates `last_completed_at` + `next_due_at` |
| `lib/careProfiles.ts` | `generateDefaultCareTasks()` — creates tasks with `frequency_days` + `next_due_at` |
| `lib/careProfiles.ts` | `getEffectiveWateringFrequency()` — seasonal slot present |
| `components/WateringStatus.tsx` | Aggregates urgency counts from plant list |
| `app/(tabs)/index.tsx` | Filter chips use `needsWatering` / `getDaysUntilWatering` |

---

### 7.2 Critical: `next_due_at` Written but Not Read

**The divergence:**

| Operation | Source of truth used |
|---|---|
| `useWaterPlant` writes to DB | Computes `next_due_at = now + frequency_days * 86400s` ✅ |
| UI reads watering countdown | Uses `getDaysUntilWatering()` = `last_completed_at + frequency_days * 86400s` ⚠️ |

Both computations are equivalent TODAY because they use the same `frequency_days`. But they will diverge in any of these scenarios:
1. `frequency_days` changes post-watering (e.g. seasonal update modifies the care task)
2. Admin sets `next_due_at` directly in DB
3. A Supabase function or trigger updates `next_due_at`
4. Seasonal scheduler updates `next_due_at` based on seasonal profile

**Recommended fix:** `getDaysUntilWatering()` should prefer `next_due_at` from the DB if set, falling back to the computed value. This is a safe behavioral improvement but technically changes existing behavior.

---

### 7.3 Static Assumptions in Task Generation

| Assumption | Location | Impact |
|---|---|---|
| `DEFAULT_WATERING_DAYS = 7` | `lib/careProfiles.ts` | All species without a profile get 7-day watering regardless |
| Only watering + fertilizing tasks generated | `lib/careProfiles.ts` → `generateDefaultCareTasks` | misting/pruning/cleaning never auto-created |
| `next_due_at = now + frequency_days * ms` (from creation time) | `lib/careProfiles.ts` | Clock starts from creation, not from last watering event |
| No recalculation on frequency change | `hooks/usePlants.ts` → `useUpdatePlant` | Updating `species_name` does not regenerate care tasks |

---

### 7.4 Seasonal Readiness

| Component | Current State | Seasonal Ready |
|---|---|---|
| `PlantCareProfile` type | Has seasonal fields (spring/summer/autumn/winter for watering + fertilizing) | ✅ Type ready |
| `plant_care_profiles` DB table | Post-migration: has seasonal columns (nullable) | Columns exist, data not authored |
| `getEffectiveWateringFrequency(profile, season?)` | Season param present, routing commented out | ✅ Slot ready |
| `getEffectiveFertilizingFrequency(profile, season?)` | Season param present, routing commented out | ✅ Slot ready |
| Season detection utility | NOT IMPLEMENTED | ❌ Missing: `getCurrentSeason()` |
| Task recalculation on season change | NOT IMPLEMENTED | ❌ Missing |
| Care task `frequency_days` update trigger | NOT IMPLEMENTED | ❌ Missing |

---

## SECTION 8 — COMPATIBILITY LAYER AUDIT

### 8.1 Phase 2.1 Field Strip Shim (`hooks/usePlants.ts`)

**What it is:** 4-field destructuring in `useCreatePlant` and `useUpdatePlant` that strips `user_entered_name`, `canonical_species_id`, `canonical_species_name`, `species_resolution_method` from the DB insert payload.

**Why it exists:** `PlantInput` carries these Phase 2.1 fields; the live Supabase DB does not yet have these columns. Spreading them would cause a PostgREST 400 error.

**What phase activates it:** When `supabase-migration-v2.sql` has been confirmed applied.

**When it can be removed:** Immediately after migration confirmation. Remove destructuring block, revert to `{ ...input, user_id: user!.id }`.

---

### 8.2 Phase 2.2 Routing Slots (`lib/careProfiles.ts`)

**What it is:** Three commented-out code blocks in `resolveSpeciesProfile()`:
- `lookupByCanonicalId()` function definition
- Canonical ID lookup slot (checked first in routing order)
- Alias lookup slot (checked second in routing order)

**Why they exist:** The routing architecture is in place; the data (canonical_species seed + plant_aliases seed) does not exist yet.

**What phase activates them:** Phase 2.2 identity activation, after both migration and canonical dataset seeding.

**When they can be removed:** Never removed — they become the active code path.

---

### 8.3 Legacy Enum Compat Types (`types/canonical.ts`, `types/plant.ts`)

**What it is:** `TaskTypeLegacy`, `LightRequirementAny`, `DifficultyLevelAny` — union types that accept both v0.1 legacy enum values and Phase 2.1 canonical values.

**Why they exist:** The live `plant_care_profiles` table has 46 rows seeded with legacy enum values (`low`, `medium`, `full_sun`, `easy`, `hard`). The migration expands CHECK constraints to accept both. TypeScript types mirror this dual-acceptance.

**What phase activates/removes them:** A future enum migration pass (not yet scoped) will backfill canonical values and allow deprecating the legacy types. Not in Phase 2.2.

---

### 8.4 `lookupCareProfile()` Backward-Compat Wrapper (`lib/careProfiles.ts`)

**What it is:** `lookupCareProfile(speciesName)` still exported — delegates to `resolveSpeciesProfile({ species_name: speciesName })`.

**Why it exists:** Existing callers (none currently direct — only `generateDefaultCareTasks` is the internal caller) can remain unchanged.

**When it can be removed:** Phase 2.2 — when callers are updated to use `resolveSpeciesProfile()` directly for full context.

---

### 8.5 Seasonal Frequency Stubs (`lib/careProfiles.ts`)

**What it is:** `getEffectiveWateringFrequency(profile, _season?)` and `getEffectiveFertilizingFrequency(profile, _season?)` with seasonal routing commented out.

**Why they exist:** Single activation point for seasonal scheduling. All frequency decisions flow through these functions already.

**What phase activates them:** When seasonal data is authored in `plant_care_profiles` + a `getCurrentSeason()` utility is implemented.

---

## SECTION 9 — TECHNICAL DEBT MAP

### 9.1 Low-Risk Debt

| Issue | File | Severity | Risk | Priority |
|---|---|---|---|---|
| Auth guard duplicated in 3 route files | `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/(tabs)/_layout.tsx` | Low | Low | Low — works correctly, just messy |
| `@workspace/api-client-react` declared unused in package.json + tsconfig | `package.json`, `tsconfig.json` | Low | None | Low |
| `scripts/src/hello.ts` scaffold placeholder | `scripts/src/hello.ts` | Low | None | Low |
| No optimistic update in `useWaterPlant` | `hooks/usePlants.ts` | Low | UX lag | Medium |
| No user feedback when species profile not found (silent DEFAULT_WATERING_DAYS) | `lib/careProfiles.ts` | Low | UX confusion | Medium |

---

### 9.2 Scheduler Debt

| Issue | File | Severity | Risk | Priority |
|---|---|---|---|---|
| `getDaysUntilWatering` ignores `next_due_at` | `types/plant.ts` | **HIGH** | UI/DB divergence when seasonal scheduler activates | **HIGH — must fix before seasonal migration** |
| `useUpdatePlant` does not recalculate care tasks when `species_name` changes | `hooks/usePlants.ts` | MEDIUM | Wrong schedule silently persists | Medium |
| No `getCurrentSeason()` implementation | missing | MEDIUM | Seasonal routing cannot activate | High (for Phase 2.2) |
| `DEFAULT_WATERING_DAYS = 7` silently applies to ALL unrecognized species | `lib/careProfiles.ts` | LOW | Wrong schedules for exotic/unrecognized plants | Low |
| Only watering + fertilizing tasks auto-generated | `lib/careProfiles.ts` | MEDIUM | misting/pruning/cleaning never scheduled | Low (Phase 2.2+) |

---

### 9.3 Onboarding Debt

| Issue | File | Severity | Risk | Priority |
|---|---|---|---|---|
| No species autocomplete or alias search | `components/PlantForm.tsx` | HIGH | Most users will not know scientific names | **HIGH — Phase 2.2 blocker** |
| `user_entered_name` not persisted to DB yet | `hooks/usePlants.ts` | MEDIUM | Raw onboarding input lost until migration | Activated by migration |
| No canonical resolution feedback to user | `components/PlantForm.tsx` | MEDIUM | User doesn't know if species was recognized | Phase 2.2 |
| No duplicate plant detection | `hooks/usePlants.ts` | LOW | Users can add the same plant multiple times | Low |

---

### 9.4 Identity Debt

| Issue | File | Severity | Risk | Priority |
|---|---|---|---|---|
| `canonical_species_id` null on all existing plants | Live DB | HIGH | All plants unresolved; no canonical routing possible | Migration + dataset seeding |
| `care_logs` will permanently miss `canonical_species_id` for historical records | `hooks/usePlants.ts` | MEDIUM | Historical logs unlinked from canonical identity | Must fix at Phase 2.2 activation |
| No backfill mechanism for existing plants post-seeding | Not implemented | HIGH | Plants created before Phase 2.2 have no canonical ID | Needs backfill job |
| `CareTaskStatus` type defined but no DB column | `types/canonical.ts` | LOW | Misleading type declaration | Low |

---

### 9.5 Supabase Debt

| Issue | File | Severity | Risk | Priority |
|---|---|---|---|---|
| `PLANT_SELECT = "*, care_tasks(*)"` — no pagination | `hooks/usePlants.ts` | LOW | Expensive at scale | Medium (when user plant count grows) |
| No `(plant_id, task_type)` UNIQUE constraint on care_tasks | Schema | MEDIUM | Duplicate active tasks possible (app guards only) | Schema patch before Phase 2.2 |
| RLS policies use `USING` only (no `WITH CHECK` on care_tasks/logs) | `supabase-setup.sql` | MEDIUM | Missing insert/update guards on child tables | Security hardening |
| Supabase env vars swapped — relies on detection heuristic | `lib/supabase.ts` | MEDIUM | Fragile runtime workaround for misconfigured env | Fix env var assignments directly |

---

### 9.6 UI Debt

| Issue | File | Severity | Priority |
|---|---|---|---|
| App icon is default scaffold placeholder | `assets/images/icon.png` | LOW | Low |
| Splash screen color `#F7FAF8` is hardcoded in `app.json` (not from design tokens) | `app.json` | LOW | Low |
| `app/(tabs)/profile.tsx` email initials from `user.email.slice(0,2)` — breaks for some email formats | `app/(tabs)/profile.tsx` | LOW | Low |
| No empty state for zero-watering-task plants on detail screen | `app/plant/[id].tsx` | LOW | Low |

---

## SECTION 10 — MIGRATION READINESS ASSESSMENT

### 10.1 Assessment: Is Another Migration Needed Before Dataset Synchronization?

**Answer: YES — one targeted pre-dataset migration pass is recommended.**

The `supabase-migration-v2.sql` creates the structural foundation but leaves several gaps that will cause operational problems during dataset seeding and Phase 2.2 activation.

---

### 10.2 Recommended Pre-Dataset Migration Items

**A. UNIQUE constraint on `care_tasks(plant_id, task_type)` for active tasks**

Currently, the application-level guard in `generateDefaultCareTasks` (checks for existing active watering task before inserting) is the ONLY protection against duplicate active care tasks. If two concurrent requests race, or if admin operations bypass the app, duplicate tasks will exist silently.

Recommended:
```sql
-- Partial UNIQUE index: one active task per (plant, task_type)
CREATE UNIQUE INDEX IF NOT EXISTS care_tasks_plant_task_active_unique
  ON care_tasks (plant_id, task_type)
  WHERE active_status = TRUE;
```

---

**B. Index on `care_tasks(plant_id, task_type, active_status)` — Composite Lookup**

Phase 2.2 will need to look up active tasks by plant_id + task_type frequently (for schedule recalculation). The current `care_tasks_plant_id_idx` is single-column. A composite index would significantly improve lookup performance.

```sql
CREATE INDEX IF NOT EXISTS care_tasks_plant_task_active_idx
  ON care_tasks (plant_id, task_type, active_status);
```

---

**C. Index on `plant_aliases(alias_name text_pattern_ops)` — Case-Insensitive Search**

Phase 2.2 alias lookup will use `ilike` on `alias_name`. The migration creates `plant_aliases_name_idx ON plant_aliases (alias_name)` — a btree index. For `ilike '%text%'` searches, this btree does NOT accelerate the query. For `ilike 'text%'` prefix searches it helps only with `text_pattern_ops`.

Recommended either GIN with `pg_trgm` extension or a normalized (lowercased) column:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS plant_aliases_name_trgm_idx
  ON plant_aliases USING GIN (alias_name gin_trgm_ops);
```

---

**D. RLS `WITH CHECK` on `care_tasks` and `care_logs` INSERT/UPDATE**

Current RLS on `care_tasks`:
```sql
CREATE POLICY "care_tasks: insert own" ON care_tasks FOR INSERT
  USING (EXISTS (SELECT 1 FROM plants WHERE …))
```
This uses `USING` for INSERT, which is a security smell — INSERT policies should use `WITH CHECK`. The effect is the same in PostgreSQL, but it signals incorrectness to reviewers and future policy tooling.

---

**E. `plants.canonical_species_id` FK Index on `(user_id, canonical_species_id)`**

For Phase 2.2, "find all of this user's plants for species PLANT_0042" requires a join. The existing `plants_canonical_id_idx` is single-column. Adding a composite `(user_id, canonical_species_id)` index significantly improves per-user canonical queries.

```sql
CREATE INDEX IF NOT EXISTS plants_user_canonical_idx
  ON plants (user_id, canonical_species_id)
  WHERE canonical_species_id IS NOT NULL;
```

---

**F. `plant_care_profiles.species_name` UNIQUE Constraint Verification**

The setup SQL has `species_name TEXT NOT NULL UNIQUE`. The migration does NOT re-declare this. Verify the live DB has this constraint — it is the ilike lookup's duplicate prevention mechanism.

---

### 10.3 Enum Hardening Assessment

The migration expands `light_requirement` and `difficulty_level` CHECK constraints to accept both legacy and canonical values. However:

- The live `plant_care_profiles` seed has legacy values (`low_light`, `medium_indirect`, `bright_indirect`, `direct_sun`, `beginner`, `intermediate`, `advanced`) which are now canonical, but some rows also have legacy-only values like... 
  
  Wait — looking at the setup.sql seed data: it actually uses canonical values (`low_light`, `bright_indirect`, `beginner`, `intermediate`, `advanced`). The live DB has legacy values (`low`, `medium`, `full_sun`, `easy`, `hard`). This discrepancy confirms the migration is needed to expand the CHECK constraints before any seed data can be written using canonical values.

**Conclusion:** The CHECK constraint expansion in the migration is REQUIRED before canonical dataset seeding.

---

### 10.4 Propagation Gaps

| Gap | Risk | Impact |
|---|---|---|
| `care_tasks.canonical_species_id` not set at task creation | MEDIUM | All tasks permanently unlinked from canonical identity; analytics broken |
| `care_logs.canonical_species_id` not set at watering | MEDIUM | Historical care log analytics unlinked |
| No backfill mechanism for plants created before Phase 2.2 | HIGH | Legacy plants never get canonical_species_id unless admin runs a backfill job |
| `journal_entries` and `health_logs` tables not yet used by app | LOW | canonical_species_id columns exist but will always be null |

---

## SECTION 11 — RUNTIME TOPOLOGY GRAPH

### 11.1 Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLANTMON Mobile App                          │
│                    (React Native / Expo)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼────────────────────┐
         ▼               ▼                    ▼
  ┌─────────────┐ ┌─────────────┐    ┌──────────────────┐
  │  Auth Flow  │ │ Garden Flow │    │  Supabase Cloud  │
  │ (login/     │ │ (plant CRUD │    │  ┌─────────────┐ │
  │  signup)    │ │  watering)  │    │  │ Auth        │ │
  └──────┬──────┘ └──────┬──────┘    │  │ plants      │ │
         │               │           │  │ care_tasks  │ │
         ▼               ▼           │  │ care_logs   │ │
  ┌─────────────────────────┐        │  │ plant_care  │ │
  │    AuthContext          │        │  │ _profiles   │ │
  │   (session, user)       │◄──────►│  └─────────────┘ │
  └──────────────┬──────────┘        │                  │
                 │                   │  (post-migration) │
                 ▼                   │  ┌─────────────┐ │
  ┌─────────────────────────┐        │  │ canonical   │ │
  │    usePlants hook       │◄──────►│  │ _species    │ │
  │  (CRUD + watering)      │        │  │ plant_      │ │
  └──────────────┬──────────┘        │  │ aliases     │ │
                 │                   │  │ collapse_   │ │
                 ▼                   │  │ mappings    │ │
  ┌─────────────────────────┐        │  └─────────────┘ │
  │   careProfiles.ts       │◄──────►└──────────────────┘
  │  resolveSpeciesProfile  │
  └─────────────────────────┘
```

---

### 11.2 Onboarding Flow

```
User opens app
     │
     ▼
app/index.tsx (auth gate)
     │
     ├── session? → /(tabs) (Garden)
     │
     └── no session? → /(auth)/login
                             │
                             ├── signIn() → /(tabs)
                             │
                             └── "Sign up" → /(auth)/signup
                                                  │
                                                  └── signUp() → /(tabs)

Plant Onboarding:
/(tabs) → + button → /plant/new (modal)
     │
     ▼
PlantForm (display_name, species_name, room_location, notes)
     │  user_entered_name captured (not yet persisted)
     ▼
useCreatePlant.mutate(input)
     │
     ├── strip Phase 2.1 fields (shim)
     ├── INSERT plants (v0.1 fields)
     ├── .select("*") → plantCore
     │
     └── generateDefaultCareTasks(plantId, species_name)
              │
              └── resolveSpeciesProfile({ species_name })
                       │
                       └── lookupBySpeciesNameIlike() → profile | null
                                │
                                └── INSERT care_tasks (watering [+ fertilizing])
```

---

### 11.3 Scheduler Flow

```
Plant loaded (usePlant / usePlants)
     │
     ▼
Plant.care_tasks[] available in memory
     │
     ▼
getDaysUntilWatering(plant)
     │
     ├── getWateringTask(plant) → find task_type="watering"
     │
     ├── last_completed_at + frequency_days * 86400s → nextDate   ← IGNORES next_due_at
     │
     └── Math.ceil((nextDate - now) / 86400s) → days int

needsWatering(plant) → getDaysUntilWatering === 0

WateringStatus aggregates:
  urgent: plants.filter(needsWatering).length
  soon:   plants.filter(d > 0 && d <= 2).length
  ok:     plants.length - urgent - soon

User presses Water:
useWaterPlant(plantId)
     │
     ├── INSERT care_logs (plant_id, task_type, completed_at)
     │
     └── UPDATE care_tasks
              ├── last_completed_at = now
              └── next_due_at = now + frequency_days * 86400s
```

---

### 11.4 Supabase Query Flow

```
lib/supabase.ts (singleton)
     │
     ├── contexts/AuthContext.tsx
     │     ├── auth.getSession()
     │     ├── auth.onAuthStateChange()
     │     ├── auth.signInWithPassword()
     │     └── auth.signUp() / signOut()
     │
     ├── hooks/usePlants.ts
     │     ├── SELECT plants.*, care_tasks(*) [WHERE user_id = auth.uid()]
     │     ├── INSERT plants → SELECT *
     │     ├── UPDATE plants SET ... → SELECT *, care_tasks(*)
     │     ├── DELETE plants
     │     ├── INSERT care_logs (plant_id, task_type, completed_at)
     │     ├── SELECT care_tasks (id, frequency_days) WHERE plant_id + task_type + watering
     │     └── UPDATE/INSERT care_tasks (last_completed_at, next_due_at)
     │
     └── lib/careProfiles.ts
           ├── SELECT plant_care_profiles.* WHERE ilike(species_name, ...)
           └── INSERT care_tasks (plant_id, task_type, frequency_days, next_due_at, active_status)
```

---

### 11.5 Phase 2.2 Identity Flow (Future — Not Active)

```
PlantForm (with autocomplete)
     │
     └── alias search: SELECT plant_aliases WHERE ilike(alias_name, input)
                             │
                             └── canonical_species_id resolved
                                      │
useCreatePlant:
     ├── INSERT plants with canonical_species_id, user_entered_name, species_resolution_method
     │
     └── generateDefaultCareTasks(plantId, species_name, canonical_species_id)
              │
              └── resolveSpeciesProfile({ canonical_species_id })
                       │
                       ├── lookupByCanonicalId()  ← exact lookup
                       │         ↓
                       └── PlantCareProfile (by canonical_species_id)
                                │
                                └── seasonal-aware frequency via getEffectiveWateringFrequency(profile, season)
```

---

## SECTION 12 — FINAL EXECUTIVE ASSESSMENT

### 12.1 Architecture Health Assessment

| Dimension | Score | Notes |
|---|---|---|
| **Type safety** | GOOD | Strict TypeScript throughout. Enum governance in canonical.ts prevents drift. |
| **Code organization** | GOOD | Clear separation: types → lib → hooks → components → screens |
| **Supabase integration** | GOOD | RLS configured. Auth correctly separated from data. Query layer isolated in hooks. |
| **Error handling** | ADEQUATE | ErrorBoundary covers render errors. Supabase errors bubble to error banners in screens. No structured error types for domain errors. |
| **State management** | GOOD | React Query handles server state cleanly. QueryClient invalidation is consistent. |
| **Duplication** | MINOR ISSUE | Auth guard logic in 3 places. No behavioral impact. |
| **Build + deployment** | GOOD | Complete static build pipeline. Zero-dependency production server. |

**Overall: Structurally sound. No architectural reinvention needed.**

---

### 12.2 Migration Maturity Assessment

| Dimension | Status |
|---|---|
| Phase 2.1 schema designed | ✅ COMPLETE |
| Phase 2.1 types integrated | ✅ COMPLETE |
| Phase B1.5A runtime compatibility | ✅ COMPLETE |
| supabase-migration-v2.sql ready | ✅ READY TO RUN |
| Pre-dataset migration (indexes, constraints) | ⚠️ RECOMMENDED (Section 10) |
| canonical_species dataset | ❌ NOT AUTHORED |
| plant_aliases dataset | ❌ NOT AUTHORED |
| collapse_mappings dataset | ❌ NOT AUTHORED |
| Post-migration activation shims | ⏳ MARKED — awaiting migration confirmation |

---

### 12.3 Runtime Coupling Assessment

**High-risk couplings requiring attention before Phase 2.2:**

1. `getDaysUntilWatering` ignores `next_due_at` — will cause UI/DB divergence when seasonal scheduler activates
2. `care_logs` inserts missing `canonical_species_id` — historical care data will be permanently unlinked unless fixed at Phase 2.2 activation
3. No backfill mechanism for plants created pre-Phase 2.2

**Low-risk couplings (acceptable technical debt):**

4. Duplicate auth guards (cosmetic, works correctly)
5. Unbounded `*` join on care_tasks (acceptable at current user scale)
6. `DEFAULT_WATERING_DAYS = 7` silent fallback (intentional, documented)

---

### 12.4 Phase 2.2 Readiness Assessment

| Blocker | Status |
|---|---|
| `supabase-migration-v2.sql` | ⏳ MUST RUN FIRST |
| canonical_species dataset authored | ❌ NOT STARTED |
| plant_aliases dataset authored | ❌ NOT STARTED |
| Pre-dataset migration pass (indexes) | ⚠️ RECOMMENDED before seeding |
| `lookupByCanonicalId()` slot implementation | ✅ SLOT READY (uncomment + fill) |
| `lookupByAlias()` slot implementation | ✅ SLOT READY (uncomment + fill) |
| Post-migration shim removal in usePlants.ts | ⏳ PENDING migration confirmation |
| `getDaysUntilWatering` fix (prefer next_due_at) | ⚠️ RECOMMENDED before seasonal scheduler |
| `care_logs` canonical_species_id population | ⚠️ MUST DO at Phase 2.2 activation |
| Plant backfill job (assign canonical_species_id to existing plants) | ❌ NOT IMPLEMENTED |
| Species autocomplete UI in PlantForm | ❌ NOT IMPLEMENTED |
| `getCurrentSeason()` utility | ❌ NOT IMPLEMENTED |

---

### 12.5 Scheduler Evolution Readiness

| Component | Ready |
|---|---|
| Type system for seasonal frequencies | ✅ |
| DB schema for seasonal frequencies | ✅ (post-migration) |
| `getEffectiveWateringFrequency(profile, season)` slot | ✅ |
| `getCurrentSeason()` utility | ❌ |
| DB data (seasonal freq authored in care profiles) | ❌ |
| `getDaysUntilWatering` preferring `next_due_at` | ❌ |
| Task recalculation on frequency change | ❌ |
| Background notification system | ❌ |

**Scheduler evolution is structurally ready but operationally empty.** The abstraction layer is in place; the data and the `next_due_at`-preferring display function are the two prerequisites.

---

### 12.6 Production Hardening Assessment

| Area | Status |
|---|---|
| Auth (Supabase RLS) | ✅ ADEQUATE — all tables have RLS |
| RLS INSERT/UPDATE WITH CHECK gap | ⚠️ Minor — `USING` used where `WITH CHECK` is more correct |
| Error boundary | ✅ PRESENT — covers entire app tree |
| No secrets in code | ✅ CONFIRMED — swapped-creds heuristic in lib/supabase.ts is the only credential handling |
| Input validation | ⚠️ PARTIAL — PlantForm validates display_name presence only; no length/XSS guards |
| Optimistic UI | ⚠️ MISSING — watering has perceptible lag |
| Offline support | ❌ NONE — all operations require network |
| Push notifications | ❌ NONE |
| Analytics | ❌ NONE |

---

### 12.7 Recommended Next Execution Sequence

```
PHASE B1.5B ─── Apply supabase-migration-v2.sql to live Supabase
                │
                └── Verify: 3 new tables + all column additions confirmed
                    Verify: CHECK constraints expanded for light_requirement + difficulty_level
                    Verify: App still functional (smoke test)

PHASE B1.5C ─── Post-migration activation shims
                │
                ├── Remove 4-field destructuring from useCreatePlant + useUpdatePlant
                ├── Verify user_entered_name persisted at plant creation
                └── Run typecheck

PHASE B2.0  ─── Pre-dataset migration pass
                │
                ├── UNIQUE index on care_tasks(plant_id, task_type) WHERE active_status
                ├── Composite index on care_tasks(plant_id, task_type, active_status)
                ├── GIN trgm index on plant_aliases(alias_name)
                ├── Composite index on plants(user_id, canonical_species_id)
                └── Fix RLS INSERT WITH CHECK on care_tasks, care_logs

PHASE B2.1  ─── canonical_species dataset seeding
                │
                └── Author and seed canonical_species rows (PLANT_0001 …)
                    Backfill canonical_species_id on plant_care_profiles rows

PHASE B2.2  ─── plant_aliases dataset seeding
                │
                └── Author and seed plant_aliases (common/regional names → canonical IDs)

PHASE 2.2   ─── Identity activation
                │
                ├── Fix getDaysUntilWatering to prefer next_due_at
                ├── Implement lookupByCanonicalId() + uncomment slot
                ├── Implement lookupByAlias() + uncomment slot
                ├── Implement getCurrentSeason() utility
                ├── Implement species autocomplete UI in PlantForm
                ├── Fix care_logs insert to include canonical_species_id
                ├── Implement existing-plant backfill job
                └── Uncomment seasonal frequency routing in careProfiles.ts

PHASE 2.3   ─── Scheduler evolution
                │
                ├── Author seasonal frequencies in plant_care_profiles
                ├── getDaysUntilWatering uses next_due_at (done in 2.2)
                ├── Seasonal recalculation on app foreground
                └── (Future) Push notification system
```

---

*This document represents the authoritative implementation topology map for PLANTMON at Phase B1.75. It should be updated when Phase 2.2 is activated.*
