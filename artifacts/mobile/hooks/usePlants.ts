import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Plant, PlantInput, TaskType } from "@/types/plant";
import { useAuth } from "@/contexts/AuthContext";
import { generateDefaultCareTasks } from "@/lib/careProfiles";

// Full join selector — unchanged; `*` returns all columns (new nullable ones arrive as null
// after supabase-migration-v2.sql runs, with no query changes required).
const PLANT_SELECT = "*, care_tasks(*)";

export function usePlants() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plants", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plants")
        .select(PLANT_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plant[];
    },
    enabled: !!user,
  });
}

export function usePlant(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plant", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plants")
        .select(PLANT_SELECT)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Plant;
    },
    enabled: !!user && !!id,
  });
}

export function useCreatePlant() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: PlantInput) => {
      // Auth guard — fail gracefully instead of crashing on user!.id
      if (!user) {
        throw new Error(
          "[useCreatePlant] Cannot create plant: auth session is missing. " +
          "Please sign in and try again.",
        );
      }

      // ── Phase 2.1 compatibility shim ──────────────────────────────────────────
      // Strip Phase 2.1 canonical fields that don't exist in the DB yet.
      // After running supabase-migration-v2.sql, remove this destructuring and
      // spread the full `input` object (or add each field explicitly to insertPayload).
      //
      // ACTIVATE POST-MIGRATION (uncomment each line when column is confirmed live):
      //   user_entered_name        → plants.user_entered_name
      //   canonical_species_id     → plants.canonical_species_id
      //   canonical_species_name   → plants.canonical_species_name
      //   species_resolution_method → plants.species_resolution_method
      // ─────────────────────────────────────────────────────────────────────────
      const {
        user_entered_name: _user_entered_name,
        canonical_species_id: _canonical_species_id,
        canonical_species_name: _canonical_species_name,
        species_resolution_method: _species_resolution_method,
        ...v01Fields
      } = input;

      // 1. Insert the plant record (v0.1-compatible fields only)
      const { data: created, error: insertError } = await supabase
        .from("plants")
        .insert({ ...v01Fields, user_id: user.id })
        // select("*") is forward-compatible: pre-migration returns v0.1 columns,
        // post-migration returns all columns (new ones as null). No query change needed.
        .select("*")
        .single();
      if (insertError) throw insertError;

      const plantCore = created as {
        id: string;
        species_name: string | null;
        canonical_species_id: string | null;
      };

      // 2. Auto-generate default care tasks based on species (or fallback defaults)
      await generateDefaultCareTasks(plantCore.id, plantCore.species_name);

      // 3. Re-fetch the full plant record with care_tasks joined
      const { data: plant, error: fetchError } = await supabase
        .from("plants")
        .select(PLANT_SELECT)
        .eq("id", plantCore.id)
        .single();
      if (fetchError) throw fetchError;
      return plant as Plant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plants"] });
    },
  });
}

export function useUpdatePlant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: PlantInput & { id: string }) => {
      // ── Phase 2.1 compatibility shim ──────────────────────────────────────────
      // Strip Phase 2.1 canonical fields that don't exist in the DB yet.
      // Same pattern as useCreatePlant — activate post-migration.
      // ─────────────────────────────────────────────────────────────────────────
      const {
        user_entered_name: _user_entered_name,
        canonical_species_id: _canonical_species_id,
        canonical_species_name: _canonical_species_name,
        species_resolution_method: _species_resolution_method,
        ...v01Fields
      } = input;

      const { data, error } = await supabase
        .from("plants")
        .update({ ...v01Fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(PLANT_SELECT)
        .single();
      if (error) throw error;
      return data as Plant;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["plants"] });
      queryClient.invalidateQueries({ queryKey: ["plant", vars.id] });
    },
  });
}

export function useDeletePlant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plants"] });
    },
  });
}

// Logs a watering action to care_logs and keeps the care_task in sync.
// If no watering task exists yet, one is created automatically.
export function useWaterPlant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plantId: string) => {
      const now = new Date().toISOString();

      // Fetch canonical_species_id for this plant.
      // Returns null pre-Phase 2.2 (no canonical identity assigned yet via shim);
      // returns the real value automatically once Phase 2.2 identity activation writes it.
      // No canonical routing is activated here — this is a passive read only.
      const { data: plantRow } = await supabase
        .from("plants")
        .select("canonical_species_id")
        .eq("id", plantId)
        .maybeSingle();
      const canonicalSpeciesId = plantRow?.canonical_species_id ?? null;

      // 1. Append to care_logs (immutable history)
      const { error: logError } = await supabase.from("care_logs").insert({
        plant_id: plantId,
        canonical_species_id: canonicalSpeciesId,
        task_type: "watering" as TaskType,
        completed_at: now,
      });
      if (logError) throw logError;

      // 2. Update care_tasks scheduling state
      const { data: existing } = await supabase
        .from("care_tasks")
        .select("id, frequency_days")
        .eq("plant_id", plantId)
        .eq("task_type", "watering")
        .maybeSingle();

      if (existing) {
        const nextDue = existing.frequency_days
          ? new Date(
              Date.now() + existing.frequency_days * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null;
        const { error } = await supabase
          .from("care_tasks")
          .update({ last_completed_at: now, next_due_at: nextDue })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("care_tasks").insert({
          plant_id: plantId,
          task_type: "watering" as TaskType,
          last_completed_at: now,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plants"] });
    },
  });
}
