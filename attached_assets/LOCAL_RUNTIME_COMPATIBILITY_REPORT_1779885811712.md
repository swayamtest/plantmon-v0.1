# LOCAL_RUNTIME_COMPATIBILITY_REPORT.md

## PLANTMON — Phase B1.5A Runtime Compatibility Synchronization Audit

Status: COMPLETE
Runtime State: Migration-Compatible
Behavioral Impact: ZERO (legacy runtime intentionally preserved)

---

# PURPOSE

This document audits and validates:
the runtime compatibility synchronization layer introduced between:

* Phase 2.1 schema evolution
* live Supabase infrastructure activation
* future runtime identity activation

This synchronization layer exists to:

* preserve runtime continuity
* enable additive migration safety
* prevent premature canonical activation
* prepare the scheduler for future seasonal evolution
* decouple infrastructure activation from runtime activation

The runtime now safely supports:
progressive evolution.

---

# SYNCHRONIZATION OBJECTIVES

The synchronization phase introduced:

* compatibility shims
* deferred activation routing
* future canonical identity hooks
* scheduler abstraction layers
* runtime validation utilities

while intentionally preserving:

* legacy onboarding
* legacy watering logic
* static scheduler behavior
* free-text species onboarding
* existing UI behavior
* existing Supabase query assumptions

The synchronization layer acts as:
a bridge between:
legacy runtime
and
future canonical runtime architecture.

---

# FILES AUDITED

| File                                             | Role                                   |
| ------------------------------------------------ | -------------------------------------- |
| hooks/usePlants.ts                               | Runtime CRUD + scheduler orchestration |
| lib/careProfiles.ts                              | Identity routing + scheduler lookup    |
| components/PlantForm.tsx                         | Onboarding species capture             |
| lib/runtimeValidation.ts                         | Runtime diagnostics                    |
| types/plant.ts                                   | Runtime schema compatibility           |
| types/canonical.ts                               | Canonical identity governance          |
| RUNTIME_IMPLEMENTATION_BLUEPRINT_v0.1.md         | Runtime topology source                |
| Plant Manager — Phase 2.1 Additive Migration.sql | Infrastructure migration source        |

---

# usePlants.ts — COMPATIBILITY SHIM AUDIT

## Purpose

This file now safely bridges:
legacy runtime inserts
and
future canonical runtime fields.

## Critical Synchronization Logic

The runtime strips:

* user_entered_name
* canonical_species_id
* canonical_species_name
* species_resolution_method

before Supabase insert/update operations.

Purpose:
prevent PostgREST schema failures during:
pre-migration
and
partial-migration runtime states.

## Forward-Compatible Query Expansion

Legacy:

```ts id="a4n4rj"
.select("id, species_name")
```

Current:

```ts id="w08a7s"
.select("*")
```

Purpose:
future nullable columns now arrive safely
without runtime query rewrites.

## Runtime Status

| Area                           | Status   |
| ------------------------------ | -------- |
| Migration safety               | VERIFIED |
| Runtime continuity             | VERIFIED |
| Deferred activation discipline | VERIFIED |
| Backward compatibility         | VERIFIED |

---

# careProfiles.ts — ROUTING ARCHITECTURE AUDIT

## Purpose

This file now functions as:
the future runtime identity-routing backbone.

## Central Routing Entry Point

The runtime now exposes:

```ts id="96s4vb"
resolveSpeciesProfile()
```

This introduces:

* future canonical routing
* future alias lookup routing
* future collapse normalization routing
* scheduler abstraction points

while preserving:
legacy ilike profile lookup behavior.

## Current Runtime Behavior

Current runtime still operates as:

```text id="z0v1z2"
species_name
→ ilike lookup
→ plant_care_profiles.species_name
```

No behavioral activation has occurred yet.

## Scheduler Compatibility Preparation

The following abstraction helpers now exist:

* getEffectiveWateringFrequency()
* getEffectiveFertilizingFrequency()

These create:
the future activation point for:
seasonal scheduler evolution.

This prevents:
future scheduler rewrites across runtime callsites.

---

# PlantForm.tsx — ONBOARDING SYNCHRONIZATION AUDIT

## Purpose

The onboarding layer now preserves:
raw user onboarding terminology.

## Synchronization Behavior

The runtime now captures:

```ts id="2u1j9g"
user_entered_name
```

during onboarding.

This value is:
captured
but intentionally NOT persisted yet.

## Architectural Importance

