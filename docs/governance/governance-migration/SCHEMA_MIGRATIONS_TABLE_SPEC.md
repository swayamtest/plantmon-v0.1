# PLANTMON — Schema Migrations Table Specification

**Classification:** Governance Migration Authority  
**Status:** SPECIFICATION — READ-ONLY — NOT YET IMPLEMENTED  
**Frozen:** May 2026  
**Phase at freeze:** B2.0 (pre-dataset seeding, pre-Phase-2.1-migration, pre-Phase-2.2-activation)  
**Implementation status:** NOT CREATED — this document is a governance specification for a future table; the table does not exist in the live DB as of this document's authoring  
**Source authority:** Full governance audit corpus + `MIGRATION_EXECUTION_PROTOCOL.md` + `MIGRATION_PRECHECK_RUNBOOK.md` + `MIGRATION_POSTCHECK_RUNBOOK.md` + `MIGRATION_ROLLBACK_STRATEGY.md`  

This document specifies the governance model, field definitions, constraints, integration model, and non-goals for a future `schema_migrations` tracking table in the PLANTMON Supabase database. No SQL was executed, no table was created, and no schema was modified in its generation. The table described here does not yet exist.

---

## PURPOSE

### Why Migration Observability Is Required

PLANTMON's migration governance corpus — comprising `MIGRATION_EXECUTION_PROTOCOL.md`, `MIGRATION_PRECHECK_RUNBOOK.md`, `MIGRATION_POSTCHECK_RUNBOOK.md`, `MIGRATION_ROLLBACK_STRATEGY.md`, and the governance reconciliation documents — establishes a rigorous 8-step lifecycle for every schema migration. This lifecycle produces significant pre- and post-migration evidence: precheck completion records, postcheck completion records, runtime validation results, row count baselines, constraint name captures, and rollback decisions.

All of that evidence currently lives in manually-maintained governance documents stored in the repository. The live database itself has no record of which migrations have been applied to it. There is no mechanism to query the DB directly and determine: "Was `supabase-migration-v2.sql` applied to this database? When? By whom? Did it succeed?"

This gap creates three operational risks:

**Risk 1 — State ambiguity at migration time.** When a new migration is being prepared, the pre-migration checklist must determine the current schema state by running targeted queries (PC-TBL-01, PC-LED-01, PC-LED-03 in the precheck runbook). The precheck runbook explicitly notes that `schema_migrations` does not exist and provides manual alternatives. This is functional but fragile — the manual queries confirm what exists, but provide no authoritative record of what was intentionally applied vs. what arrived via unauthorized modification.

**Risk 2 — Governance document drift.** The governance documents describe the intended state. The live DB contains the actual state. Without a mechanism connecting them, these two representations can diverge silently — a governance document may describe a migration as "PENDING" while the DB has already applied it, or describe a migration as "APPLIED" while a partial execution left it in an inconsistent state.

**Risk 3 — Accountability gaps.** The current governance lifecycle requires recording who applied each migration and when. This information is stored in `MIGRATION_EXECUTION_LEDGER.md`. That document is the authoritative record, but it is external to the DB — it cannot be joined, queried, or cross-referenced with live schema state in a single operation.

A `schema_migrations` table resolves all three risks by making the DB a participant in its own governance record.

---

### Why Governance Ledgering Matters

The PLANTMON governance model distinguishes between three categories of schema facts:

1. **What exists** — verifiable by querying `information_schema` and `pg_catalog`
2. **What was intended** — captured in the governance documents and migration SQL files
3. **What was applied, when, and by whom** — the execution record

Category 3 is currently invisible inside the DB. The `schema_migrations` table exists to make category 3 visible and queryable from within the DB itself.

Governance ledgering matters specifically because PLANTMON has a coexistence architecture that makes schema state non-trivially interpretable. The presence of `plants.canonical_species_id` in the DB tells you the column was created — but it does not tell you whether the Phase 2.1 shim is active, whether Phase 2.2A activation has occurred, or whether the column is intentionally inert (by design) or accidentally inert (due to a partial activation). The `schema_migrations` table, by recording `governance_phase` and `runtime_compatibility_state`, makes the intended coexistence configuration of each applied migration queryable alongside its schema objects.

---

### Why Manual Tracking Alone Is Insufficient

The current manual tracking model (`MIGRATION_EXECUTION_LEDGER.md` in the repository) has five limitations that the `schema_migrations` table addresses:

