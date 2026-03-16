import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Plant {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  isActive: boolean;
}

interface PlantState {
  plants: Plant[];
  currentPlant: Plant | null;
  setPlants: (plants: Plant[]) => void;
  setCurrentPlant: (plant: Plant | null) => void;
}

export const usePlantStore = create<PlantState>()(
  persist(
    (set) => ({
      plants: [],
      currentPlant: null,
      setPlants: (plants) => set({ plants }),
      setCurrentPlant: (plant) => set({ currentPlant: plant }),
    }),
    {
      name: 'plant-store',
      partialize: (state) => ({ currentPlant: state.currentPlant }),
    },
  ),
);

// Sync plant ID to window for protectedFetch header injection
usePlantStore.subscribe((state) => {
  (window as unknown as Record<string, unknown>).__currentPlantId = state.currentPlant?.id ?? null;
});
