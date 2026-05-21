export interface Plant {
  id: string;
  user_id: string;
  name: string;
  species: string | null;
  description: string | null;
  watering_interval_days: number;
  last_watered_at: string | null;
  image_url: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlantInput {
  name: string;
  species?: string;
  description?: string;
  watering_interval_days: number;
  location?: string;
  image_url?: string;
}

export function getDaysUntilWatering(plant: Plant): number {
  if (!plant.last_watered_at) return 0;
  const lastWatered = new Date(plant.last_watered_at);
  const nextWatering = new Date(
    lastWatered.getTime() +
      plant.watering_interval_days * 24 * 60 * 60 * 1000,
  );
  const now = new Date();
  const diff = Math.ceil(
    (nextWatering.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(0, diff);
}

export function needsWatering(plant: Plant): boolean {
  return getDaysUntilWatering(plant) === 0;
}
