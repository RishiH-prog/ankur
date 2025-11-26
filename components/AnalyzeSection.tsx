"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGuidesStore } from "@/store/guides";
import { useInterviewsStore } from "@/store/interviews";
import { listRecords, getTranslation, runAnalysis, getAnalysis, listQuestionnaires, getQuestionnaire } from "@/lib/azure";
import type { AzureRecord, Guide, AnswerBlock, Interview } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function AnalyzeSection() {
  const { guides, setGuides } = useGuidesStore();
  const { upsertByAudioAndGuide, updateInterview } = useInterviewsStore();
  const [selectedGuideId, setSelectedGuideId] = useState<string>("");
  const [selectedTranslationId, setSelectedTranslationId] = useState<string>("");
  const [translations, setTranslations] = useState<AzureRecord[]>([]);
  const [loadingTranslations, setLoadingTranslations] = useState(false);
  const [loadingGuides, setLoadingGuides] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    loadAvailableTranslations();
    if (guides.length === 0) {
      loadGuidesFromAzure();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAvailableTranslations = async () => {
    setLoadingTranslations(true);
    try {
      const records = await listRecords();
      const completedTranslations = records.filter(
        (record) => record.translation?.status === "completed"
      );
      setTranslations(completedTranslations);
    } catch (error) {
      console.error("Error loading translations:", error);
      toast.error("Failed to load available translations");
    } finally {
      setLoadingTranslations(false);
    }
  };

  const loadGuidesFromAzure = async () => {
    setLoadingGuides(true);
    try {
      const questionnaires = await listQuestionnaires();
      const loaded: Guide[] = [];
      for (const q of questionnaires) {
        try {
          const qData = await getQuestionnaire(q.questionnaireId);
          const text = qData?.text || "";
          const questions = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (questions.length > 0) {
            const derived = q.originalFilename.replace(/\.[^/.]+$/, "");
            const name = (q.meta && typeof q.meta.guideName === "string" && q.meta.guideName.trim())
              ? q.meta.guideName.trim()
              : derived;
            loaded.push({ id: q.questionnaireId, name, questions, questionnaireId: q.questionnaireId } as Guide);
          }
        } catch (e) {
          // continue loading others
        }
      }
      setGuides(loaded);
    } catch (e) {
      console.error("Error loading guides:", e);
      toast.error("Failed to load guides from Azure");
    } finally {
      setLoadingGuides(false);
    }
  };

  const selectedGuide = guides.find((g) => g.id === selectedGuideId);
  const selectedTranslation = translations.find((t) => t.audioId === selectedTranslationId);

  const handleAnalyze = async () => {
    if (!selectedGuideId || !selectedTranslationId) {
      toast.error("Please select both a guide and a translation");
      return;
    }
    if (!selectedGuide) {
      toast.error("Selected guide not found");
      return;
    }
    if (!selectedTranslation) {
      toast.error("Selected translation not found");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResults([]);
    try {
      try {
        const translationResp = await getTranslation(selectedTranslation.audioId);
        if (!(translationResp.status === "ready" && translationResp.data)) {
          toast.error("Translation is not ready yet");
          setIsAnalyzing(false);
          return;
        }
      } catch {}

      await runAnalysis(selectedTranslation.audioId, selectedGuideId);
      const latest = await getAnalysis(selectedTranslation.audioId, selectedGuideId, { latest: true });
      const questions: Array<any> = latest?.payload?.result?.questions || latest?.result?.questions || [];

      let answers: AnswerBlock[] = [];
      if (Array.isArray(questions) && questions.length > 0) {
        // Filter out invalid entries (strings, null, undefined) and ensure we have objects
        const validQuestions = questions.filter((q: any) => 
          q && typeof q === "object" && !Array.isArray(q) && (q.answerSummary !== undefined || q.index !== undefined)
        );
        
        // Filter out invalid question text from guide (like "{", "questions": [", etc.)
        const isValidQuestionText = (text: string): boolean => {
          if (!text || typeof text !== "string") return false;
          const trimmed = text.trim();
          // Reject JSON structure elements
          return !(
            trimmed === "{" ||
            trimmed === "}" ||
            trimmed === "[" ||
            trimmed === "]" ||
            trimmed === "]," ||
            trimmed === "}," ||
            trimmed === '"questions": [' ||
            trimmed === '"prompts": [' ||
            trimmed.startsWith('"questions":') ||
            trimmed.startsWith('"prompts":') ||
            /^\s*[\[\]{}]\s*,?\s*$/.test(trimmed) ||
            /^\s*[\[\]{}]\s*$/.test(trimmed)
          );
        };
        
        // Filter guide questions to only valid ones
        const validGuideQuestions = selectedGuide.questions.filter(isValidQuestionText);
        
        answers = validGuideQuestions.map((qText, i) => {
          // First try to find by index match
          let found = validQuestions.find((q: any) => q.index === i);
          
          // If not found by index, try by array position (but only if it's a valid object)
          if (!found && validQuestions[i]) {
            found = validQuestions[i];
          }
          
          // If still not found, use empty object
          if (!found) {
            found = {};
          }
          
          // Extract all verbatim quotes with notes
          const allQuotes = Array.isArray(found?.verbatimQuotes) 
            ? found.verbatimQuotes.map((vq: any) => ({
                quote: vq.quote || "",
                note: vq.note || undefined,
              }))
            : undefined;
          return { 
            question: qText, 
            answer: found?.answerSummary || "", 
            quotes: allQuotes && allQuotes.length > 0 ? allQuotes : undefined 
          } as AnswerBlock;
        });
      }

      // Optionally: insert into interviews after analysis
      // This section intentionally removed to avoid pre-creating entries before analysis

      toast.success("Analysis completed successfully");
    } catch (error) {
      console.error("Error running analysis:", error);
      toast.error(error instanceof Error ? error.message : "Failed to run analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Analyze
        </CardTitle>
        <CardDescription>
          Select an interview guide and translation to run AI analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="guide-select">Interview Guide</Label>
          <Select value={selectedGuideId} onValueChange={setSelectedGuideId}>
            <SelectTrigger id="guide-select" onClick={loadGuidesFromAzure}>
              <SelectValue placeholder={loadingGuides ? "Refreshing guides..." : "Select an interview guide"} />
            </SelectTrigger>
            <SelectContent>
              {loadingGuides ? (
                <SelectItem value="loading-guides" disabled>
                  Loading guides...
                </SelectItem>
              ) : guides.length === 0 ? (
                <SelectItem value="no-guides" disabled>
                  No guides available
                </SelectItem>
              ) : (
                guides.map((guide) => (
                  <SelectItem key={guide.id} value={guide.id}>
                    {guide.name} ({guide.questions.length} questions)
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="translation-select">Translation</Label>
          <Select
            value={selectedTranslationId}
            onValueChange={setSelectedTranslationId}
            disabled={loadingTranslations}
            onOpenChange={(open) => {
              if (open) loadAvailableTranslations();
            }}
          >
            <SelectTrigger id="translation-select">
              <SelectValue placeholder="Select a translation" />
            </SelectTrigger>
            <SelectContent>
              {loadingTranslations ? (
                <SelectItem value="loading" disabled>
                  Loading translations...
                </SelectItem>
              ) : translations.length === 0 ? (
                <SelectItem value="no-translations" disabled>
                  No completed translations available
                </SelectItem>
              ) : (
                translations.map((translation) => (
                  <SelectItem key={translation.audioId} value={translation.audioId}>
                    {translation.meta.farmerName || "Unknown"} - {translation.meta.village || "Unknown"} ({translation.originalFilename})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleAnalyze} disabled={!selectedGuideId || !selectedTranslationId || isAnalyzing} className="w-full">
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Run Analysis
            </>
          )}
        </Button>

        {/* Results rendering intentionally removed; the Edit Interviews table reflects the outcome */}
      </CardContent>
    </Card>
  );
}

