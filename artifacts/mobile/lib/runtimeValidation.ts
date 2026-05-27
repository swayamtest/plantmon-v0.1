// ── Runtime Validation Utilities — Phase 2.1 ─────────────────────────────────
// Pure inspection functions. No mutations. No side effects.
// These utilities do NOT alter runtime behavior.
// They are used for: diagnostics, migration readiness checks, and Phase 2.2 gate logic.

import type { Plant, CareTask } from "@/types/plant";

// ── Identity status ───────────────────────────────────────────────────────────

// The three possible identity resolution states for a plant record.
export type PlantIdentityStatus =
  | "canonical"        // canonical_species_id is set — fully resolved
  | "species_known"    // species_name is set but canonical_species_id is null
  | "display_name_only"; // neither species_name nor canonical_species_id is set

export function getPlantIdentityStatus(
  plant: Pick<Plant, "species_name" | "canonical_species_id">,
): PlantIdentityStatus {
  if (plant.canonical_species_id) return "canonical";
  if (plant.species_name) return "species_known";
  return "display_name_only";
}

// Returns true only when canonical_species_id is set (Phase 2.2 resolved).
export function isCanonicallyResolved(
  plant: Pick<Plant, "canonical_species_id">,
): boolean {
  return !!plant.canonical_species_id;
}

// Returns true if the plant record carries enough species context for
// a care profile lookup attempt (either canonical or free-text path).
export function hasResolvableSpecies(
  plant: Pick<Plant, "species_name" | "canonical_species_id">,
): boolean {
  return !!(plant.species_name?.trim() || plant.canonical_species_id);
}

// Returns true if the plant's raw onboarding input was captured.
// user_entered_name is populated post-Phase 2.2 identity activation.
export function hasUserEnteredName(
  plant: Pick<Plant, "user_entered_name">,
): boolean {
  return !!plant.user_entered_name?.trim();
}

// ── Schedule status ───────────────────────────────────────────────────────────

// Returns true if the plant has an active watering care_task with a schedule.
export function hasActiveWateringSchedule(
  plant: Pick<Plant, "care_tasks">,
): boolean {
  return !!plant.care_tasks?.some(
    (t: CareTask) => t.task_type === "watering" && t.active_status && t.frequency_days != null,
  );
}

// Returns the active watering task or undefined.
export function getActiveWateringTask(
  plant: Pick<Plant, "care_tasks">,
): CareTask | undefined {
  return plant.care_tasks?.find(
    (t: CareTask) => t.task_type === "watering" && t.active_status,
  );
}

// ── Schema migration compatibility ───────────────────────────────────────────
// These checks inspect a plant record returned from the DB to determine
// whether the Phase 2.1 migration has been applied.
// Usage: call after any plant fetch to detect schema state.

export type SchemaMigrationStatus = "migrated" | "not_migrated" | "unknown";

// Checks whether supabase-migration-v2.sql has been applied by inspecting
// the presence of Phase 2.1 columns in a DB response row.
// NOTE: Supabase returns undefined for unknown columns (not null), so
// `canonical_species_id` being `undefined` means the column doesn't exist yet.
// `canonical_species_id` being `null` means the column exists but is unset.
export function getSchemaMigrationStatus(
  plantRow: Record<string, unknown>,
): SchemaMigrationStatus {
  if (!("canonical_species_id" in plantRow)) return "not_migrated";
  if (!("user_entered_name" in plantRow)) return "not_migrated";
  return "migrated";
}

// Returns a list of human-readable migration warnings for a plant row.
// Empty array = all Phase 2.1 columns are present.
export function getMigrationWarnings(plantRow: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const phase21Columns = [
    "canonical_species_id",
    "user_entered_name",
    "canonical_species_name",
    "species_resolution_method",
  ];
  for (const col of phase21Columns) {
    if (!(col in plantRow)) {
      warnings.push(
        `Column '${col}' missing on plants — supabase-migration-v2.sql not yet applied`,
      );
    }
  }
  return warnings;
}

// ── Phase 2.2 readiness ───────────────────────────────────────────────────────
// Gate checks used to determine whether Phase 2.2 identity activation is safe.

// Returns true when a plant is in the right state for canonical resolution:
// has a species name to resolve, but has not yet been resolved.
export function isReadyForCanonicalResolution(
  plant: Pick<Plant, "species_name" | "canonical_species_id">,
): boolean {
  return !!plant.species_name?.trim() && !plant.canonical_species_id;
}

// Counts plants by identity status within a plant list.
export function summarizeIdentityStatus(plants: Plant[]): {
  canonical: number;
  species_known: number;
  display_name_only: number;
  total: number;
} {
  const counts = { canonical: 0, species_known: 0, display_name_only: 0, total: plants.length };
  for (const p of plants) {
    counts[getPlantIdentityStatus(p)]++;
  }
  return counts;
}