**Limitation 1 — External to the DB.** The ledger document cannot be queried in a JOIN with `information_schema`. Confirming that the DB's actual schema matches the ledger's claimed applied state requires running two separate checks (query the DB, read the document) and manually comparing them.

**Limitation 2 — Not immutable.** A text document in a repository can be edited retroactively. A database row with a `NOT NULL execution_timestamp` and a `DEFAULT now()` execution time is significantly harder to fabricate with a plausible timestamp. The DB ledger is a stronger audit record than the document ledger.

**Limitation 3 — No DB-level detection.** If someone applies a migration directly via the Supabase Dashboard without following the governance lifecycle, the ledger document is not updated — the unauthorized application is invisible to governance. A `schema_migrations` row can only be created by an explicit INSERT — its absence for a migration that appears to have been applied (based on `information_schema` evidence) is itself a governance signal.

**Limitation 4 — Governance document currency.** The precheck runbook (PC-LED-01 through PC-LED-03) documents the expected absence of `schema_migrations` and provides workaround queries. These workarounds add complexity to every future precheck execution. Once `schema_migrations` exists, PC-LED-01 through PC-LED-03 collapse into a simple `SELECT * FROM schema_migrations` — reducing the cognitive overhead of precheck execution.

**Limitation 5 — Rollback record.** `MIGRATION_ROLLBACK_STRATEGY.md` specifies that rollbacks must be recorded in the governance ledger. A `schema_migrations` row with `rollback_status` and `rolled_back_at` fields makes rollback history queryable from within the DB, enabling queries like "show me all migrations in the applied → rolled back state" without reading the document corpus.

---

## PROPOSED TABLE RESPONSIBILITIES

The `schema_migrations` table is an observability and accountability ledger. It records the governance history of each migration execution. It is not a migration runner, not an ORM state tracker, and not an activation trigger.

### Field: `id`

**Type:** `uuid DEFAULT gen_random_uuid()`  
**Nullable:** NOT NULL  
**Constraint:** PRIMARY KEY  

**Responsibility:** Uniquely identifies each ledger entry. UUID rather than serial/sequence because `schema_migrations` entries may be inserted in non-sequential order if migrations are applied to multiple environments (development vs. staging, if such environments are introduced). UUID prevents ordering assumptions.

**Governance note:** The `id` is not the migration identifier — two executions of the same migration file (e.g., a reapplication after rollback) produce two distinct `id` values with the same `filename`. The `filename` field, not the `id`, is the migration identifier.

---

### Field: `filename`

**Type:** `text`  
**Nullable:** NOT NULL  
**Constraint:** No UNIQUE constraint — the same migration may appear multiple times (original application + reapplication after rollback)  

**Responsibility:** The canonical name of the migration SQL file as it exists in the repository. The filename is the primary human-readable identifier for a migration and the key used to correlate a DB ledger entry with its governance documents (precheck record, postcheck record, protocol classification).

**Governance note:** The filename must match the exact filename of the SQL file in the repository — including path prefix if migrations are stored in subdirectories. Case-sensitive. No transformation, abbreviation, or aliasing permitted. The governance corpus uses exact filenames throughout (`supabase-migration-v2.sql`, `PRE_DATASET_HARDENING_MIGRATION_v1.sql`); the `filename` field must use the same.

**Example values:**
- `supabase-migration-v2.sql`
- `PRE_DATASET_HARDENING_MIGRATION_v1.sql`
- `collapse-mappings-v1.sql` (hypothetical future migration)

---

### Field: `execution_timestamp`

**Type:** `timestamptz DEFAULT now()`  
**Nullable:** NOT NULL  

**Responsibility:** The wall-clock time at which the governance lifecycle INSERT was executed. This is the time the row was inserted — it corresponds to Step 8 (Governance Ledger Update) of the execution lifecycle, not Step 5 (Staged Execution). The difference matters: the `execution_timestamp` does not record when the migration SQL ran (that may have been minutes earlier), but when the governance record was formally committed.

**Governance note:** The separation between "when migration SQL ran" and "when ledger INSERT ran" is intentional. If the ledger INSERT is delayed (e.g., postcheck takes 30 minutes), the `execution_timestamp` reflects the post-verification time, not the execution start. A separate `migration_started_at` field (see the optional fields section) would capture the execution start time. For most governance purposes, `execution_timestamp` is sufficient — it answers "when was this migration formally recorded as complete."

