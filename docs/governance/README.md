# PLANTMON Governance Documentation

This directory is the single authoritative home for all PLANTMON governance documentation.

No governance documentation lives outside this directory (with the exception of SQL migration files, which remain co-located with the mobile app artifact at `artifacts/mobile/`).

---

## Folder Structure

```
docs/governance/
├── README.md                              ← This file — navigation and governance policy
├── PLANTMON_EXECUTION_MASTER_TRACKER.md  ← AUTHORITATIVE master tracker (start here)
├── GOVERNANCE_DOCUMENT_INVENTORY.md      ← Pre-reorganization inventory and move plan
│
├── foundational/                         ← Core design documents and authority hierarchy
│   ├── SCHEMA_INVENTORY_v0.1.md
│   ├── RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md
│   └── RUNTIME_AUTHORITY_DECLARATION.md
│
├── governance-audit/                     ← Domain-specific read-only audit records
│   ├── replit-project-structure.md
│   ├── replit-schema-audit.md
│   ├── replit-migration-audit.md
│   ├── replit-onboarding-audit.md
│   ├── replit-scheduler-audit.md
│   ├── replit-runtime-risk-audit.md
│   └── RUNTIME_TOPOLOGY_AUDIT_v1.md
│
├── governance-baseline/                  ← Point-in-time validated state freezes
│   ├── OPERATIONAL_BASELINE_MANIFEST.md
│   ├── COEXISTENCE_STATE_FREEZE.md
│   ├── MIGRATION_EXECUTION_LEDGER.md
│   ├── ONBOARDING_BASELINE_SNAPSHOT.md
│   └── SCHEDULER_BASELINE_SNAPSHOT.md
│
├── governance-reconciliation/            ← Cross-layer alignment and compatibility records
│   ├── SUPABASE_REPLIT_ALIGNMENT_MATRIX.md
│   ├── STALE_ASSUMPTION_REGISTRY.md
│   ├── ACTIVATION_BOUNDARY_REGISTRY.md
│   ├── MIGRATION_AUTHORITY_DECLARATION.md
│   └── RUNTIME_COMPATIBILITY_CONTRACT.md
│
├── governance-migration/                 ← Migration execution protocols and runbooks
│   ├── MIGRATION_EXECUTION_PROTOCOL.md
│   ├── MIGRATION_PRECHECK_RUNBOOK.md
│   ├── MIGRATION_POSTCHECK_RUNBOOK.md
│   ├── MIGRATION_ROLLBACK_STRATEGY.md
│   ├── ACTIVATION_SEQUENCE_GUARDRAILS.md
│   ├── SCHEMA_MIGRATIONS_TABLE_SPEC.md
│   └── PRE_DATASET_HARDENING_MIGRATION_REPORT_v1.md
│
├── runtime-alignment/                    ← TypeScript/DB alignment audits and validation
│   ├── LOCAL_RUNTIME_COMPATIBILITY_REPORT.md
│   ├── RUNTIME_SCHEMA_ALIGNMENT_AUDIT.md
│   └── G25_RUNTIME_VALIDATION.md
│
└── archive/                              ← Superseded governance documents (read-only)
```

---

## Document Categories

### Foundational (`foundational/`)
Documents that define the baseline state, canonical design intent, and authority hierarchy that all other governance references. These predate the formal governance audit corpus and establish the Phase 2.1 schema architecture.

### Governance Audits (`governance-audit/`)
Domain-specific read-only audit records. Each audit covers a single system (schema, migrations, onboarding, scheduler, runtime risk, project structure, topology). Audits document what the system *does*, not what it *should* do. They are the source-of-truth input for all baseline freeze documents.

### Baseline Freezes (`governance-baseline/`)
Point-in-time validated snapshots of system state at the Phase B2.0 boundary. These documents are frozen — their content describes a specific historical moment. They become historical after the phase they describe is superseded, but are never deleted.

### Reconciliation (`governance-reconciliation/`)
Cross-layer alignment analysis, stale assumption registries, compatibility contracts, and migration authority declarations. These documents reconcile what TypeScript says vs what the live DB contains vs what governance documents describe. Required reading before any activation event.

### Migration Governance (`governance-migration/`)
The operational procedural corpus for executing schema migrations. Includes the step-by-step execution protocol, pre-migration and post-migration runbooks (with SQL verification queries), rollback strategy, activation sequencing guardrails, and the schema_migrations table specification.

### Runtime Alignment (`runtime-alignment/`)
TypeScript-to-database alignment audits and validation passes. Documents that verify the runtime code is safe against the current live schema, and record the formal sign-off verdict for each validation cycle.

