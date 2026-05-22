// ============================================================
// Core domain types — aligned with Supabase schema
// ============================================================

export type TaskType =
  | "watering"
  | "fertilizing"
  | "misting"
  | "pruning"
  | "repotting";

// ── care_tasks ───────────────────────────────────────────────
export interface CareTask {
  id: string;
  plant_id: string;
  task_type: TaskType;
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
  task_type: TaskType;
  completed_at: string;
  notes: string | null;
  image_url: string | null;
}

// ── journal_entries ──────────────────────────────────────────
export interface JournalEntry {
  id: string;
  plant_id: string;
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
  health_score: 1 | 2 | 3 | 4 | 5;
  issue_type: string | null;
  severity: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

// ── plants ───────────────────────────────────────────────────
// Only display_name is mandatory. All other fields are optional.
// care_tasks is populated by usePlants/usePlant via joined select.
export interface Plant {
  id: string;
  user_id: string;

  // mandatory
  display_name: string;

  // optional identity
  species_name: string | null;
  botanical_name: string | null;

  // optional placement
  room_location: string | null;

  // optional enrichment
  notes: string | null;
  image_url: string | null;
  light_conditions: string | null;
  humidity_preferences: string | null;
  watering_preferences: string | null;
  purchase_date: string | null;
  acquired_from: string | null;

  // timestamps
  created_at: string;
  updated_at: string | null;

  // joined relation (always fetched by hooks)
  care_tasks?: CareTask[];
}

// Minimal input for creating/updating a plant.
// Only display_name is required; all else is optional enrichment.
export interface PlantInput {
  display_name: string;
  species_name?: string;
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
  const next = new Date(last.getTime() + task.frequency_days * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

export function needsWatering(plant: Plant): boolean {
  return getDaysUntilWatering(plant) === 0;
}