**Audit use:** The `execution_timestamp` must not be manually overridden to a past time. The `DEFAULT now()` enforces approximate accuracy — the DB records the time the INSERT was executed. If a migration's ledger entry needs to reference its actual execution time, the `notes` field is the appropriate place to document the discrepancy.

---

### Field: `execution_status`

**Type:** `text`  
**Nullable:** NOT NULL  
**Constraint:** `CHECK (execution_status IN ('applied', 'failed', 'partial', 'rolled_back'))`  

**Responsibility:** The terminal state of the migration execution at the time the ledger entry is created (or updated).

**Status definitions:**

| Status | Meaning | When used |
|---|---|---|
| `applied` | Migration executed successfully; all postcheck queries passed; all runtime validation tests passed; schema is in the expected post-migration state | After a fully successful execution and completed postcheck |
| `failed` | Migration execution was attempted; a statement-level error occurred; migration was not fully applied; DB may be in partial state | After a failed execution where no rollback was attempted |
| `partial` | Some but not all migration objects were created; the partial state was investigated; a targeted forward fix or rollback is in progress | After partial execution investigation as described in `MIGRATION_ROLLBACK_STRATEGY.md` |
| `rolled_back` | Migration was applied (at least partially) and then rolled back; DB has been returned to pre-migration state | After a rollback completes and rollback postcheck passes |

**Governance note:** An entry with `execution_status = 'failed'` or `'partial'` is a signal that a future execution is pending. An entry with `execution_status = 'applied'` closes the migration for that DB environment. `'rolled_back'` entries are not deleted — the history of an attempted and reverted migration is itself a governance record.

---

### Field: `applied_by`

**Type:** `text`  
**Nullable:** NOT NULL  

**Responsibility:** Identifies the human executor of the migration governance lifecycle. This is not an automated field — it is manually populated at INSERT time. It records accountability: who was responsible for the governance lifecycle for this migration execution.

**Format:** No enforced format. Recommended: first name + last name initial, or GitHub username. Consistency across entries is more important than a specific format.

**Governance note:** `applied_by` is not a foreign key to any users table. It is a plain text accountability field. It cannot be linked to a `plants` user or a Supabase auth user — PLANTMON's user model is for plant owners, not system administrators. `applied_by` is always a human name, never a system, process, or automation identifier. If an automation tool ever writes to `schema_migrations`, that represents a governance violation — the `applied_by` field value in that row would be the evidence.

---

### Field: `rollback_status`

**Type:** `text`  
**Nullable:** YES (NULL = rollback not needed or not applicable)  
**Constraint:** `CHECK (rollback_status IS NULL OR rollback_status IN ('not_needed', 'available', 'executed', 'unavailable', 'not_possible'))`  

**Responsibility:** Records the state of the rollback for this migration execution. This field exists independently of `execution_status` because a migration can be `applied` (successful) with a rollback that is `available` (available if needed) vs. `not_needed` (confirmed inert, no rollback path required). Similarly, an `applied` migration with a `rolled_back` `execution_status` would have a `rollback_status` of `executed`.

**Status definitions:**

| Status | Meaning |
|---|---|
| NULL | Not yet assessed; entry is draft or execution is in progress |
| `not_needed` | Migration is fully additive and inert; rollback is structurally possible but governance-unnecessary |
| `available` | Rollback SQL was authored, reviewed, and stored; it can be executed if needed |
| `executed` | Rollback was executed; see corresponding rolled_back ledger entry |
| `unavailable` | Rollback was not authored before execution (governance violation); rollback path is unknown |
| `not_possible` | Non-rollbackable event has occurred (canonical propagation, Phase 2.2A activation); rollback window closed |

**Governance note:** `unavailable` should never appear in a compliant governance record — rollback SQL must be authored before migration execution (Principle 3 in `MIGRATION_EXECUTION_PROTOCOL.md`). Its presence in the table is itself a governance audit signal.

---

### Field: `governance_phase`

**Type:** `text`  
**Nullable:** NOT NULL  
**Constraint:** `CHECK (governance_phase ~ '^B[0-9]+\.[0-9]+[A-Z]?$')`  

**Responsibility:** Records the PLANTMON governance phase during which this migration was applied. This field is the critical link between the DB ledger and the governance document corpus — it answers "which phase's governance documents authorized and governed this migration?"