### Archive (`archive/`)
Governance documents that have been explicitly superseded and retired. Archived documents are read-only and must not be referenced as current authority. See the Archival Policy section below.

---

## Authoritative Role of `PLANTMON_EXECUTION_MASTER_TRACKER.md`

`PLANTMON_EXECUTION_MASTER_TRACKER.md` is the **highest-level governance document** in this directory. It is the mandatory entry point for understanding the project's current state and trajectory.

It synthesizes all other governance documents into a single authoritative view:

| Section | What it provides |
|---|---|
| Phase history (G2.x) | Narrative of every completed governance phase with status, authoritative docs, and decisions made |
| Current runtime state | Schema layer status, feature status table, and the swapped-credentials known issue |
| Runtime activation registry | All 9 canonical intelligence features with their current OFF state and activation conditions |
| Pending migration registry | Both pending SQL files with execution order |
| Technical debt register | 6 tracked items with severity, file, and target phase |
| MVP roadmap | M1.0–M1.6 with sub-tasks and completion status |
| Authoritative document index | Cross-reference of every governance doc and source-of-truth code file |
| Key invariants | 7 rules that must not be violated |

**No governance action, activation event, migration execution, or phase transition may begin without first consulting the master tracker.**

---

## Update Process After Phase Completion

When a governance phase completes, update the master tracker as follows:

1. **Change the phase status** in Section 2 (Phase History) from `PENDING` / `IN PROGRESS` to `COMPLETE`.
2. **Update the runtime state table** in Section 3 if any schema layer, feature status, or migration registry entry changed.
3. **Update the activation registry** in Section 4 if any feature moved from OFF to ON.
4. **Update the migration registry** in Section 5 — mark executed migrations as `EXECUTED` with the execution date.
5. **Add any new technical debt** to Section 6.
6. **Advance the MVP roadmap** in Section 7 — mark completed milestones and update sub-task status.
7. **Add the new governance documents** from the completed phase to the document index in Section 8.
8. **Update the `Last updated` date** at the top of the file.

For new governance documents produced during a phase, place them in the appropriate subdirectory based on their category (see Document Categories above) and add them to the master tracker's document index.

---

## Archival Policy

A governance document is archived — moved to `archive/` — only when **all three** of the following conditions are true:

1. A newer document explicitly supersedes it and covers the same domain with more current information.
2. The phase described by the document is fully complete and no activation or rollback could reference it as current authority.
3. The master tracker's document index has been updated to point to the superseding document.

**Documents are never deleted.** Archived documents remain readable as historical record.

**Baseline freeze documents are never archived.** They describe a specific historical state; that record is permanently valuable even when the state has changed.

**Runbooks and protocols are never archived** while the migrations they govern are still pending. `MIGRATION_PRECHECK_RUNBOOK.md`, `MIGRATION_POSTCHECK_RUNBOOK.md`, and `MIGRATION_EXECUTION_PROTOCOL.md` remain active until all authorized migrations have been executed and post-checked.

---

## Future Governance Document Placement Rules

When creating a new governance document, place it in the subdirectory that matches its category:

| Document type | Subdirectory |
|---|---|
| Original schema/design baseline, authority hierarchy | `foundational/` |
| Read-only domain audit (what a system currently does) | `governance-audit/` |
| Point-in-time state freeze | `governance-baseline/` |
| Cross-layer alignment matrix, stale assumption registry, compatibility contract | `governance-reconciliation/` |
| Migration execution protocol, runbook, rollback plan, activation guardrails | `governance-migration/` |
| TypeScript/DB alignment audit, runtime validation pass | `runtime-alignment/` |
| Explicitly superseded document | `archive/` |

**Naming convention:** Use `SCREAMING_SNAKE_CASE.md` for formal governance documents. The `replit-kebab-case.md` naming in `governance-audit/` is a legacy convention from the original audit generation; new audit documents should follow `SCREAMING_SNAKE_CASE.md`.

**After placing a new document:** Add it to the document index in `PLANTMON_EXECUTION_MASTER_TRACKER.md` and update the `Last updated` date.

---

## SQL Migration Files

SQL migration files are **not** stored in this governance directory. They remain co-located with the mobile app artifact because they are operational artifacts that must be accessible alongside the app source:

| File | Location | Status |
|---|---|---|
| `supabase-setup.sql` | `artifacts/mobile/` | Dev/reset only — never run on live DB |
| `supabase-migration-v2.sql` | `artifacts/mobile/` | Phase 2.1 migration — PENDING EXECUTION |
| `PRE_DATASET_HARDENING_MIGRATION_v1.sql` | `artifacts/mobile/` | Phase B2.0 hardening — PENDING EXECUTION |

Their corresponding governance reports and runbooks live in `governance-migration/`.