Previously:
the runtime permanently discarded:
the user's original onboarding terminology.

The synchronization layer now preserves:
future onboarding intelligence capability.

## Runtime Flow

```text id="j9mhcx"
PlantForm capture
→ usePlants compatibility shim
→ legacy-safe DB insert
```

Correct behavior.

---

# runtimeValidation.ts — DIAGNOSTIC LAYER AUDIT

## Purpose

Introduces:
the first dedicated runtime introspection layer.

## Utilities Added

### Identity Diagnostics

* canonical resolution checks
* onboarding readiness checks
* identity status classification

### Scheduler Diagnostics

* watering task inspection
* active task validation
* schedule health checks

### Migration Diagnostics

* schema readiness detection
* migration warning generation
* runtime activation gating

## Architectural Importance

This file now provides:
non-mutative runtime introspection.

Purpose:

* migration validation
* runtime readiness checks
* scheduler diagnostics
* Phase 2.2 activation gating

without introducing:
runtime side effects.

---

# RUNTIME CONTINUITY GUARANTEES

The synchronization layer intentionally preserves:

| Runtime Area                    | Preserved |
| ------------------------------- | --------- |
| Existing onboarding flow        | YES       |
| Existing watering logic         | YES       |
| Existing care task generation   | YES       |
| Existing scheduler behavior     | YES       |
| Existing Supabase compatibility | YES       |
| Existing UI behavior            | YES       |
| Existing free-text onboarding   | YES       |

No destructive runtime changes were introduced.

---

# INFRASTRUCTURE ACTIVATION VS RUNTIME ACTIVATION

The synchronization work intentionally separates:

| Layer                         | Status   |
| ----------------------------- | -------- |
| Infrastructure activation     | COMPLETE |
| Runtime compatibility         | COMPLETE |
| Dataset synchronization       | PENDING  |
| Runtime identity activation   | PENDING  |
| Seasonal scheduler activation | PENDING  |

This separation is intentional.

The runtime now supports:
progressive activation.

---

# DEFERRED ACTIVATION SYSTEMS

The following systems are intentionally prepared but inactive:

| System                             | Status   |
| ---------------------------------- | -------- |
| canonical_species_id routing       | PREPARED |
| alias routing                      | PREPARED |
| collapse normalization             | PREPARED |
| seasonal scheduler                 | PREPARED |
| species_resolution_method tracking | PREPARED |
| canonical care_logs propagation    | PREPARED |

These systems remain intentionally inactive until:
dataset synchronization completes.

---

# KNOWN REMAINING GAPS

## Gap 1 — care_logs canonical propagation

Current watering events do NOT yet propagate:
canonical_species_id
into:
care_logs.

This must be activated during:
Phase 2.2 runtime identity activation.

---

## Gap 2 — Pre-Phase 2.2 canonical backfill

Plants created before:
canonical synchronization
currently have:
NULL canonical_species_id.

A one-time deterministic backfill process will be required.

---

## Gap 3 — Scheduler countdown divergence risk

Current UI countdown calculations still derive from:
last_completed_at + frequency_days

instead of:
next_due_at.

This becomes dangerous once:
seasonal scheduler recalculation activates.

Must be corrected before:
dynamic scheduler activation.

---

# GOVERNANCE VALIDATION

The runtime synchronization layer correctly preserves:
the architectural separation between:

| Layer              | Responsibility            |
| ------------------ | ------------------------- |
| aliases            | onboarding recognition    |
| collapse mappings  | operational normalization |
| canonical identity | runtime determinism       |

No governance violations detected.

---

# FINAL ASSESSMENT

| Area                           | Status   |
| ------------------------------ | -------- |
| Runtime compatibility          | VERIFIED |
| Migration safety               | VERIFIED |
| Deferred activation discipline | VERIFIED |
| Scheduler preparation          | VERIFIED |
| Runtime continuity             | VERIFIED |
| Governance integrity           | VERIFIED |
| Rollback safety                | VERIFIED |

---

# NEXT RECOMMENDED PHASE

## PHASE B2.0 — PRE-DATASET HARDENING MIGRATION

Before:

* canonical_species synchronization
* aliases synchronization
* collapse mappings synchronization
* runtime identity activation

the project should execute:
a strictly additive runtime hardening migration focused on:

* indexes
* query optimization
* scheduler integrity
* RLS hardening
* canonical query performance
* operational runtime protection

before dataset synchronization begins.