**Format:** Phase identifier matching PLANTMON phase naming convention: `B` followed by major version, `.`, minor version, optional letter suffix. Examples: `B2.1`, `B2.2A`, `B2.3B`.

**Governance note:** The `governance_phase` must match the phase declared in the migration's `MIGRATION_AUTHORITY_DECLARATION.md` authorization section. If a migration is applied in a different phase than authorized, the discrepancy must be documented in the `notes` field and escalated to Tier 1 governance per the approval conditions in `MIGRATION_EXECUTION_PROTOCOL.md`.

**Query use:** `WHERE governance_phase = 'B2.1'` returns all migrations applied during Phase B2.1 — useful for auditing whether all Phase B2.1 migrations have been applied before Phase B2.2 activity begins.

---

### Field: `runtime_compatibility_state`

**Type:** `text`  
**Nullable:** NOT NULL  
**Constraint:** `CHECK (runtime_compatibility_state IN ('coexistence_active', 'activation_applied', 'standalone'))`  

**Responsibility:** Describes the relationship between this migration and the PLANTMON coexistence architecture at the time of application. This field distinguishes between migrations applied while the Phase 2.1 shim is active (coexistence_active), migrations that constitute or accompany a runtime activation event (activation_applied), and migrations that are independent of the coexistence architecture (standalone).

**State definitions:**

| State | Meaning | Examples |
|---|---|---|
| `coexistence_active` | Migration was applied while the Phase 2.1 shim was active; the migration's objects are coexistence-inert; no activation occurred | `supabase-migration-v2.sql`, `PRE_DATASET_HARDENING_MIGRATION_v1.sql` |
| `activation_applied` | This migration is or accompanies a runtime activation event; the Phase 2.1 shim was removed as part of this migration's deployment lifecycle | Phase 2.2A schema migrations (future) |
| `standalone` | Migration has no relationship to the coexistence architecture; it modifies infrastructure that is outside the canonical/Phase 2.x scope | Hypothetical future migrations to `journal_entries`, `health_logs` |

**Governance note:** The `runtime_compatibility_state` must not be set to `activation_applied` without explicit Tier 1 authorization per the activation boundary requirements in `ACTIVATION_BOUNDARY_REGISTRY.md`. If this field reads `activation_applied` for any migration that was not authorized as an activation event, that is a governance violation — the field is the evidence.

**Why this field matters for observability:** Without it, a future governance review cannot determine from the DB ledger alone whether Phase 2.2A activation has occurred. With it, `SELECT runtime_compatibility_state FROM schema_migrations` answers the question in a single query.

---

### Field: `phase` (alias — preferred column name in governance documents)

**Note:** The governance corpus uses `phase` as the short column name in examples (`INSERT INTO schema_migrations (filename, phase, ...)` appears in `MIGRATION_EXECUTION_PROTOCOL.md`). The full field `governance_phase` is the canonical column name for the table specification. The INSERT template in `MIGRATION_EXECUTION_PROTOCOL.md` should use `governance_phase` — this document supersedes the abbreviated column reference in the protocol.

---

### Field: `notes`

**Type:** `text`  
**Nullable:** YES  

**Responsibility:** Free-text field for documenting deviations, anomalies, timing notes, and cross-references to governance documents. This field is the escape valve for information that does not fit into the constrained columns.

**Recommended uses:**
- Document discrepancies between `execution_timestamp` and actual migration execution time
- Cross-reference the corresponding precheck and postcheck completion records
- Document any abort conditions that were triggered and resolved during precheck
- Record the constraint name from PC-CON-02 (the `plant_care_profiles` CHECK constraint name) for the §B7 migration
- Note if a rollback was considered but coexistence continuation was chosen (and why)

---

### Optional Future Fields

These fields are not part of the minimum viable table specification but are documented here for forward-compatibility planning:

| Field | Type | Responsibility |
|---|---|---|
| `migration_started_at` | `timestamptz` | Wall-clock time when Step 5 (Staged Execution) began — distinct from `execution_timestamp` (which is the Step 8 ledger INSERT time) |
| `precheck_completed_at` | `timestamptz` | Wall-clock time when the precheck completion record was marked PASS |
| `postcheck_completed_at` | `timestamptz` | Wall-clock time when the postcheck completion record was marked PASS |
| `rolled_back_at` | `timestamptz` | Wall-clock time when rollback was completed (only populated when `rollback_status = 'executed'`) |
| `migration_class` | `text` | The classification from `MIGRATION_EXECUTION_PROTOCOL.md` (R1–R6) for the applied migration |
| `precheck_record_path` | `text` | Repository path to the stored precheck completion record for this execution |
| `postcheck_record_path` | `text` | Repository path to the stored postcheck completion record |

