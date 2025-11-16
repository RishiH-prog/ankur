import { create } from "zustand";
import { Interview } from "@/lib/types";
import { listRecords, listAnalysis, getAnalysis, getQuestionnaire } from "@/lib/azure";

interface InterviewsStore {
  interviews: Interview[];
  loadInterviews: () => Promise<void> | void;
  addInterview: (interview: Omit<Interview, "id">) => void;
  updateInterview: (id: string, updates: Partial<Interview>) => void;
  deleteInterview: (id: string) => void;
  getInterview: (id: string) => Interview | undefined;
  findByAudioAndGuide: (audioId: string, guideId: string) => Interview | undefined;
  upsertByAudioAndGuide: (data: Omit<Interview, "id">) => Interview;
}

export const useInterviewsStore = create<InterviewsStore>((set, get) => ({
  interviews: [],

  loadInterviews: async () => {
    try {
      // Get latest analyses only
      const analyses = await listAnalysis({ latestOnly: true });
      if (!analyses || analyses.length === 0) {
        set({ interviews: [] });
        return;
      }
      // Map audioId -> record for metadata
      const records = await listRecords();
      const recMap = new Map(records.map((r) => [r.audioId, r] as const));

      const out: Interview[] = [];
      for (const a of analyses) {
        const rec = recMap.get(a.audioId);
        const meta = rec?.meta || ({} as any);
        // Fetch analysis payload to get model name for status
        let model = "";
        try {
          const latest = await getAnalysis(a.audioId, a.questionnaireId, { latest: true });
          model = (latest?.model || latest?.payload?.model || "") as string;
        } catch {}
        // Use model name as status (e.g., "gpt-5.1", "gpt-5.1-human-edit")
        const status: Interview["status"] = model || "Draft";

        // Fetch questionnaire name from Azure API
        let guideName = "Unknown";
        try {
          const questionnaire = await getQuestionnaire(a.questionnaireId);
          if (questionnaire?.meta?.guideName && typeof questionnaire.meta.guideName === "string") {
            guideName = questionnaire.meta.guideName.trim();
          } else if (questionnaire?.originalFilename) {
            // Fallback to filename without extension
            guideName = questionnaire.originalFilename.replace(/\.[^/.]+$/, "");
          }
        } catch (e) {
          console.warn("Failed to fetch questionnaire name:", e);
        }

        out.push({
          id: crypto.randomUUID(),
          guideId: a.questionnaireId,
          guideName,
          interviewer: (meta.interviewer as string) || "",
          date: (meta.interviewDate as string) || rec?.uploadedAt || new Date().toISOString(),
          village: (meta.village as string) || "",
          farmerName: (meta.farmerName as string) || "",
          audioFile: rec?.originalFilename || "",
          status,
          answers: [],
          hindiTranscript: undefined,
          englishTranscript: undefined,
          audioId: a.audioId,
          uploadUrl: undefined,
        });
      }

      out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      set({ interviews: out });
    } catch (e) {
      console.error("loadInterviews error:", e);
      // keep existing
    }
  },

  addInterview: (interviewData) => {
    const newInterview: Interview = {
      ...interviewData,
      id: crypto.randomUUID(),
    };
    const interviews = [...get().interviews, newInterview];
    set({ interviews });
  },

  updateInterview: (id, updates) => {
    const interviews = get().interviews.map((i) => (i.id === id ? { ...i, ...updates } : i));
    set({ interviews });
  },

  deleteInterview: (id) => {
    const interviews = get().interviews.filter((i) => i.id !== id);
    set({ interviews });
  },

  getInterview: (id) => {
    return get().interviews.find((i) => i.id === id);
  },

  findByAudioAndGuide: (audioId, guideId) => {
    return get().interviews.find((i) => i.audioId === audioId && i.guideId === guideId);
  },

  upsertByAudioAndGuide: (data) => {
    const existing = get().interviews.find((i) => i.audioId === data.audioId && i.guideId === data.guideId);
    if (existing) {
      const updated: Interview = { ...existing, ...data, id: existing.id };
      const interviews = get().interviews.map((i) => (i.id === existing.id ? updated : i));
      set({ interviews });
      return updated;
    }
    const created: Interview = { ...data, id: crypto.randomUUID() };
    set({ interviews: [...get().interviews, created] });
    return created;
  },
}));
