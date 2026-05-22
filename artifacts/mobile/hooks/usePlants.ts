import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Plant, PlantInput, TaskType } from "@/types/plant";
import { useAuth } from "@/contexts/AuthContext";

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
      const { data, error } = await supabase
        .from("plants")
        .insert({ ...input, user_id: user!.id })
        .select(PLANT_SELECT)
        .single();
      if (error) throw error;
      return data as Plant;
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
      const { data, error } = await supabase
        .from("plants")
        .update({ ...input, updated_at: new Date().toISOString() })
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

      // 1. Append to care_logs (immutable history)
      const { error: logError } = await supabase
        .from("care_logs")
        .insert({
          plant_id: plantId,
          task_type: "watering" as TaskType,
          completed_at: now,
        });
      if (logError) throw logError;

      // 2. Update care_tasks (scheduling state)
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