---

## GOVERNANCE CONSTRAINTS

### Constraint GC-01 — The Migrations Table Must Not Trigger Runtime Activation

**Statement:** The creation of the `schema_migrations` table, and any INSERT into it, must have zero effect on PLANTMON's runtime activation state. Specifically: the table's existence must not activate any system listed in `ACTIVATION_BOUNDARY_REGISTRY.md`, the INSERT of any row must not modify any other table, and the table must have no triggers.

**Rationale:** The `schema_migrations` table is an observability tool. It records facts about migrations; it does not act on them. A trigger on `schema_migrations` that fires on INSERT and performs any action — enabling a feature flag, modifying a column, calling a function — would transform the table from a passive ledger into an active migration runner. That is explicitly not its role.

**Enforcement:**

```sql
-- These two statements must be true at all times:
SELECT COUNT(*) FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table = 'schema_migrations';
-- Expected: 0

SELECT COUNT(*) FROM information_schema.referential_constraints rc
  JOIN information_schema.key_column_usage kcu
    ON rc.constraint_name = kcu.constraint_name
  WHERE kcu.table_name = 'schema_migrations';
-- Expected: 0 (schema_migrations has no FK relationships)
```

**The activation boundary:** The `schema_migrations` table is not listed in `ACTIVATION_BOUNDARY_REGISTRY.md` because it is not a feature or system that activates anything. It is infrastructure for the governance process itself. This constraint ensures it remains that way.

---

### Constraint GC-02 — The Migrations Table Must Remain Additive

**Statement:** Once created, the `schema_migrations` table must never be dropped, truncated, or have rows deleted from it. All modifications must be additive: new rows may be INSERTed, existing rows may be UPDATEd (to record rollback status, notes), but no row may be DELETEd and the table itself may not be removed or altered in a way that destroys historical records.

**Rationale:** A governance ledger that permits deletion is not a ledger — it is a mutable record that can be revised to misrepresent history. The value of `schema_migrations` as a governance artifact depends entirely on its append-only characteristic. Even rows for failed or rolled-back migrations must be preserved — their presence is the evidence that those events occurred.

**Permitted operations:**
- `INSERT INTO schema_migrations` — add a new execution record
- `UPDATE schema_migrations SET rollback_status = ..., notes = ...` — update the terminal state of an existing record (rollback completion, notes addendum)

**Prohibited operations:**
- `DELETE FROM schema_migrations` — any row deletion, including during rollback of a migration that added the table itself
- `TRUNCATE schema_migrations` — mass deletion
- `DROP TABLE schema_migrations` — table removal
- `UPDATE schema_migrations SET filename = ...` — alteration of immutable fields (`filename`, `execution_timestamp`, `applied_by`, `governance_phase`)

