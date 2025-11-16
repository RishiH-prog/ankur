import { create } from "zustand";
import { Guide } from "@/lib/types";

interface GuidesStore {
  guides: Guide[];
  loadGuides: () => void;
  setGuides: (guides: Guide[]) => void;
  addGuide: (guide: Omit<Guide, "id">) => void;
  updateGuide: (id: string, updates: Partial<Guide>) => void;
  deleteGuide: (id: string) => void;
  getActiveGuide: () => Guide | undefined;
}

export const useGuidesStore = create<GuidesStore>((set, get) => ({
  guides: [],

  loadGuides: () => {
    // TODO: Load from Azure - will be implemented later
    set({ guides: [] });
  },

  setGuides: (guides) => {
    set({ guides });
  },

  addGuide: (guideData) => {
    const newGuide: Guide = {
      ...guideData,
      id: guideData.questionnaireId || crypto.randomUUID(),
    } as Guide;

    const existingGuide = get().guides.find((g) => g.id === newGuide.id);
    if (existingGuide) {
      const guides = get().guides.map((g) =>
        g.id === newGuide.id ? { ...g, ...guideData } : g
      );
      set({ guides });
      return;
    }

    const guides = [...get().guides, newGuide];
    set({ guides });
  },

  updateGuide: (id, updates) => {
    const guides = get().guides.map((g) =>
      g.id === id ? { ...g, ...updates } : g
    );
    set({ guides });
  },

  deleteGuide: (id) => {
    const guides = get().guides.filter((g) => g.id !== id);
    set({ guides });
  },

  getActiveGuide: () => {
    return get().guides[0];
  },
}));
