// ============================================================
// Core domain types — Phase 2.1 Schema Freeze
// Enums are governed centrally in types/canonical.ts.
// Legacy fields are preserved for backward compatibility.
// ============================================================

export type {
  // Enums
  TaskType,
  TaskTypeLegacy,
  LightRequirement,
  LightRequirementLegacy,
  LightRequirementAny,
  HumidityPreference,
  DifficultyLevel,
  DifficultyLevelLegacy,
  DifficultyLevelAny,
  SpeciesResolutionMethod,
  WateringMethod,
  FertilizingMethod,
  RepottingMethod,
  CareTaskStatus,
  IdentityStatus,
  AliasType,
  // Entities
  CanonicalSpecies,
  PlantAlias,
  CollapseMapping,
} from "./canonical";

import type {
  TaskTypeLegacy,
  LightRequirementAny,
  HumidityPreference,
  DifficultyLevelAny,
  SpeciesResolutionMethod,
  WateringMethod,
  FertilizingMethod,
  RepottingMethod,
} from "./canonical";

// ── plant_care_profiles ──────────────────────────────────────
// Operational source-of-truth for care intelligence.
// ALL scheduling must derive from this table via canonical_species_id.
// Legacy flat fields preserved during migration (see Section 10 of schema freeze doc).
export interface PlantCareProfile {
  id: string;

  // Phase 2.1: Canonical identity link
  canonical_species_id: string | null;  // FK → canonical_species

  // Legacy identity (kept for backward compat — used by ilike lookup)
  species_name: string;

  // ── Legacy scheduling (Phase 2.1: superseded by seasonal fields) ──
  // Kept during migration. Will be deprecated after scheduler migration.
  watering_frequency_days: number;
  fertilizing_frequency_days: number | null;

  // ── Phase 2.1: Seasonal watering frequencies (days between watering) ──
  watering_frequency_spring: number | null;
  watering_frequency_summer: number | null;
  watering_frequency_autumn: number | null;
  watering_frequency_winter: number | null;

  // ── Phase 2.1: Seasonal fertilizing frequencies (days between feeding) ──
  fertilizing_frequency_spring: number | null;
  fertilizing_frequency_summer: number | null;
  fertilizing_frequency_autumn: number | null;
  fertilizing_frequency_winter: number | null;

  // ── Phase 2.1: Method systems ────────────────────────────────
  watering_method: WateringMethod | null;
  watering_method_description: string | null;
  fertilizing_method: FertilizingMethod | null;
  fertilizing_method_description: string | null;
  repotting_method: RepottingMethod | null;
  repotting_signs: string | null;
  repotting_method_description: string | null;
  repotting_frequency_months: number | null;

  // ── Phase 2.1: Semantic intelligence (Section 7 of schema freeze doc) ──
  // plant_profile    → "What is this plant generally like?"
  // seasonal_adjustments → "What changes this season?"
  // care_alerts      → "What should I watch out for?"
  plant_profile: string | null;
  seasonal_adjustments: string | null;
  care_alerts: string | null;

  // ── Phase 2.1: Placement ────────────────────────────────────
  placement_guidance: string | null;
  suggested_location: string | null;

  // ── Governance enums ─────────────────────────────────────────
  // LightRequirementAny / DifficultyLevelAny accept both legacy and
  // canonical values during the migration transition period.
  light_requirement: LightRequirementAny | null;
  humidity_preference: HumidityPreference | null;
  difficulty_level: DifficultyLevelAny | null;

  // ── Legacy guidance field (replaced by semantic fields above) ──
  notes: string | null;

  created_at: string;
}

// ── care_tasks ───────────────────────────────────────────────
export interface CareTask {
  id: string;
  plant_id: string;
  canonical_species_id: string | null;  // Phase 2.1 addition

  // TaskTypeLegacy during migration (includes 'repotting' for compat)
  task_type: TaskTypeLegacy;

  frequency_days: number | null;
  last_completed_at: string | null;
  next_due_at: string | null;
  notes: string | null;
  active_status: boolean;
  created_at: string;
}