**Immutable fields (must never be UPDATE'd once set):** `filename`, `execution_timestamp`, `applied_by`, `governance_phase`. These fields represent facts about when and by whom a migration was applied — they are not correctable after the fact.

**Mutable fields (may be UPDATE'd):** `execution_status` (e.g., `partial` → `applied` after a forward fix completes), `rollback_status`, `runtime_compatibility_state` (only if set incorrectly at INSERT time and corrected within the same governance session), `notes`.

---

### Constraint GC-03 — The Migrations Table Must Not Imply ORM Authority

**Statement:** The existence of a `schema_migrations` table must not be interpreted as authorization for ORM-managed migrations. PLANTMON uses no ORM for the Supabase database (ORM authority is limited to `lib/db` via Drizzle for the `api-server` only). The `schema_migrations` table is a PLANTMON-governance artifact, not a framework-generated table.

**Rationale:** The name `schema_migrations` is also used by several Rails-heritage ORMs and migration frameworks (Flyway, Liquibase, etc.) for their own tracking tables. If a developer introduces an ORM tool into the PLANTMON stack that auto-discovers a `schema_migrations` table, the ORM may attempt to take ownership of it — either by modifying its schema, inserting its own records, or using it to determine which framework-managed migrations to apply.

**Disambiguation markers:** The `schema_migrations` table specification includes fields that unambiguously identify it as a PLANTMON governance artifact rather than an ORM table:
- `governance_phase` — no standard ORM table includes a governance phase field
- `runtime_compatibility_state` — PLANTMON-specific coexistence architecture field
- `rollback_status` — PLANTMON governance tracking field (different from ORM rollback semantics)

**ORM non-interference rule:** No ORM, no migration framework, and no automated tooling may be granted write access to `schema_migrations`. The table is INSERT-only for the human governance executor. If any non-human process ever writes to `schema_migrations`, the `applied_by` field will show a non-human identifier — that is the governance audit signal.

**The Drizzle ORM boundary:** Drizzle ORM is used exclusively in `lib/db` for the `api-server`. It operates against a different schema scope. The Supabase `public` schema is never under Drizzle authority. The `schema_migrations` table, if created in the `public` schema, is outside Drizzle's scope by design. This must remain true — `lib/db` must never be configured to manage the `public` schema.

---

## FUTURE INTEGRATION MODEL

### Supabase Relationship

The `schema_migrations` table is a Supabase native table — it lives in the `public` schema alongside `plants`, `care_tasks`, `care_logs`, and `plant_care_profiles`. It is created via a migration SQL statement executed through the Supabase Dashboard SQL Editor, following the same governance lifecycle as any other migration.

**The creation migration:** The creation of `schema_migrations` is itself a governed migration event. It requires:
- A migration SQL file (e.g., `supabase-schema-migrations-v1.sql`) in the repository
- A precheck (confirming the table does not yet exist — PC-TBL-03 in the precheck runbook)
- Execution following the governance lifecycle
- A postcheck (confirming the table was created with correct structure)
- A governance ledger entry — the first entry in the new table, recording its own creation

**The bootstrapping record:** The first INSERT into `schema_migrations` is the row recording the creation of `schema_migrations` itself. This self-referential entry is the table's provenance record:

```
filename:                  supabase-schema-migrations-v1.sql
execution_timestamp:       [time of creation]
execution_status:          applied
applied_by:                [human executor]
rollback_status:           not_needed
governance_phase:          B2.1 (or whatever phase it is applied in)
runtime_compatibility_state: standalone
notes:                     Creation of governance ledger table.
                           This row records the table's own creation.
```

**RLS on schema_migrations:** The table's RLS configuration is distinct from user-data tables. `schema_migrations` is not a user-facing table — plant owners cannot create, read, or modify migration records. The appropriate RLS policy is:
- `SELECT`: permitted for the Supabase `anon` and `authenticated` roles (allows governance queries from the Dashboard without authentication)
- `INSERT`: permitted only for `service_role` or explicitly authorized executor role
- `UPDATE`: same restriction as INSERT
- `DELETE`: prohibited for all roles

The exact policy definitions are part of the creation migration SQL, not this specification document.

---

### Governance Artifact Relationship

The `schema_migrations` table exists in a three-way relationship with the governance document corpus:

**Upstream relationships (documents that inform the table):**

| Artifact | What it contributes to schema_migrations |
|---|---|
| `MIGRATION_EXECUTION_PROTOCOL.md` | The 8-step lifecycle that defines when and how rows are INSERTed (Step 8) |
| `MIGRATION_PRECHECK_RUNBOOK.md` | The precheck queries (PC-LED-01 through PC-LED-03) that check the table's current state |
| `MIGRATION_POSTCHECK_RUNBOOK.md` | The postcheck completion record that informs the `notes` field content |
| `MIGRATION_AUTHORITY_DECLARATION.md` | The phase authorization that populates `governance_phase` |
| `ACTIVATION_BOUNDARY_REGISTRY.md` | The activation state that informs `runtime_compatibility_state` |

**Downstream relationships (documents that reference the table):**

| Artifact | How it references schema_migrations |
|---|---|
| `MIGRATION_EXECUTION_PROTOCOL.md` Step 8 | "INSERT into schema_migrations" is one of the four required Step 8 actions |
| `MIGRATION_POSTCHECK_RUNBOOK.md` | "schema_migrations INSERT executed: YES / NO" in the postcheck completion record |
| `OPERATIONAL_BASELINE_MANIFEST.md` | References schema_migrations as the DB-native state tracker |
| `STALE_ASSUMPTION_REGISTRY.md` | The assumption "schema_migrations table absent" is an active stale assumption until the table is created |

**The complementary relationship with `MIGRATION_EXECUTION_LEDGER.md`:**

`schema_migrations` and `MIGRATION_EXECUTION_LEDGER.md` are complementary, not redundant. They record different scopes of information:

| | `schema_migrations` (DB table) | `MIGRATION_EXECUTION_LEDGER.md` (document) |
|---|---|---|
| **Location** | Live Supabase database | Repository governance-migration/ directory |
| **Queryability** | SQL-queryable; can JOIN with information_schema | Document-readable; cannot be queried |
| **Immutability** | Enforced by DB constraints and RLS | Enforced by governance convention |
| **Content scope** | Execution record (who, when, status, phase) | Full execution detail (precheck results, postcheck results, all row counts, runtime validation) |
| **Rollback record** | `rollback_status` field | Full rollback narrative |
| **Cross-reference** | `notes` field references ledger path | References schema_migrations insert confirmation |

Neither replaces the other. The `schema_migrations` table is the queryable execution record; the ledger document is the full execution narrative.

---

### Execution Protocol Relationship

The `schema_migrations` table is integrated into the governance lifecycle at Step 8:

**Step 8 — Governance Ledger Update (current requirement):**
1. Create/update `MIGRATION_EXECUTION_LEDGER.md` entry
2. INSERT into `schema_migrations` (once table exists)
3. Update `OPERATIONAL_BASELINE_MANIFEST.md`
4. Close resolved entries in `STALE_ASSUMPTION_REGISTRY.md`

**The Step 8 INSERT template** (documented here, not yet in a live migration SQL file):

```sql
INSERT INTO schema_migrations (
  filename,
  execution_status,
  applied_by,
  rollback_status,
  governance_phase,
  runtime_compatibility_state,
  notes
) VALUES (
  'supabase-migration-v2.sql',
  'applied',
  '[executor name]',
  'available',
  'B2.1',
  'coexistence_active',
  'Full 8-step lifecycle completed. Precheck passed (no abort conditions).
   Postcheck passed. All 10 RTV tests pass. plant_care_profiles row count
   preserved post-§B7. Canonical isolation confirmed. Rollback SQL stored at
   governance-migration/rollback-supabase-migration-v2.sql.'
);
```

**Pre-Step 8 conditional:** If `schema_migrations` does not yet exist (confirmed by PC-LED-01 returning false), Step 8 action #2 is skipped. The execution protocol notes "schema_migrations INSERT executed: NO (table not yet created)" in the postcheck completion record. Once the table is created (by its own governed migration), all subsequent migration executions include the INSERT.

---

## EXPLICIT NON-GOALS

### Non-Goal 1 — No Automatic Migration Execution

The `schema_migrations` table is explicitly not a migration runner trigger. Reading its contents must never cause a migration to be applied. Comparing its rows against a set of migration files must never cause a migration to be applied. No application code, no Supabase function, no cron job, and no edge function may read `schema_migrations` and decide to execute a migration SQL file.

**Why this boundary matters:** The coexistence architecture depends on migrations being applied at deliberate moments with full governance lifecycle compliance. Automatic execution removes the precheck validation, the constraint name verification, the rollback SQL authoring, and the runtime baseline capture. A missed precheck for `supabase-migration-v2.sql §B7` could destroy `plant_care_profiles` data without a pg_dump backup being available — the governance lifecycle exists precisely to prevent this.

**The only execution model:** A human executor, following the 8-step protocol in `MIGRATION_EXECUTION_PROTOCOL.md`, running SQL statements manually in the Supabase Dashboard SQL Editor, is the only authorized migration execution path.

---

### Non-Goal 2 — No ORM Synchronization

The `schema_migrations` table is not a synchronization point between an ORM's desired schema state and the live DB schema. Drizzle ORM (used in `lib/db` for the `api-server`) must never be configured to read or write the `schema_migrations` table. No ORM's `migrate` command must ever run against the `public` schema.

**Why this boundary matters:** ORM-managed migration synchronization assumes the ORM has complete authority over the schema — it creates, alters, and drops objects based on its model definitions. PLANTMON's `public` schema is under governance protocol authority, not ORM authority. If Drizzle were configured to manage the `public` schema, it would attempt to bring the DB into alignment with its model — which may include dropping columns that the governance protocol intentionally added, or creating columns that the governance protocol intentionally deferred.

**The ORM authority split (inviolable):**

| Schema scope | Authority | Tool |
|---|---|---|
| `public` schema (user data, canonical, care) | Governance protocol | Manual SQL via Supabase Dashboard |
| `lib/db` schema (api-server internal tables, if any) | Drizzle ORM | `pnpm --filter @workspace/db run push` |

These two authority scopes must never overlap. If a future development requirement creates pressure to give Drizzle authority over the `public` schema, that is a Tier 1 governance decision requiring explicit authorization — not a technical configuration change.

---

### Non-Goal 3 — No Auto-Activation

The `schema_migrations` table must never be read to determine whether a Phase 2.x activation event should occur. Specifically:
- No code may read `WHERE execution_status = 'applied' AND governance_phase = 'B2.1'` and conclude that Phase 2.2A activation is authorized
- No code may read `WHERE runtime_compatibility_state = 'activation_applied'` and change routing behavior
- No Supabase function may poll `schema_migrations` and conditionally enable or disable application features

**Why this boundary matters:** Activation is a code deployment event, not a DB state event. Phase 2.2A activation requires removing the Phase 2.1 shim from `hooks/usePlants.ts` and uncommenting the canonical routing slots in `lib/careProfiles.ts`. These are code changes, not DB reads. Making activation contingent on a DB row would create a coupling between the DB state and the runtime behavior that the coexistence architecture was specifically designed to prevent.

**The activation authority model:** Activation is authorized by Tier 1 governance (per `ACTIVATION_BOUNDARY_REGISTRY.md`) and executed as a code deployment. The `schema_migrations` table may be referenced in the activation postcheck to confirm that required prerequisite migrations have been applied — but this is a human-performed verification step, not an automated gate.

---

### Non-Goal 4 — No Deployment Automation Coupling

The `schema_migrations` table must not be integrated with any CI/CD pipeline, deployment workflow, or automated deployment process. Specifically:

- The PLANTMON Expo mobile app deployment must not read `schema_migrations`
- The `api-server` deployment workflow must not read `schema_migrations`
- No pre-deploy hook may compare `schema_migrations` contents against a migration file list and block deployment if a migration is "missing"
- No post-deploy hook may INSERT into `schema_migrations` as part of an automated deployment

**Why this boundary matters:** Deployment automation coupling would make it possible for a deployment to "apply" a migration record without the human governance executor performing the precheck, postcheck, and runtime validation. The `applied_by` field would contain a CI/CD service account name rather than a human name — the governance audit trail would be corrupted.

**The coupling boundary:** `schema_migrations` is a DB-resident governance artifact. It is read by human executors during manual governance operations. It is written to by human executors at the end of successful governance operations. It has no relationship to the deployment infrastructure that publishes the mobile app or runs the API server.

---

## SUMMARY: THE TABLE'S ROLE IN THE GOVERNANCE CORPUS

The `schema_migrations` table occupies a specific and bounded role in the PLANTMON governance architecture:

```
Governance corpus role map:

MIGRATION_AUTHORITY_DECLARATION.md    →  Who is authorized to execute migrations
MIGRATION_EXECUTION_PROTOCOL.md       →  How migrations must be executed (8 steps)
MIGRATION_PRECHECK_RUNBOOK.md         →  What must be verified before execution
MIGRATION_POSTCHECK_RUNBOOK.md        →  What must be verified after execution
MIGRATION_ROLLBACK_STRATEGY.md        →  When and how to reverse execution
MIGRATION_EXECUTION_LEDGER.md         →  Full narrative record of every execution
schema_migrations (DB table)           →  Queryable execution record in the live DB
                                          Answers: "was X applied to this DB?"
                                          Does not answer: "should X be applied?"
                                          Does not trigger: anything
```

The table is the governance corpus's one artifact that lives in the same space as the schema it tracks — the database. Every other governance document lives in the repository, external to the database. The `schema_migrations` table bridges the gap between "what the documents say happened" and "what the database knows happened" — without giving the database any authority over the migration process itself.

---

*This document is a read-only governance specification. No SQL was executed, no table was created, and no schema was modified in its generation. The `schema_migrations` table described here does not exist in the live PLANTMON Supabase database as of this document's authoring date. Its creation is a future governance event that requires its own migration SQL file, precheck execution, postcheck execution, and governance ledger entry.*
