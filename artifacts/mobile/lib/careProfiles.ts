import { supabase } from "@/lib/supabase";
import { PlantCareProfile, TaskType } from "@/types/plant";

// ── Constants ─────────────────────────────────────────────────────────────────

// Default watering interval when no species profile can be resolved.
const DEFAULT_WATERING_DAYS = 7;

// ── Resolution types ──────────────────────────────────────────────────────────
// These types define the routing contract for Phase 2.2 identity activation.
// The routing entry point (resolveSpeciesProfile) accepts this input and
// returns a typed context alongside the resolved profile.

export type SpeciesResolutionInput = {
  species_name: string | null | undefined;
  // Phase 2.2 slot: canonical_species_id will be passed here once resolved at
  // plant creation. When set, the routing layer will use it to look up
  // plant_care_profiles.canonical_species_id directly, bypassing ilike entirely.
  canonical_species_id?: string | null;
};

export type SpeciesResolutionMethod =
  | "canonical_id_lookup"   // Phase 2.2: canonical_species_id → plant_care_profiles
  | "alias_lookup"          // Phase 2.2: alias → canonical_species_id → plant_care_profiles
  | "ilike_species_name"    // Phase 2.1 current: free-text ilike fallback
  | "default_fallback";     // No profile found; using DEFAULT_WATERING_DAYS

export type SpeciesResolutionContext = {
  method: SpeciesResolutionMethod;
  resolved: boolean;
};

export type SpeciesResolutionResult = {
  profile: PlantCareProfile | null;
  context: SpeciesResolutionContext;
};

// ── Internal lookup strategies ────────────────────────────────────────────────
// Each strategy is a self-contained async function.
// Phase 2.2 will add lookupByCanonicalId() and lookupByAlias() here.

// Current runtime strategy: case-insensitive partial match on species_name.
// Returns first alphabetical match or null.
async function lookupBySpeciesNameIlike(
  speciesName: string,
): Promise<PlantCareProfile | null> {
  const { data } = await supabase
    .from("plant_care_profiles")
    .select("*")
    .ilike("species_name", `%${speciesName.trim()}%`)
    .order("species_name")
    .limit(1)
    .maybeSingle();

  return (data as PlantCareProfile | null) ?? null;
}

// Phase 2.2 slot: canonical_species_id → plant_care_profiles lookup.
// Uncomment and implement when supabase-migration-v2.sql is applied and
// canonical_species_id is populated on plants.
//
// async function lookupByCanonicalId(
//   canonicalSpeciesId: string,
// ): Promise<PlantCareProfile | null> {
//   const { data } = await supabase
//     .from("plant_care_profiles")
//     .select("*")
//     .eq("canonical_species_id", canonicalSpeciesId)
//     .maybeSingle();
//   return (data as PlantCareProfile | null) ?? null;
// }

// Phase 2.2 slot: alias lookup → canonical_species_id → plant_care_profiles.
// Uncomment and implement when plant_aliases table is seeded.
//
// async function lookupByAlias(
//   aliasName: string,
// ): Promise<PlantCareProfile | null> {
//   const { data: alias } = await supabase
//     .from("plant_aliases")
//     .select("canonical_species_id")
//     .ilike("alias_name", aliasName.trim())
//     .order("search_priority", { ascending: false })
//     .limit(1)
//     .maybeSingle();
//   if (!alias?.canonical_species_id) return null;
//   return lookupByCanonicalId(alias.canonical_species_id);
// }

// ── Routing entry point ───────────────────────────────────────────────────────
// Central routing function for all care profile resolution.
// Phase 2.2 will insert canonical_species_id and alias routes ABOVE the ilike fallback.
// Current behavior: ilike on species_name → default fallback.

export async function resolveSpeciesProfile(
  input: SpeciesResolutionInput,
): Promise<SpeciesResolutionResult> {
  // ── Phase 2.2 slot: canonical_species_id route ──────────────────────────────
  // When plants.canonical_species_id is populated (Phase 2.2 onboarding active),
  // short-circuit here: exact canonical lookup, no fuzzy matching needed.
  //
  // if (input.canonical_species_id) {
  //   const profile = await lookupByCanonicalId(input.canonical_species_id);
  //   if (profile) return { profile, context: { method: "canonical_id_lookup", resolved: true } };
  // }

  // ── Phase 2.2 slot: alias lookup route ─────────────────────────────────────
  // If alias table is populated and species_name looks like a common/regional name,
  // try alias lookup before falling through to ilike.
  //
  // if (input.species_name?.trim()) {
  //   const profile = await lookupByAlias(input.species_name);
  //   if (profile) return { profile, context: { method: "alias_lookup", resolved: true } };
  // }

  // ── Current runtime: ilike fallback ─────────────────────────────────────────
  if (input.species_name?.trim()) {
    const profile = await lookupBySpeciesNameIlike(input.species_name);
    if (profile) {
      return { profile, context: { method: "ilike_species_name", resolved: true } };
    }
  }

  return {
    profile: null,
    context: { method: "default_fallback", resolved: false },
  };
}