// ── care_logs ────────────────────────────────────────────────
export interface CareLog {
  id: string;
  plant_id: string;
  canonical_species_id: string | null;  // Phase 2.1 addition
  task_type: TaskTypeLegacy;
  completed_at: string;
  notes: string | null;
  image_url: string | null;
}

// ── journal_entries ──────────────────────────────────────────
export interface JournalEntry {
  id: string;
  plant_id: string;
  canonical_species_id: string | null;  // Phase 2.1 addition
  title: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

// ── health_logs ──────────────────────────────────────────────
// health_score: 1=Critical  2=Poor  3=Stable  4=Healthy  5=Thriving
export interface HealthLog {
  id: string;
  plant_id: string;
  canonical_species_id: string | null;  // Phase 2.1 addition
  health_score: 1 | 2 | 3 | 4 | 5;
  issue_type: string | null;
  severity: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

// ── plants ───────────────────────────────────────────────────
// Four-layer identity separation (Section 2 of schema freeze doc):
//  1. User ownership  → display_name  (emotional, editable)
//  2. Recognition     → user_entered_name  (onboarding input, raw)
//  3. Canonical op.   → canonical_species_id  (runtime backbone)
//  4. Behavioral      → via plant_care_profiles.canonical_species_id
export interface Plant {
  id: string;
  user_id: string;

  // ── Layer 1: User ownership identity (emotional, editable) ──
  // Note: schema freeze doc calls this 'plant_name'.
  // Column remains 'display_name' in DB for backward compat.
  display_name: string;

  // ── Layer 2: Recognition identity ────────────────────────────
  user_entered_name: string | null;   // raw onboarding input

  // ── Layer 3: Canonical operational identity ───────────────────
  canonical_species_id: string | null;    // FK → canonical_species; runtime backbone
  canonical_species_name: string | null;  // display helper; NOT runtime-stable
  species_resolution_method: SpeciesResolutionMethod | null;

  // ── Legacy identity (kept for backward compat during migration) ──
  species_name: string | null;
  botanical_name: string | null;

  // Placement
  room_location: string | null;

  // Legacy enrichment columns (retained for compat; may be deprecated later)
  notes: string | null;
  image_url: string | null;
  light_conditions: string | null;
  humidity_preferences: string | null;
  watering_preferences: string | null;
  purchase_date: string | null;
  acquired_from: string | null;

  // Timestamps
  created_at: string;
  updated_at: string | null;

  // Joined relation (populated by usePlants/usePlant)
  care_tasks?: CareTask[];
}

// ── PlantInput ───────────────────────────────────────────────
// Minimal form input. display_name is the only required field.
// Backward compat: species_name still accepted from legacy form.
// Phase 2.1: canonical fields are optional (populated by resolution pipeline).
export interface PlantInput {
  display_name: string;

  // Legacy compat
  species_name?: string;

  // Phase 2.1: recognition + canonical identity
  user_entered_name?: string;
  canonical_species_id?: string;
  canonical_species_name?: string;
  species_resolution_method?: SpeciesResolutionMethod;

  // Optional enrichment
  botanical_name?: string;
  room_location?: string;
  notes?: string;
  image_url?: string;
  light_conditions?: string;
  watering_preferences?: string;
}

// ── helpers ──────────────────────────────────────────────────

export function getWateringTask(plant: Plant): CareTask | undefined {
  return plant.care_tasks?.find((t) => t.task_type === "watering");
}

export function getDaysUntilWatering(plant: Plant): number {
  const task = getWateringTask(plant);
  if (!task?.last_completed_at || !task?.frequency_days) return 0;
  const last = new Date(task.last_completed_at);
  const next = new Date(
    last.getTime() + task.frequency_days * 24 * 60 * 60 * 1000,
  );
  const diff = Math.ceil(
    (next.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(0, diff);
}

export function needsWatering(plant: Plant): boolean {
  return getDaysUntilWatering(plant) === 0;
}
