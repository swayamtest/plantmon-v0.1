# PLANTMON Governance Document Inventory
**Type:** READ-ONLY inventory and reorganization planning document  
**Generated:** 2026-05-29  
**Scope:** Entire repository — all governance, architecture, migration, alignment, and execution documents  
**Purpose:** Pre-reorganization audit establishing a complete inventory before any files are moved  

---

## Table of Contents

1. [Inventory Summary](#1-inventory-summary)
2. [Complete Document Inventory](#2-complete-document-inventory)
   - [A. Root-Level Governance Directories](#a-root-level-governance-directories)
   - [B. Runtime Alignment Directory](#b-runtime-alignment-directory)
   - [C. Mobile Artifact Governance Documents](#c-mobile-artifact-governance-documents)
   - [D. docs/governance/ — Execution Tracking](#d-docsgovernance--execution-tracking)
   - [E. Root-Level Documentation](#e-root-level-documentation)
   - [F. SQL Migration Files](#f-sql-migration-files-governance-significant-non-markdown)
3. [Document Classification by Category](#3-document-classification-by-category)
4. [Reorganization Recommendations](#4-reorganization-recommendations)
5. [Reorganization Plan — Target Folder Structure](#5-reorganization-plan--target-folder-structure)
6. [Structural Observations](#6-structural-observations)

---

## 1. Inventory Summary

| Location | File count | Notes |
|---|---|---|
| `governance-audit/` | 6 | Root-level; 6 domain audit files |
| `governance-baseline/` | 6 | Root-level; 6 baseline freeze documents |
| `governance-migration/` | 6 | Root-level; 6 migration governance documents |
| `governance-reconciliation/` | 5 | Root-level; 5 reconciliation documents |
| `governance/` | 0 | Root-level; **empty directory** |
| `runtime-alignment/` | 2 | Root-level; runtime alignment + validation |
| `artifacts/mobile/` | 5 | Mixed with app source code; 5 governance docs |
| `docs/governance/` | 1 | New canonical docs path; master tracker only |
| Root (`/`) | 2 | README.md + replit.md |
| SQL files (in `artifacts/mobile/`) | 3 | Governance-significant; not markdown |
| **Total governance docs** | **30** | 27 markdown + 3 SQL |

---

## 2. Complete Document Inventory

### A. Root-Level Governance Directories

#### `governance-audit/` — 6 files (largest file: 64K — replit-runtime-risk-audit.md)

---

**1.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-schema-audit.md` |
| **Filename** | `replit-schema-audit.md` |
| **Category** | Governance Audit |
| **Purpose summary** | Comprehensive schema governance audit covering both ORM systems (Supabase SQL for mobile; Drizzle for api-server), all schema definition files, column/type inventories for all tables, query pattern analysis, and the governance note separating the two unrelated database systems. Establishes that PLANTMON mobile uses no ORM — all schema changes are manual SQL applied via Supabase Dashboard. |
| **Likely phase created** | G2.2 / Phase B1.75 |
| **Active or historical** | Active — canonical reference for schema topology |

---

**2.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-migration-audit.md` |
| **Filename** | `replit-migration-audit.md` |
| **Category** | Governance Audit — Migration Lineage |
| **Purpose summary** | Migration lineage audit covering all 3 SQL files, their application status against the live DB, and what migration categories have no SQL file at all (canonical dataset sync, backfill migrations, enum normalization). Documents that supabase-setup.sql is destructive and must never be run on the live DB. The definitive lineage baseline before Phase B2.1 migration execution. |
| **Likely phase created** | G2.2 / Phase B1.75–B2.0 |
| **Active or historical** | Active — pre-execution baseline; becomes historical after migration runs |

---

**3.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-onboarding-audit.md` |
| **Filename** | `replit-onboarding-audit.md` |
| **Category** | Governance Audit — Onboarding |
| **Purpose summary** | Full audit of the plant creation and species resolution pipeline. Documents the 4-step linear flow (form → PlantInput → shim → INSERT → task generation) with line-level references. Confirms all alias lookup, collapse routing, canonical routing, and autocomplete features are inactive (commented out). Notes that user_entered_name is populated at form but discarded before DB insert. |
| **Likely phase created** | G2.2 / Phase B2.0 |
| **Active or historical** | Active — authoritative onboarding state record |

---

**4.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-scheduler-audit.md` |
| **Filename** | `replit-scheduler-audit.md` |
| **Category** | Governance Audit — Scheduler |
| **Purpose summary** | Full audit of the watering and fertilizing scheduler. Documents the 3-layer architecture (computation in types/plant.ts, intelligence in careProfiles.ts, mutation in usePlants.ts), the client-side reactive model, device-clock dependency, and the critical unmanaged drift: next_due_at is written by mutations but never read by the computation layer — making it a write-only column in the current scheduler. |
| **Likely phase created** | G2.2 / Phase B2.0 |
| **Active or historical** | Active — canonical scheduler risk register |

---

**5.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-runtime-risk-audit.md` |
| **Filename** | `replit-runtime-risk-audit.md` |
| **Category** | Governance Audit — Runtime Risk |
| **Purpose summary** | Comprehensive runtime activation risk audit covering all passive risks that could cause unintended behavior during schema migration or activation events. Confirms no hidden auto-activations exist. Identifies the next_due_at / getDaysUntilWatering divergence as the highest-severity unmanaged risk. All activation slots are structurally comment-gated — cannot be triggered by any DB state, env var, or config change. |
| **Likely phase created** | G2.2 / Phase B2.0 |
| **Active or historical** | Active — pre-activation safety baseline |

---

**6.**
| Field | Value |
|---|---|
| **File path** | `governance-audit/replit-project-structure.md` |
| **Filename** | `replit-project-structure.md` |
| **Category** | Governance Audit — Project Structure |
| **Purpose summary** | Governance-grade project structure reference. Documents all top-level folders with runtime-criticality assessments, the two completely separate database systems (Supabase/mobile vs Drizzle/api-server), all workspace packages with their current status (active, scaffold, dormant), and the complete artifact and lib dependency graph. Confirms api-server and mockup-sandbox are dormant/tooling only. |
| **Likely phase created** | G2.2 / Phase B2.0 |
| **Active or historical** | Active — structural reference |

---

#### `governance-baseline/` — 6 files

---

**7.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md` |
| **Filename** | `OPERATIONAL_BASELINE_MANIFEST.md` |
| **Category** | Baseline Freeze |
| **Purpose summary** | The master operational baseline document for PLANTMON at the Phase B2.0 boundary. Synthesizes all 6 governance audits into a single validated baseline. Records the complete runtime state: canonical infrastructure entirely absent from live DB, all canonical columns null, zero active synchronization mechanisms, coexistence shim active, all 9 routing features OFF. The single document that summarizes "this is where PLANTMON is right now" at Phase B2.0. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — authoritative B2.0 baseline; frozen |

---

**8.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/MIGRATION_EXECUTION_LEDGER.md` |
| **Filename** | `MIGRATION_EXECUTION_LEDGER.md` |
| **Category** | Baseline Freeze — Migration History |
| **Purpose summary** | Authoritative migration execution history ledger. Documents the complete absence of any automated migration runner at every stack layer (app startup, Supabase client, Drizzle, CI, scripts). Every schema change to the live DB is manual-only. Records that no schema_migrations tracking table exists, all 3 SQL files have never been applied to the live DB (setup.sql is destructive; v2 and hardening are pending), and what ambiguities this creates for pre-execution state determination. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — requires update after first migration executes |

---

**9.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/ONBOARDING_BASELINE_SNAPSHOT.md` |
| **Filename** | `ONBOARDING_BASELINE_SNAPSHOT.md` |
| **Category** | Baseline Freeze — Onboarding |
| **Purpose summary** | Authoritative freeze of the onboarding pipeline state at Phase B2.0. Documents the 5-stage plant creation flow with exact field mappings, the identity resolution model (ilike-only, no alias/canonical lookup), the species recognition gap (silent 7-day fallback with no user feedback), and the full set of future activation dependencies for Phase 2.2 onboarding. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — frozen; becomes historical after Phase 2.2 onboarding activation |

---

**10.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/SCHEDULER_BASELINE_SNAPSHOT.md` |
| **Filename** | `SCHEDULER_BASELINE_SNAPSHOT.md` |
| **Category** | Baseline Freeze — Scheduler |
| **Purpose summary** | Authoritative freeze of the scheduler architecture at Phase B2.0. Documents the client-side reactive computation model, device-clock dependency, timezone/DST non-handling, the static-interval legacy model (last_completed_at + frequency_days), next_due_at write-only drift, and all future activation dependencies for seasonal scheduling. The measurement baseline that makes future scheduler changes verifiable. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — frozen; becomes historical after scheduler rebinding |

---

**11.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/COEXISTENCE_STATE_FREEZE.md` |
| **Filename** | `COEXISTENCE_STATE_FREEZE.md` |
| **Category** | Baseline Freeze — Coexistence Architecture |
| **Purpose summary** | Authoritative coexistence architecture freeze. Documents all three layers of canonical infrastructure isolation (TypeScript type declarations, application logic comment gates, SQL pending migration), confirms that no type declaration, no commented slot, and no pending SQL can self-activate, and records the complete inventory of which types/interfaces/functions are present-but-inactive. The definitive record of the coexistence design contract at Phase B2.0. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — frozen; the coexistence design reference |

---

**12.**
| Field | Value |
|---|---|
| **File path** | `governance-baseline/RUNTIME_AUTHORITY_DECLARATION.md` |
| **Filename** | `RUNTIME_AUTHORITY_DECLARATION.md` |
| **Category** | Foundational Governance — Authority Hierarchy |
| **Purpose summary** | Defines the 4-tier governance authority hierarchy (Tier 1: PRD/governance corpus; Tier 2: Live Supabase DB; Tier 3: Coexistence runtime; Tier 4: Replit source files). Declares which tier holds authority over each domain of runtime behavior, what no tier may override without a formal governance event, and what governance disciplines must be established before Phase B2.2. The constitutional document for PLANTMON governance. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — foundational; superseded only by an explicit governance revision |

---

#### `governance-reconciliation/` — 5 files

---

**13.**
| Field | Value |
|---|---|
| **File path** | `governance-reconciliation/SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` |
| **Filename** | `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` |
| **Category** | Reconciliation |
| **Purpose summary** | 5-way alignment matrix reconciling every governance-significant schema object across: (1) live Supabase DB, (2) TypeScript models, (3) supabase-setup.sql, (4) pending migration SQL, and (5) runtime assumption. Uses a 5-state legend (EXISTS/ACTIVE, DECLARED/TYPED, ABSENT, CONFLICT, SHIM-PROTECTED). The definitive ground-truth document for understanding where each schema object exists and where it is merely assumed. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — frozen alignment baseline; becomes historical after Phase 2.1 migration |

---

**14.**
| Field | Value |
|---|---|
| **File path** | `governance-reconciliation/STALE_ASSUMPTION_REGISTRY.md` |
| **Filename** | `STALE_ASSUMPTION_REGISTRY.md` |
| **Category** | Reconciliation — Assumption Audit |
| **Purpose summary** | Exhaustive registry of assumptions embedded in TypeScript source, governance documents, and runtime logic that are already stale, conditionally stale, or structurally stale. Each entry classifies staleness (HARMLESS / GOVERNANCE DEBT / ACTIVATION RISK / MIGRATION RISK) and records the condition under which it becomes harmful. The register a future developer must check before any activation to identify which assumptions must be corrected first. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — requires review at every activation event |

---

**15.**
| Field | Value |
|---|---|
| **File path** | `governance-reconciliation/ACTIVATION_BOUNDARY_REGISTRY.md` |
| **Filename** | `ACTIVATION_BOUNDARY_REGISTRY.md` |
| **Category** | Reconciliation — Activation Planning |
| **Purpose summary** | Authoritative activation boundary registry. For every currently-inactive system (alias routing, collapse routing, canonical routing, scheduler rebinding, archetype routing, seasonal scheduling), documents the exact mechanism keeping it inactive, the complete set of prerequisites (schema, data, runtime), and the specific failure mode produced by premature activation. Uses 7 defined activation state terms (SCHEMA-LIVE, DATA-LIVE, RUNTIME-LIVE, RUNTIME-OFF, COMMENT-GATED, UNIMPLEMENTED, PARTIALLY-WIRED). |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — the go-to reference before any activation |

---

**16.**
| Field | Value |
|---|---|
| **File path** | `governance-reconciliation/MIGRATION_AUTHORITY_DECLARATION.md` |
| **Filename** | `MIGRATION_AUTHORITY_DECLARATION.md` |
| **Category** | Reconciliation — Migration Governance |
| **Purpose summary** | Migration governance doctrine declaration. Defines the schema split across two authority planes (live Supabase DB vs Replit source files) and explains why this is designed pre-migration state, not a failure. Establishes the live DB as the authoritative persistence topology. Defines the migration authority hierarchy and the safety constraints that prohibit specific migration patterns. The doctrine layer above the procedural migration documents. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — doctrine document; persists across phases |

---

**17.**
| Field | Value |
|---|---|
| **File path** | `governance-reconciliation/RUNTIME_COMPATIBILITY_CONTRACT.md` |
| **Filename** | `RUNTIME_COMPATIBILITY_CONTRACT.md` |
| **Category** | Reconciliation — Compatibility Contract |
| **Purpose summary** | Formal runtime compatibility contract defining: (1) current guarantees (properties that hold unconditionally), (2) isolation invariants (structural properties no single change can violate), and (3) preservation constraints (obligations for future phases). Establishes legacy onboarding continuity, canonical isolation, shim atomicity, and query stability as current guarantees. Future phases must demonstrate they preserve each guarantee before activation. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — contract layer; phases must attest to preservation |

---

#### `governance-migration/` — 6 files

---

**18.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/MIGRATION_EXECUTION_PROTOCOL.md` |
| **Filename** | `MIGRATION_EXECUTION_PROTOCOL.md` |
| **Category** | Migration Governance — Protocol |
| **Purpose summary** | The authoritative 8-step migration execution protocol governing every schema change applied to the PLANTMON live Supabase DB. Defines the additive evolution principle (operation permit matrix with YES/CONDITIONAL/NO verdicts), migration classification system, review and approval requirements, staged execution model, and the single known deviation (plant_care_profiles DROP-and-recreate in §B7 of migration-v2.sql). The procedural spine of all migration governance. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — operational; executed before every migration |

---

**19.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/MIGRATION_PRECHECK_RUNBOOK.md` |
| **Filename** | `MIGRATION_PRECHECK_RUNBOOK.md` |
| **Category** | Migration Governance — Runbook |
| **Purpose summary** | Complete pre-migration validation runbook. All queries are READ-ONLY SELECT statements. Confirms live DB is in exact expected pre-migration state before any SQL executes. Covers schema existence checks, row count baselines (PC-DAT-01 etc.), constraint name captures, and abort conditions. Must be fully executed and all queries must pass before Step 5 (Staged Execution) of the Migration Execution Protocol may proceed. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — operational; executed immediately before each migration |

---

**20.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/MIGRATION_POSTCHECK_RUNBOOK.md` |
| **Filename** | `MIGRATION_POSTCHECK_RUNBOOK.md` |
| **Category** | Migration Governance — Runbook |
| **Purpose summary** | Complete post-migration verification runbook. Executed immediately after staged migration execution. Covers schema integrity (new objects exist, nothing dropped), row count deltas (must not decrease from precheck baseline), canonical isolation (new tables exist but remain zero-populated), coexistence integrity (runtime behavior unchanged), and RLS policy verification. Each query must match its expected value; any failure is a ROLLBACK-REQUIRED or INVESTIGATE-REQUIRED condition. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — operational; executed immediately after each migration |

---

**21.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/MIGRATION_ROLLBACK_STRATEGY.md` |
| **Filename** | `MIGRATION_ROLLBACK_STRATEGY.md` |
| **Category** | Migration Governance — Rollback |
| **Purpose summary** | Authoritative rollback governance model. Defines the three possible responses to a migration failure (rollback, hotfix-forward, coexistence continuation) and the framework for choosing between them. Documents the rollback-safe sequencing requirement (reverse order of forward migration), the irreversibility threshold (the point past which rollback risks data loss), and the runtime properties every rollback must preserve. Includes the full forward/rollback dependency chain for supabase-migration-v2.sql. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — operational contingency; referenced if migration fails |

---

**22.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/ACTIVATION_SEQUENCE_GUARDRAILS.md` |
| **Filename** | `ACTIVATION_SEQUENCE_GUARDRAILS.md` |
| **Category** | Migration Governance — Activation Planning |
| **Purpose summary** | Authoritative activation sequencing guardrail specification. Defines the doctrine distinguishing 3 activation categories (Infrastructure, Data, Runtime), the required ordering of all activation events from Phase B2.0 through seasonal scheduling, explicitly forbidden orderings with their specific failure modes, runtime protections constraining every activation, and governance escalation conditions that block or pause sequences. Critical framing: activation is irreversible once user-facing consequences occur. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active — operational; must be consulted before every activation event |

---

**23.**
| Field | Value |
|---|---|
| **File path** | `governance-migration/SCHEMA_MIGRATIONS_TABLE_SPEC.md` |
| **Filename** | `SCHEMA_MIGRATIONS_TABLE_SPEC.md` |
| **Category** | Migration Governance — Infrastructure Specification |
| **Purpose summary** | Specification for a future `schema_migrations` tracking table in the live Supabase DB. Documents why migration observability is required (3 operational risks: state ambiguity, governance document drift, accountability gaps), the full field schema for the tracking table, integration model with the migration execution protocol, and non-goals. The table does NOT yet exist in the live DB — this is a governance specification for future implementation. |
| **Likely phase created** | Phase B2.0 |
| **Active or historical** | Active specification — not yet implemented; pending Phase B2.1 |

---

### B. Runtime Alignment Directory

#### `runtime-alignment/` — 2 files

---

**24.**
| Field | Value |
|---|---|
| **File path** | `runtime-alignment/RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` |
| **Filename** | `RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` |
| **Category** | Runtime Alignment |
| **Purpose summary** | G2.2/Phase B1.75 TypeScript-to-database alignment audit. Full matrix of every TypeScript type, interface, and mutation against live DB schema. Identifies all alignment gaps, verifies shim coverage, and documents the complete set of schema-touching code with their live-DB safety status. Companion document to the RUNTIME_TOPOLOGY_AUDIT_v1.md; that audit covers file topology while this covers type/schema alignment. |
| **Likely phase created** | G2.2 / Phase B1.75 (May 28) |
| **Active or historical** | Active — alignment baseline for all subsequent runtime work |

---

**25.**
| Field | Value |
|---|---|
| **File path** | `runtime-alignment/G25_RUNTIME_VALIDATION.md` |
| **Filename** | `G25_RUNTIME_VALIDATION.md` |
| **Category** | Runtime Alignment — Validation |
| **Purpose summary** | G2.5 end-to-end runtime validation pass. Sweeps all schema-touching code to verify: all Supabase queries reference columns that exist in the live v0.1 DB; all TypeScript types align with live DB shape; all mutations apply compatibility shims correctly; no runtime code attempts to write Phase 2.1 columns that don't exist in the live DB. Verdict: SAFE. The formal sign-off that G2.4 alignment changes are correct and the runtime is stable. |
| **Likely phase created** | G2.5 (May 28) |
| **Active or historical** | Active — formal validation record; superseded by next validation pass |

---

### C. Mobile Artifact Governance Documents

#### `artifacts/mobile/` — 5 governance documents co-located with app source

---

**26.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/SCHEMA_INVENTORY_v0.1.md` |
| **Filename** | `SCHEMA_INVENTORY_v0.1.md` |
| **Category** | Foundational Governance — Schema Baseline |
| **Purpose summary** | The original live DB baseline audit — the governance starting point for all subsequent schema work. Documents the 6-table v0.1 schema (plants, care_tasks, care_logs, plant_care_profiles, health_logs, journal_entries) with column inventories, RLS policy status, index coverage, and the gap analysis that identified the need for Phase 2.1. The oldest governance document in the project; the foundation everything else is built on. |
| **Likely phase created** | G2.0 / Phase 1.5 (May 26) |
| **Active or historical** | Historical baseline — the v0.1 snapshot; superseded by operational baseline manifest but remains the source-of-truth for original schema design |

---

**27.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` |
| **Filename** | `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` |
| **Category** | Foundational Governance — Implementation Blueprint |
| **Purpose summary** | The canonical Phase 2.1 schema design blueprint. Documents the 4-layer divergence (local SQL, TypeScript types, live DB, runtime code) at the G2.0/2.1 boundary, the full design for canonical_species/plant_aliases/collapse_mappings tables, the 4 new columns added to plants, and the activation sequence. Established canonical_species_id as the runtime backbone of all canonical intelligence. The authoritative Phase 2.1 design reference. |
| **Likely phase created** | G2.1 (May 27) |
| **Active or historical** | Active — the Phase 2.1 design reference; superseded only by a new blueprint version |

---

**28.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` |
| **Filename** | `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` |
| **Category** | Runtime Alignment — Compatibility |
| **Purpose summary** | Phase B1.5A (G2.1.5) runtime-schema synchronization report. Documents the shim design (4-field strip in useCreatePlant/useUpdatePlant), confirms migration clearance was granted, establishes the 9-feature OFF registry (all canonical routing inactive), and defines the pre-migration state that all subsequent governance assumes. The document that formalized the coexistence model before the broader governance audit corpus was built. |
| **Likely phase created** | G2.1.5 / Phase B1.5A (May 27) |
| **Active or historical** | Active — the original shim specification; shims remain active |

---

**29.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/RUNTIME_TOPOLOGY_AUDIT_v1.md` |
| **Filename** | `RUNTIME_TOPOLOGY_AUDIT_v1.md` |
| **Category** | Governance Audit — Topology |
| **Purpose summary** | Phase B1.75 (G2.2) full runtime topology audit. Complete file inventory of all mobile artifact source files with their roles and schema-coupling assessments. Maps all cross-file dependencies, identifies all Supabase query sites, and flags 3 high-risk couplings (next_due_at drift, maybeSingle without active_status filter, silent profile fallback). The structural foundation for all subsequent governance and reconciliation documents. |
| **Likely phase created** | G2.2 / Phase B1.75 (May 27) |
| **Active or historical** | Active — the topology baseline; superseded by future topology re-audit |

---

**30.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` |
| **Filename** | `PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` |
| **Category** | Migration Governance — Pre-execution Report |
| **Purpose summary** | Phase B2.0 (G2.3) hardening migration governance report. Documents the 5-category hardening migration (constraint hardening, index additions, RLS policy alignment, trigger installation, data integrity checks), explains why each category is required before canonical dataset loading, and establishes the required execution order (supabase-migration-v2.sql first, then PRE_DATASET_HARDENING_MIGRATION_v1.sql, then dataset load). The migration-readiness sign-off document for Phase B2.1. |
| **Likely phase created** | G2.3 / Phase B2.0 (May 27) |
| **Active or historical** | Active — pending execution; becomes historical after migration runs |

---

### D. docs/governance/ — Execution Tracking

---

**31.**
| Field | Value |
|---|---|
| **File path** | `docs/governance/PLANTMON_EXECUTION_MASTER_TRACKER.md` |
| **Filename** | `PLANTMON_EXECUTION_MASTER_TRACKER.md` |
| **Category** | Execution Tracking |
| **Purpose summary** | Master execution tracker synthesizing all G2.x phase history (G2.0–G2.6), current runtime state, runtime activation registry (all 9 features OFF), pending migration registry, technical debt register (6 items), MVP roadmap (M1.0–M1.6), and authoritative document index. The highest-level governance document; the entry point for understanding PLANTMON's current state and trajectory. Created May 2026. |
| **Likely phase created** | G2.6 (May 29) |
| **Active or historical** | Active — living document; updated as phases complete |

---

### E. Root-Level Documentation

---

**32.**
| Field | Value |
|---|---|
| **File path** | `README.md` |
| **Filename** | `README.md` |
| **Category** | Product Documentation |
| **Purpose summary** | Public-facing architecture snapshot for the v0.1 tag. Documents the stable v0.1 baseline (auth, CRUD, 46 species care profiles, auto-scheduling), the 6-table schema, full stack, project structure, and upcoming post-v0.1 work. Not a governance document — it is product-facing documentation for the GitHub repo. |
| **Likely phase created** | v0.1 tag (May 2026) |
| **Active or historical** | Active — note: describes v0.1 state; should be updated when significant features land |

---

**33.**
| Field | Value |
|---|---|
| **File path** | `replit.md` |
| **Filename** | `replit.md` |
| **Category** | Operational Documentation — Agent Instructions |
| **Purpose summary** | Replit agent operational guide. Contains run commands, stack summary, and placeholders for where-things-live, architecture decisions, product description, user preferences, and gotchas. Currently partially populated (stack section filled; most sections still placeholder). Governs agent behavior across sessions. |
| **Likely phase created** | Initial setup (May 2026) |
| **Active or historical** | Active — operational |

---

### F. SQL Migration Files (Governance-Significant, Non-Markdown)

---

**34.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/supabase-setup.sql` |
| **Filename** | `supabase-setup.sql` |
| **Category** | Schema Definition — Destructive Reset |
| **Purpose summary** | Complete fresh-install schema for PLANTMON. Drops all 9 tables (CASCADE) and recreates the full Phase 2.1 schema with constraints, RLS, indexes, triggers, and 46 care profile seed rows. NEVER to be run on the live Supabase DB. The authoritative definition of what the complete Phase 2.1 schema looks like. Dev/reset use only. |
| **Likely phase created** | G2.1 (schema was updated from v0.1 to Phase 2.1) |
| **Active or historical** | Active — authoritative schema reference; dev-only |

---

**35.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/supabase-migration-v2.sql` |
| **Filename** | `supabase-migration-v2.sql` |
| **Category** | Schema Migration — Pending Execution |
| **Purpose summary** | Phase 2.1 additive migration. Creates canonical_species, plant_aliases, collapse_mappings tables; adds 4 columns to plants; adds canonical_species_id to care_tasks and care_logs; recreates plant_care_profiles with canonical_species_id column (§B7 — the single non-additive operation requiring pre-execution user-data verification). PENDING EXECUTION on live DB. |
| **Likely phase created** | G2.1 (May 2026) |
| **Active or historical** | Active — pending execution |

---

**36.**
| Field | Value |
|---|---|
| **File path** | `artifacts/mobile/PRE_DATASET_HARDENING_MIGRATION_v1.sql` |
| **Filename** | `PRE_DATASET_HARDENING_MIGRATION_v1.sql` |
| **Category** | Schema Migration — Pending Execution |
| **Purpose summary** | Phase B2.0 hardening migration. Adds GIN and UNIQUE indexes on plant_aliases for alias lookup performance; installs updated_at triggers on canonical_species, plant_aliases, collapse_mappings; adds RLS policies on new tables; adds data integrity verification queries. Must run AFTER supabase-migration-v2.sql. PENDING EXECUTION on live DB. |
| **Likely phase created** | G2.3 / Phase B2.0 (May 2026) |
| **Active or historical** | Active — pending execution |

---

## 3. Document Classification by Category

### Foundational Governance (3 documents)
Documents that define the baseline state, authority hierarchy, or design intent that all other governance references.

| # | Document | Location |
|---|---|---|
| 1 | `SCHEMA_INVENTORY_v0.1.md` | `artifacts/mobile/` |
| 2 | `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` | `artifacts/mobile/` |
| 3 | `RUNTIME_AUTHORITY_DECLARATION.md` | `governance-baseline/` |

### Execution Tracking (1 document)
Master tracker synthesizing phase history, current state, and roadmap.

| # | Document | Location |
|---|---|---|
| 1 | `PLANTMON_EXECUTION_MASTER_TRACKER.md` | `docs/governance/` |

### Governance Audits (7 documents)
Domain-specific read-only audits; source-of-truth for what each system does.

| # | Document | Location |
|---|---|---|
| 1 | `replit-schema-audit.md` | `governance-audit/` |
| 2 | `replit-migration-audit.md` | `governance-audit/` |
| 3 | `replit-onboarding-audit.md` | `governance-audit/` |
| 4 | `replit-scheduler-audit.md` | `governance-audit/` |
| 5 | `replit-runtime-risk-audit.md` | `governance-audit/` |
| 6 | `replit-project-structure.md` | `governance-audit/` |
| 7 | `RUNTIME_TOPOLOGY_AUDIT_v1.md` | `artifacts/mobile/` |

### Baseline Freezes (5 documents)
Point-in-time validated snapshots of system state at Phase B2.0 boundary.

| # | Document | Location |
|---|---|---|
| 1 | `OPERATIONAL_BASELINE_MANIFEST.md` | `governance-baseline/` |
| 2 | `MIGRATION_EXECUTION_LEDGER.md` | `governance-baseline/` |
| 3 | `ONBOARDING_BASELINE_SNAPSHOT.md` | `governance-baseline/` |
| 4 | `SCHEDULER_BASELINE_SNAPSHOT.md` | `governance-baseline/` |
| 5 | `COEXISTENCE_STATE_FREEZE.md` | `governance-baseline/` |

### Reconciliation (5 documents)
Cross-layer alignment analysis; stale assumption registries; compatibility contracts.

| # | Document | Location |
|---|---|---|
| 1 | `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` | `governance-reconciliation/` |
| 2 | `STALE_ASSUMPTION_REGISTRY.md` | `governance-reconciliation/` |
| 3 | `ACTIVATION_BOUNDARY_REGISTRY.md` | `governance-reconciliation/` |
| 4 | `MIGRATION_AUTHORITY_DECLARATION.md` | `governance-reconciliation/` |
| 5 | `RUNTIME_COMPATIBILITY_CONTRACT.md` | `governance-reconciliation/` |

### Migration Governance (7 documents)
Protocol, runbooks, rollback strategy, and specs governing migration execution.

| # | Document | Location |
|---|---|---|
| 1 | `MIGRATION_EXECUTION_PROTOCOL.md` | `governance-migration/` |
| 2 | `MIGRATION_PRECHECK_RUNBOOK.md` | `governance-migration/` |
| 3 | `MIGRATION_POSTCHECK_RUNBOOK.md` | `governance-migration/` |
| 4 | `MIGRATION_ROLLBACK_STRATEGY.md` | `governance-migration/` |
| 5 | `ACTIVATION_SEQUENCE_GUARDRAILS.md` | `governance-migration/` |
| 6 | `SCHEMA_MIGRATIONS_TABLE_SPEC.md` | `governance-migration/` |
| 7 | `PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` | `artifacts/mobile/` |

### Runtime Alignment (3 documents)
TypeScript/DB alignment, topology, and validation documents.

| # | Document | Location |
|---|---|---|
| 1 | `RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` | `runtime-alignment/` |
| 2 | `G25_RUNTIME_VALIDATION.md` | `runtime-alignment/` |
| 3 | `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | `artifacts/mobile/` |

### Activation Planning (cross-cutting)
Documents spanning both reconciliation and migration governance. Already catalogued above under their primary categories; listed here for cross-reference.

| Document | Primary category | Why it also relates to activation |
|---|---|---|
| `ACTIVATION_BOUNDARY_REGISTRY.md` | Reconciliation | The go-to reference before any activation event |
| `ACTIVATION_SEQUENCE_GUARDRAILS.md` | Migration Governance | Defines the required activation ordering doctrine |
| `COEXISTENCE_STATE_FREEZE.md` | Baseline Freeze | Contains the Future Activation Dependencies section |

---

## 4. Reorganization Recommendations

For each document, the recommendation is: **KEEP IN PLACE**, **MOVE**, or **ARCHIVE**.

| Document | Current location | Recommendation | Target (if MOVE) | Rationale |
|---|---|---|---|---|
| `PLANTMON_EXECUTION_MASTER_TRACKER.md` | `docs/governance/` | **KEEP IN PLACE** | — | Already in the canonical target root |
| `SCHEMA_INVENTORY_v0.1.md` | `artifacts/mobile/` | **MOVE** | `docs/governance/foundational/` | Governance doc co-located with source code; should live with governance |
| `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md` | `artifacts/mobile/` | **MOVE** | `docs/governance/foundational/` | Governance doc co-located with source code |
| `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md` | `artifacts/mobile/` | **MOVE** | `docs/governance/runtime-alignment/` | Governance doc co-located with source code |
| `RUNTIME_TOPOLOGY_AUDIT_v1.md` | `artifacts/mobile/` | **MOVE** | `docs/governance/audits/` | Governance doc co-located with source code |
| `PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` | `artifacts/mobile/` | **MOVE** | `docs/governance/migrations/` | Governance doc co-located with source code |
| `replit-schema-audit.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate all governance under `docs/governance/` |
| `replit-migration-audit.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate |
| `replit-onboarding-audit.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate |
| `replit-scheduler-audit.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate |
| `replit-runtime-risk-audit.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate |
| `replit-project-structure.md` | `governance-audit/` | **MOVE** | `docs/governance/audits/` | Consolidate |
| `OPERATIONAL_BASELINE_MANIFEST.md` | `governance-baseline/` | **MOVE** | `docs/governance/baselines/` | Consolidate |
| `MIGRATION_EXECUTION_LEDGER.md` | `governance-baseline/` | **MOVE** | `docs/governance/baselines/` | Consolidate |
| `ONBOARDING_BASELINE_SNAPSHOT.md` | `governance-baseline/` | **MOVE** | `docs/governance/baselines/` | Consolidate |
| `SCHEDULER_BASELINE_SNAPSHOT.md` | `governance-baseline/` | **MOVE** | `docs/governance/baselines/` | Consolidate |
| `COEXISTENCE_STATE_FREEZE.md` | `governance-baseline/` | **MOVE** | `docs/governance/baselines/` | Consolidate |
| `RUNTIME_AUTHORITY_DECLARATION.md` | `governance-baseline/` | **MOVE** | `docs/governance/foundational/` | Authority hierarchy is foundational, not just a baseline snapshot |
| `SUPABASE_REPLIT_ALIGNMENT_MATRIX.md` | `governance-reconciliation/` | **MOVE** | `docs/governance/reconciliation/` | Consolidate |
| `STALE_ASSUMPTION_REGISTRY.md` | `governance-reconciliation/` | **MOVE** | `docs/governance/reconciliation/` | Consolidate |
| `ACTIVATION_BOUNDARY_REGISTRY.md` | `governance-reconciliation/` | **MOVE** | `docs/governance/reconciliation/` | Consolidate |
| `MIGRATION_AUTHORITY_DECLARATION.md` | `governance-reconciliation/` | **MOVE** | `docs/governance/reconciliation/` | Consolidate |
| `RUNTIME_COMPATIBILITY_CONTRACT.md` | `governance-reconciliation/` | **MOVE** | `docs/governance/reconciliation/` | Consolidate |
| `MIGRATION_EXECUTION_PROTOCOL.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate |
| `MIGRATION_PRECHECK_RUNBOOK.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate |
| `MIGRATION_POSTCHECK_RUNBOOK.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate |
| `MIGRATION_ROLLBACK_STRATEGY.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate |
| `ACTIVATION_SEQUENCE_GUARDRAILS.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate; also relates to activation planning |
| `SCHEMA_MIGRATIONS_TABLE_SPEC.md` | `governance-migration/` | **MOVE** | `docs/governance/migrations/` | Consolidate |
| `RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md` | `runtime-alignment/` | **MOVE** | `docs/governance/runtime-alignment/` | Consolidate |
| `G25_RUNTIME_VALIDATION.md` | `runtime-alignment/` | **MOVE** | `docs/governance/runtime-alignment/` | Consolidate |
| `README.md` | `/` (root) | **KEEP IN PLACE** | — | Conventional root-level product README; not a governance doc |
| `replit.md` | `/` (root) | **KEEP IN PLACE** | — | Agent operational guide; must stay at root |
| `supabase-setup.sql` | `artifacts/mobile/` | **KEEP IN PLACE** | — | Runtime artifact — must stay with app source code |
| `supabase-migration-v2.sql` | `artifacts/mobile/` | **KEEP IN PLACE** | — | Migration SQL — must stay with app source code; governance documents reference this path |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | `artifacts/mobile/` | **KEEP IN PLACE** | — | Migration SQL — must stay with app source code |
| `governance/` (empty dir) | `/` (root) | **NOTE** | — | Empty directory with no files; can be removed after reorganization |

---

## 5. Reorganization Plan — Target Folder Structure

The following is the complete recommended target structure. All 27 governance markdown files consolidate under `docs/governance/`. SQL files and root docs remain in place.

```
docs/
└── governance/
    │
    ├── PLANTMON_EXECUTION_MASTER_TRACKER.md   ← KEEP IN PLACE (already here)
    ├── GOVERNANCE_DOCUMENT_INVENTORY.md       ← KEEP IN PLACE (this document)
    │
    ├── foundational/                          ← NEW SUBDIRECTORY
    │   ├── SCHEMA_INVENTORY_v0.1.md           ← MOVE from artifacts/mobile/
    │   ├── RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md  ← MOVE from artifacts/mobile/
    │   └── RUNTIME_AUTHORITY_DECLARATION.md   ← MOVE from governance-baseline/
    │
    ├── audits/                                ← NEW SUBDIRECTORY
    │   ├── replit-project-structure.md        ← MOVE from governance-audit/
    │   ├── replit-schema-audit.md             ← MOVE from governance-audit/
    │   ├── replit-migration-audit.md          ← MOVE from governance-audit/
    │   ├── replit-onboarding-audit.md         ← MOVE from governance-audit/
    │   ├── replit-scheduler-audit.md          ← MOVE from governance-audit/
    │   ├── replit-runtime-risk-audit.md       ← MOVE from governance-audit/
    │   └── RUNTIME_TOPOLOGY_AUDIT_v1.md       ← MOVE from artifacts/mobile/
    │
    ├── baselines/                             ← NEW SUBDIRECTORY
    │   ├── OPERATIONAL_BASELINE_MANIFEST.md   ← MOVE from governance-baseline/
    │   ├── COEXISTENCE_STATE_FREEZE.md        ← MOVE from governance-baseline/
    │   ├── MIGRATION_EXECUTION_LEDGER.md      ← MOVE from governance-baseline/
    │   ├── ONBOARDING_BASELINE_SNAPSHOT.md    ← MOVE from governance-baseline/
    │   └── SCHEDULER_BASELINE_SNAPSHOT.md     ← MOVE from governance-baseline/
    │
    ├── reconciliation/                        ← NEW SUBDIRECTORY
    │   ├── SUPABASE_REPLIT_ALIGNMENT_MATRIX.md   ← MOVE from governance-reconciliation/
    │   ├── STALE_ASSUMPTION_REGISTRY.md          ← MOVE from governance-reconciliation/
    │   ├── ACTIVATION_BOUNDARY_REGISTRY.md       ← MOVE from governance-reconciliation/
    │   ├── MIGRATION_AUTHORITY_DECLARATION.md    ← MOVE from governance-reconciliation/
    │   └── RUNTIME_COMPATIBILITY_CONTRACT.md     ← MOVE from governance-reconciliation/
    │
    ├── migrations/                            ← NEW SUBDIRECTORY
    │   ├── MIGRATION_EXECUTION_PROTOCOL.md       ← MOVE from governance-migration/
    │   ├── MIGRATION_PRECHECK_RUNBOOK.md         ← MOVE from governance-migration/
    │   ├── MIGRATION_POSTCHECK_RUNBOOK.md        ← MOVE from governance-migration/
    │   ├── MIGRATION_ROLLBACK_STRATEGY.md        ← MOVE from governance-migration/
    │   ├── ACTIVATION_SEQUENCE_GUARDRAILS.md     ← MOVE from governance-migration/
    │   ├── SCHEMA_MIGRATIONS_TABLE_SPEC.md       ← MOVE from governance-migration/
    │   └── PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md  ← MOVE from artifacts/mobile/
    │
    └── runtime-alignment/                     ← NEW SUBDIRECTORY
        ├── LOCAL_RUNTIME_COMPATIBILITY_REPORT.md   ← MOVE from artifacts/mobile/
        ├── RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md       ← MOVE from runtime-alignment/
        └── G25_RUNTIME_VALIDATION.md               ← MOVE from runtime-alignment/


artifacts/
└── mobile/
    ├── supabase-setup.sql              ← KEEP IN PLACE (app source)
    ├── supabase-migration-v2.sql       ← KEEP IN PLACE (app source)
    └── PRE_DATASET_HARDENING_MIGRATION_v1.sql  ← KEEP IN PLACE (app source)
    (all 5 governance .md files MOVED OUT to docs/governance/)


Root-level (keep as-is):
├── README.md                           ← KEEP IN PLACE
└── replit.md                           ← KEEP IN PLACE


Root-level directories to remove after reorganization:
├── governance-audit/        ← REMOVE (all 6 files moved to docs/governance/audits/)
├── governance-baseline/     ← REMOVE (5 files moved to baselines/, 1 to foundational/)
├── governance-migration/    ← REMOVE (all 6 files moved to docs/governance/migrations/)
├── governance-reconciliation/  ← REMOVE (all 5 files moved to docs/governance/reconciliation/)
├── governance/              ← REMOVE (empty — no files to move)
└── runtime-alignment/       ← REMOVE (both files moved to docs/governance/runtime-alignment/)
```

### Move count summary

| Source directory | Files to move | Destination |
|---|---|---|
| `governance-audit/` | 6 | `docs/governance/audits/` |
| `governance-baseline/` | 5 → baselines, 1 → foundational | `docs/governance/baselines/` and `docs/governance/foundational/` |
| `governance-migration/` | 6 | `docs/governance/migrations/` |
| `governance-reconciliation/` | 5 | `docs/governance/reconciliation/` |
| `runtime-alignment/` | 2 | `docs/governance/runtime-alignment/` |
| `artifacts/mobile/` | 5 governance .md files | `docs/governance/` (split across subdirs) |
| **Total files to move** | **25** | 6 root-level directories eliminated |

---

## 6. Structural Observations

### Observation 1 — Governance docs are scattered across 7 root-level locations
The current repository has governance documentation in `governance-audit/`, `governance-baseline/`, `governance-migration/`, `governance-reconciliation/`, `runtime-alignment/`, `artifacts/mobile/`, and `docs/governance/` — seven separate locations with no single entry point. The proposed reorganization consolidates all 27 governance docs under `docs/governance/` with 6 clear subdirectories.

### Observation 2 — 5 governance documents are co-located with app source code
`SCHEMA_INVENTORY_v0.1.md`, `RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md`, `LOCAL_RUNTIME_COMPATIBILITY_REPORT.md`, `RUNTIME_TOPOLOGY_AUDIT_v1.md`, and `PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md` all live in `artifacts/mobile/` alongside TypeScript source files. This creates confusion about what is "application code" vs "governance documentation." Moving them out does not affect the SQL files, which should remain in `artifacts/mobile/` as they are part of the app's operational artifact.

### Observation 3 — The `governance/` root directory is empty
A `governance/` directory exists at the root but contains no files. It was likely created incidentally and never populated. It can be removed after reorganization.

### Observation 4 — Internal cross-references will need updating after any move
Many governance documents reference each other by relative path (e.g., `governance-audit/replit-migration-audit.md`, `governance-baseline/OPERATIONAL_BASELINE_MANIFEST.md`). A file move without updating these references will leave broken links throughout the corpus. Before executing any move, a cross-reference audit should enumerate all internal links, and the move operation should include a search-and-replace pass on all changed paths.

### Observation 5 — SQL files should not move, but their governance reports should
The 3 SQL files (`supabase-setup.sql`, `supabase-migration-v2.sql`, `PRE_DATASET_HARDENING_MIGRATION_v1.sql`) must remain in `artifacts/mobile/` because they are operational artifacts — the runbooks, protocol documents, and compatibility reports all reference them by their current paths. Moving the `.sql` files would break all governance runbook SQL execution instructions. However, their corresponding `.md` governance reports should move.

### Observation 6 — The `replit-*` naming convention in `governance-audit/` conflicts with the UPPERCASE convention of all other governance documents
The audit files use `replit-kebab-case.md`; every other governance document uses `SCREAMING_SNAKE_CASE.md`. A naming normalization pass could accompany the reorganization (e.g., rename to `SCHEMA_GOVERNANCE_AUDIT.md`, `MIGRATION_LINEAGE_AUDIT.md` etc.) — but this is optional and secondary to the move.

### Observation 7 — `MIGRATION_EXECUTION_LEDGER.md` requires updating after first migration runs
This document is a baseline freeze ("no migrations have been applied as of Phase B2.0"). Once `supabase-migration-v2.sql` is executed, it must be updated to record the execution event. It is the only baseline freeze document that is explicitly time-sensitive in this way.
