// ============================================================
// Centralized Enum Governance — Phase 2.1 Schema Freeze
// ALL application enums are defined here.
// No free-text enum drift is permitted.
// To add a value: update here + supabase-setup.sql + migration.
// ============================================================

// ── light_requirement ────────────────────────────────────────
// Canonical (Phase 2.1):
export type LightRequirement =
  | "low_light"
  | "medium_indirect"
  | "bright_indirect"
  | "direct_sun";

// Legacy (v0.1 — coexists during migration):
export type LightRequirementLegacy = "low" | "medium" | "full_sun";

// Union for hooks/components that read from DB during migration:
export type LightRequirementAny = LightRequirement | LightRequirementLegacy;

// ── humidity_preference ──────────────────────────────────────
export type HumidityPreference = "low" | "medium" | "high";

// ── difficulty_level ─────────────────────────────────────────
// Canonical (Phase 2.1):
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

// Legacy (v0.1 — coexists during migration):
export type DifficultyLevelLegacy = "easy" | "hard";

// Union for hooks/components that read from DB during migration:
export type DifficultyLevelAny = DifficultyLevel | DifficultyLevelLegacy;

// ── species_resolution_method ────────────────────────────────
// Tracks HOW a plant's canonical identity was resolved.
// Required for onboarding analytics and future AI training.
export type SpeciesResolutionMethod =
  | "direct_species_match"
  | "alias_match"
  | "collapse_mapping_match"
  | "fuzzy_match"
  | "manual_override"
  | "unresolved";

// ── alias_type ───────────────────────────────────────────────
export type AliasType =
  | "common_name"
  | "cultivar_name"
  | "regional_name"
  | "nursery_name"
  | "beginner_name";

// ── task_type ────────────────────────────────────────────────
// Phase 2.1 canonical: repotting removed (uses repotting_tasks).
// 'cleaning' added.
export type TaskType =
  | "watering"
  | "fertilizing"
  | "misting"
  | "pruning"
  | "cleaning";

// Legacy — 'repotting' coexists in DB check constraint during migration.
export type TaskTypeLegacy = TaskType | "repotting";

// ── care_task_status ─────────────────────────────────────────
export type CareTaskStatus = "pending" | "completed" | "skipped" | "overdue";

// ── identity_status ──────────────────────────────────────────
export type IdentityStatus = "active" | "deprecated" | "review_required";

// ── watering_method ──────────────────────────────────────────
export type WateringMethod =
  | "soak_and_drain"
  | "consistent_moisture"
  | "infrequent_deep_watering"
  | "bottom_water"
  | "mist_and_airflow"
  | "submersion_soak";

// ── fertilizing_method ───────────────────────────────────────
export type FertilizingMethod =
  | "diluted_liquid_feed"
  | "slow_release_granules"
  | "compost_topdress"
  | "orchid_fertilizer"
  | "low_nutrient_requirement"
  | "foliar_feed";

// ── repotting_method ─────────────────────────────────────────
export type RepottingMethod =
  | "upgrade_pot_size"
  | "refresh_substrate"
  | "bark_refresh"
  | "root_division"
  | "minimal_disturbance";

// ============================================================
// canonical_species
// Permanent operational identity registry.
// canonical_species_id is immutable — never changes, never recycles.
// Format: PLANT_0001, PLANT_0002, …
// ============================================================
export interface CanonicalSpecies {
  canonical_species_id: string;     // immutable PK e.g. 'PLANT_0001'
  species_name: string;             // display-oriented; may evolve
  primary_archetype: string | null; // metadata only — NOT an inheritance system
  mainstream_priority: number | null;
  india_relevance: number | null;
  inventory_version: string | null;
  identity_status: IdentityStatus;
  review_notes: string | null;
  created_at: string;
}

// ============================================================
// plant_aliases
// Recognition and onboarding normalization layer.
// Aliases are onboarding tools ONLY.
// They MUST resolve into canonical_species_id before any
// scheduling, task generation, or care logic runs.
// ============================================================
export interface PlantAlias {
  id: string;
  alias_name: string;               // searchable e.g. 'Money Plant', 'Tulsi'
  canonical_species_name: string;   // human-readable resolved target
  canonical_species_id: string;     // FK → canonical_species
  alias_type: AliasType;
  language_region: string | null;   // e.g. 'en-IN', 'hi-IN'
  search_priority: number;          // higher = shown first in onboarding
  alias_confidence: number;         // 0.0 – 1.0
  review_notes: string | null;
  created_at: string;
}

// ============================================================
// collapse_mappings
// Operational normalization layer.
// NOT a taxonomy system.
// Maps variant species inputs to a single canonical identity
// for operational care purposes.
// Must always terminate in ONE canonical_species_id.
// ============================================================
export interface CollapseMapping {
  id: string;
  collapsed_species_name: string;   // e.g. 'Pothos NJoy'
  canonical_species_name: string;   // e.g. 'Epipremnum aureum'
  canonical_species_id: string;     // FK → canonical_species
  collapse_reason: string | null;
  operational_similarity: number | null;   // 0.0 – 1.0
  consumer_recognition_overlap: number | null; // 0.0 – 1.0
  collapse_confidence: number | null;      // 0.0 – 1.0
  review_notes: string | null;
  created_at: string;
}
