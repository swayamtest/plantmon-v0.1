import { supabase } from "@/lib/supabase";
import { PlantCareProfile, TaskType } from "@/types/plant";

// Fallback schedule when no matching species profile is found
const DEFAULT_WATERING_DAYS = 7;

// ── Profile lookup ────────────────────────────────────────────
// Tries a case-insensitive partial match on species_name.
// Returns the closest match or null if the table has no entry.
export async function lookupCareProfile(
  speciesName: string | null | undefined,
): Promise<PlantCareProfile | null> {
  if (!speciesName?.trim()) return null;

  const term = speciesName.trim();

  const { data } = await supabase
    .from("plant_care_profiles")
    .select("*")
    .ilike("species_name", `%${term}%`)
    .order("species_name")
    .limit(1)
    .maybeSingle();

  return (data as PlantCareProfile | null) ?? null;
}

// ── Default care task generation ─────────────────────────────
// Called immediately after a plant is created.
// 1. Looks up matching care profile by species_name.
// 2. Falls back to DEFAULT_WATERING_DAYS when no match.
// 3. Inserts a watering care_task (+ fertilizing if profile has it).
// 4. Skips silently if an active watering task already exists.
export async function generateDefaultCareTasks(
  plantId: string,
  speciesName: string | null | undefined,
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

  const profile = await lookupCareProfile(speciesName);
  const waterFreq = profile?.watering_frequency_days ?? DEFAULT_WATERING_DAYS;

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
  if (profile?.fertilizing_frequency_days) {
    const fertFreq = profile.fertilizing_frequency_days;
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