// ── Scheduler utilities ───────────────────────────────────────────────────────
// Centralise frequency decisions so the scheduler has a single plug-in point.
// Phase 2.2 will pass the active season here; the function will then prefer
// seasonal frequencies over the legacy flat field.

export type Season = "spring" | "summer" | "autumn" | "winter";

export function getEffectiveWateringFrequency(
  profile: PlantCareProfile | null,
  // Phase 2.2 slot: pass current season from a season-detection utility.
  // When seasonal fields are populated, the function will return the
  // season-appropriate value instead of the flat legacy field.
  _season?: Season,
): number {
  // Phase 2.2 slot: seasonal routing (activate when DB fields are populated).
  // if (_season && profile) {
  //   const seasonalFreq = {
  //     spring: profile.watering_frequency_spring,
  //     summer: profile.watering_frequency_summer,
  //     autumn: profile.watering_frequency_autumn,
  //     winter: profile.watering_frequency_winter,
  //   }[_season];
  //   if (seasonalFreq != null) return seasonalFreq;
  // }

  return profile?.watering_frequency_days ?? DEFAULT_WATERING_DAYS;
}

export function getEffectiveFertilizingFrequency(
  profile: PlantCareProfile | null,
  _season?: Season,
): number | null {
  // Phase 2.2 slot: seasonal fertilizing routing.
  // if (_season && profile) {
  //   const seasonalFreq = { ... }[_season];
  //   if (seasonalFreq != null) return seasonalFreq;
  // }

  return profile?.fertilizing_frequency_days ?? null;
}

// ── Backward-compatible public export ────────────────────────────────────────
// Preserved so existing callers (usePlants.ts) require no changes.
// Phase 2.2 may deprecate this in favour of direct resolveSpeciesProfile usage.
export async function lookupCareProfile(
  speciesName: string | null | undefined,
): Promise<PlantCareProfile | null> {
  const { profile } = await resolveSpeciesProfile({ species_name: speciesName });
  return profile;
}

// ── Task generation ───────────────────────────────────────────────────────────
// Called immediately after a plant is created.
// 1. Resolves species profile via routing entry point.
// 2. Falls back to DEFAULT_WATERING_DAYS when no match.
// 3. Inserts a watering care_task (+ fertilizing if profile has it).
// 4. Skips silently if an active watering task already exists.
export async function generateDefaultCareTasks(
  plantId: string,
  speciesName: string | null | undefined,
  // Phase 2.2 slot: pass canonical_species_id here once identity resolution is active.
  // Will be forwarded to resolveSpeciesProfile for the canonical_id_lookup route.
  _canonicalSpeciesId?: string | null,
): Promise<void> {
  // Guard: never create a duplicate active watering schedule
  const { data: existing } = await supabase
    .from("care_tasks")
    .select("id")
    .eq("plant_id", plantId)
    .eq("task_type", "watering")
    .eq("active_status", true)
    .maybeSingle();

  if (existing) return;

  const { profile, context } = await resolveSpeciesProfile({
    species_name: speciesName,
    // Phase 2.2: uncomment when canonical_species_id is passed in:
    // canonical_species_id: _canonicalSpeciesId,
  });

  // Visibility: warn when no care profile matched so silent fallbacks surface
  // during development and internal testing. Does NOT affect onboarding flow.
  if (context.method === "default_fallback") {
    console.warn(
      `[generateDefaultCareTasks] No care profile resolved for species ` +
      `"${speciesName ?? "(none)"}". ` +
      `Using ${DEFAULT_WATERING_DAYS}-day fallback watering schedule.`,
    );
  }

  const waterFreq = getEffectiveWateringFrequency(profile);
  const fertFreq  = getEffectiveFertilizingFrequency(profile);

  const tasks: {
    plant_id: string;
    task_type: TaskType;
    frequency_days: number;
    next_due_at: string;
    active_status: boolean;
  }[] = [
    {
      plant_id: plantId,
      task_type: "watering",
      frequency_days: waterFreq,
      next_due_at: new Date(Date.now() + waterFreq * 86_400_000).toISOString(),
      active_status: true,
    },
  ];

  // Extend with fertilizing schedule when profile provides one.
  // Architecture supports adding misting / pruning / repotting here later.
  if (fertFreq != null) {
    tasks.push({
      plant_id: plantId,
      task_type: "fertilizing",
      frequency_days: fertFreq,
      next_due_at: new Date(Date.now() + fertFreq * 86_400_000).toISOString(),
      active_status: true,
    });
  }

  const { error } = await supabase.from("care_tasks").insert(tasks);
  if (error) throw error;
}
