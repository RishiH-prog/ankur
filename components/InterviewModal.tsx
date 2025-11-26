"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, GitBranch } from "lucide-react";
import { useInterviewsStore } from "@/store/interviews";
import { useGuidesStore } from "@/store/guides";
import { getAnalysis, getTranscript, getTranslation, createManualAnalysis, listAnalysis, getQuestionnaire } from "@/lib/azure";
import type { Interview, AnswerBlock } from "@/lib/types";
import { formatDate } from "@/lib/format";

interface InterviewModalProps {
  interview: Interview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin?: boolean; // If true, shows "Approve & Submit", otherwise shows "Save"
}

function getStatusBadgeClassName(status: Interview["status"]): string {
  if (status === "Draft") {
    return "bg-gray-500 text-white border-gray-500";
  }
  // Check if it's a human-edit model
  if (typeof status === "string" && status.toLowerCase().includes("human-edit")) {
    return "bg-green-600 text-white border-green-600";
  }
  // Default for AI models (gpt-5.1, etc.)
  return "bg-blue-600 text-white border-blue-600";
}

export function InterviewModal({ interview, open, onOpenChange, isAdmin = false }: InterviewModalProps) {
  const { updateInterview } = useInterviewsStore();
  const { guides } = useGuidesStore();
  const [answers, setAnswers] = useState<AnswerBlock[]>([]);
  const [prompts, setPrompts] = useState<Array<{ index: number; promptText: string; response: string }>>([]);
  const [hindiTranscript, setHindiTranscript] = useState<string>("");
  const [englishTranscript, setEnglishTranscript] = useState<string>("");
  const [versions, setVersions] = useState<Array<{ version: number; model: string; lastModified: string }>>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingVersionData, setLoadingVersionData] = useState(false);

  // Load versions when modal opens (only for main page, not admin)
  useEffect(() => {
    if (!open || !interview || isAdmin) return;
    if (!interview.audioId || !interview.guideId) return;

    const loadVersions = async () => {
      setLoadingVersions(true);
      try {
        const allAnalyses = await listAnalysis({ 
          audioId: interview.audioId, 
          questionnaireId: interview.guideId, 
          latestOnly: false 
        });
        const versionsWithModel = await Promise.all(
          allAnalyses.map(async (a) => {
            let model = "";
            try {
              const analysis = await getAnalysis(interview.audioId!, interview.guideId, { version: a.version });
              model = analysis?.model || analysis?.payload?.model || "";
            } catch (e) {
              // Ignore errors
            }
            return {
              version: a.version,
              model,
              lastModified: a.lastModified || new Date().toISOString(),
            };
          })
        );
        const sorted = versionsWithModel.sort((a, b) => b.version - a.version);
        setVersions(sorted);
        // Default to latest version
        if (sorted.length > 0) {
          setSelectedVersion(sorted[0].version);
        }
      } catch (error) {
        console.error("Error loading versions:", error);
      } finally {
        setLoadingVersions(false);
      }
    };

    loadVersions();
  }, [open, interview, isAdmin]);

  // Load interview data when modal opens or version changes
  useEffect(() => {
    if (!open || !interview) return;

    // Only set from interview.answers if admin (admin always uses latest)
    // For main page, we'll load from the selected version
    if (isAdmin) {
      setAnswers([...(interview.answers || [])]);
    }

    (async () => {
      if (interview.audioId) {
        try {
          const hin = await getTranscript(interview.audioId);
          if (hin.status === "ready" && hin.data) setHindiTranscript(hin.data);
        } catch {}
        try {
          const eng = await getTranslation(interview.audioId);
          if (eng.status === "ready" && eng.data) setEnglishTranscript(eng.data);
        } catch {}
      }
    })();

    (async () => {
      if (!interview.audioId || !interview.guideId) return;
      
      // For admin, always use latest. For main page, wait for selectedVersion to be set
      if (!isAdmin && selectedVersion === null) {
        // Wait for version to be selected
        return;
      }
      
      const versionToLoad = isAdmin ? undefined : selectedVersion;
      
      setLoadingVersionData(true);
      try {
        const analysis = await getAnalysis(
          interview.audioId, 
          interview.guideId, 
          versionToLoad ? { version: versionToLoad } : { latest: true }
        );
        const model: string | undefined = analysis?.model || analysis?.payload?.model;
        const result = analysis?.payload?.result || analysis?.result || {};
        const resultQs: Array<any> = result.questions || [];
        const resultPrompts: Array<any> = result.prompts || [];
        const guide = guides.find((g) => g.id === interview.guideId);
        
        // Set prompts
        if (Array.isArray(resultPrompts) && resultPrompts.length > 0) {
          setPrompts(resultPrompts.map((p: any) => ({
            index: p.index ?? 0,
            promptText: p.promptText || "",
            response: p.response || "",
          })));
        } else {
          setPrompts([]);
        }
        
        if (guide && Array.isArray(resultQs) && resultQs.length > 0) {
          // Get prompt texts to filter them out from questions
          const promptTexts = new Set(
            resultPrompts
              .filter((p: any) => p && p.promptText)
              .map((p: any) => p.promptText.trim().toLowerCase())
          );
          
          // Get prompt indices to exclude them from questions
          const promptIndices = new Set(
            resultPrompts
              .filter((p: any) => p && p.index !== undefined && p.index !== null)
              .map((p: any) => p.index)
          );
          
          // Filter out invalid entries (strings, null, undefined) and ensure we have objects
          // Also filter out items that are actually prompts (have promptText field or match prompt texts)
          const validQuestions = resultQs.filter((q: any) => {
            if (!q || typeof q !== "object" || Array.isArray(q)) return false;
            
            // Skip items that have promptText field (they're prompts, not questions)
            if (q.promptText) return false;
            
            // Skip items where questionText matches a prompt text
            if (q.questionText && promptTexts.has(q.questionText.trim().toLowerCase())) return false;
            
            // Skip items that have a response field but no answerSummary (these are likely prompts)
            if (q.response && !q.answerSummary && !q.questionText) return false;
            
            // Skip items that are prompts based on their index if they match prompt indices
            // Only if the item doesn't have valid question structure
            if (q.index !== undefined && promptIndices.has(q.index)) {
              // Double-check: if it has a response but no answerSummary, it's a prompt
              if (q.response && !q.answerSummary) return false;
            }
            
            // Only include items that have answerSummary or index (valid questions)
            return q.answerSummary !== undefined || (q.index !== undefined && q.questionText);
          });
          
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
          
          // Get guide prompts to exclude them from questions
          const guidePromptTexts = new Set(
            (guide.prompts || [])
              .filter((p: string) => p && typeof p === "string")
              .map((p: string) => p.trim().toLowerCase())
          );
          
          // Combine both prompt text sets for filtering (from analysis result and guide)
          const allPromptTexts = new Set([...promptTexts, ...guidePromptTexts]);
          
          // Filter guide questions to only valid ones
          // Also filter out any prompts that might be in the questions array
          const validGuideQuestions = guide.questions.filter((qText: string) => {
            if (!isValidQuestionText(qText)) return false;
            
            const normalizedQText = qText.trim().toLowerCase();
            
            // Direct match against all known prompts (from analysis or guide)
            if (allPromptTexts.has(normalizedQText)) return false;
            
            // Also check for substring matches (prompts might have slight variations)
            // But only exclude if it's a close match
            for (const promptText of allPromptTexts) {
              // If the question text is the same as or very similar to a prompt, exclude it
              if (normalizedQText === promptText) return false;
              
              // Check if one contains the other (for partial matches)
              const longer = normalizedQText.length > promptText.length ? normalizedQText : promptText;
              const shorter = normalizedQText.length > promptText.length ? promptText : normalizedQText;
              
              // If the shorter one is at least 80% of the longer one and is contained in it, likely the same
              if (shorter.length / longer.length >= 0.8 && longer.includes(shorter)) {
                // Exclude if they're very similar (likely same content)
                return false;
              }
            }
            
            return true;
          });
          
          // If guide has no valid questions, try to fetch fresh from Azure
          let questionsToUse = validGuideQuestions;
          if (validGuideQuestions.length === 0 && interview.guideId) {
            try {
              const questionnaire = await getQuestionnaire(interview.guideId);
              if (questionnaire?.questions && Array.isArray(questionnaire.questions)) {
                // Also get prompts from questionnaire if available
                const questionnairePrompts = new Set(
                  (questionnaire.prompts || [])
                    .filter((p: string) => p && typeof p === "string")
                    .map((p: string) => p.trim().toLowerCase())
                );
                const allQuestionnairePrompts = new Set([...allPromptTexts, ...questionnairePrompts]);
                
                questionsToUse = questionnaire.questions.filter((qText: string) => {
                  if (!isValidQuestionText(qText)) return false;
                  // Also filter out prompts from fetched questions
                  const normalizedQText = qText.trim().toLowerCase();
                  if (allQuestionnairePrompts.has(normalizedQText)) return false;
                  
                  // Check for similar prompts
                  for (const promptText of allQuestionnairePrompts) {
                    if (normalizedQText.includes(promptText) || promptText.includes(normalizedQText)) {
                      if (Math.abs(normalizedQText.length - promptText.length) < 10) {
                        return false;
                      }
                    }
                  }
                  
                  return true;
                });
              }
            } catch (e) {
              console.warn("Failed to fetch questionnaire for questions:", e);
            }
          }
          
          // Before mapping, filter out any prompts that might be in the questions list
          // We'll keep track of original indices to match with analysis results
          const filteredQuestionsWithIndices = questionsToUse
            .map((qText, originalIndex) => ({ qText, originalIndex }))
            .filter(({ qText }) => {
              // Double-check: if this question text matches any prompt, exclude it completely
              const normalizedQText = qText.trim().toLowerCase();
              
              // Check against all possible prompt sources
              if (allPromptTexts.has(normalizedQText)) return false;
              
              // Also check for substring matches
              for (const promptText of allPromptTexts) {
                if (normalizedQText === promptText) return false;
                const longer = normalizedQText.length > promptText.length ? normalizedQText : promptText;
                const shorter = normalizedQText.length > promptText.length ? promptText : normalizedQText;
                if (shorter.length / longer.length >= 0.8 && longer.includes(shorter)) {
                  return false;
                }
              }
              return true;
            });
          
          const mapped: AnswerBlock[] = filteredQuestionsWithIndices.map(({ qText, originalIndex }, i) => {
            // First try to find by original index match (to match with analysis results)
            let found = validQuestions.find((q: any) => q.index === originalIndex);
            
            // If not found by index, try by array position (but only if it's a valid object)
            // Make sure the found item is not a prompt
            if (!found && validQuestions[i]) {
              const candidate = validQuestions[i];
              // Double-check it's not a prompt before using it
              if (!candidate.promptText && !(candidate.response && !candidate.answerSummary && !candidate.questionText)) {
                found = candidate;
              }
            }
            
            // If still not found, use empty object
            if (!found) {
              found = {};
            }
            
            // Final safety check: if found item looks like a prompt, ignore it
            if (found && (found.promptText || (found.response && !found.answerSummary && !found.questionText))) {
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
              quotes: allQuotes && allQuotes.length > 0 ? allQuotes : undefined,
            } as AnswerBlock;
          });
          setAnswers(mapped);
          // Use model name as status (e.g., "gpt-5.1", "gpt-5.1-human-edit")
          const statusFromModel: Interview["status"] = model || "Draft";
          updateInterview(interview.id, { answers: mapped, status: statusFromModel });
        }
      } catch (error) {
        console.error("Error loading analysis:", error);
      } finally {
        setLoadingVersionData(false);
      }
    })();
  }, [open, interview, guides, updateInterview, isAdmin, selectedVersion]);

  if (!interview) return null;

  const handleAnswerChange = (index: number, field: keyof AnswerBlock, value: string) => {
    const updated = [...answers];
    updated[index] = { ...updated[index], [field]: value };
    setAnswers(updated);
  };

  const handlePromptResponseChange = (index: number, value: string) => {
    const updated = [...prompts];
    updated[index] = { ...updated[index], response: value };
    setPrompts(updated);
  };

  const handleSave = async () => {
    try {
      if (!interview.audioId || !interview.guideId) {
        toast.error("Missing audio/guide identifiers");
        return;
      }
      // Build result payload from current answers and prompts
      const resultPayload = {
        model: "gpt-5.1-human-edit",
        result: {
          audioId: interview.audioId,
          questionnaireId: interview.guideId,
          questions: answers.map((a, idx) => ({
            index: idx,
            questionText: a.question,
            answerFound: (a.answer || "").trim().length > 0,
            answerSummary: a.answer,
            verbatimQuotes: a.quotes && a.quotes.length > 0 
              ? a.quotes.map(q => ({ quote: q.quote, note: q.note }))
              : [],
          })),
          prompts: prompts.map((p) => ({
            index: p.index,
            promptText: p.promptText,
            response: p.response || "",
          })),
        },
      };
      await createManualAnalysis(interview.audioId, interview.guideId, resultPayload);

      // Update local state to reflect approval via model flag
      updateInterview(interview.id, { answers, status: "gpt-5.1-human-edit" });
      
      // Reload versions if on main page
      if (!isAdmin) {
        const allAnalyses = await listAnalysis({ 
          audioId: interview.audioId, 
          questionnaireId: interview.guideId, 
          latestOnly: false 
        });
        const versionsWithModel = await Promise.all(
          allAnalyses.map(async (a) => {
            let model = "";
            try {
              const analysis = await getAnalysis(interview.audioId!, interview.guideId, { version: a.version });
              model = analysis?.model || analysis?.payload?.model || "";
            } catch (e) {}
            return {
              version: a.version,
              model,
              lastModified: a.lastModified || new Date().toISOString(),
            };
          })
        );
        const sorted = versionsWithModel.sort((a, b) => b.version - a.version);
        setVersions(sorted);
        // Select the newly created version (should be the latest)
        if (sorted.length > 0) {
          setSelectedVersion(sorted[0].version);
        }
      }
      
      toast.success(isAdmin ? "Interview approved (human-edited)" : "Saved as new version");
      if (isAdmin) {
        onOpenChange(false);
      }
    } catch (error) {
      toast.error("Failed to save interview");
      console.error("save error:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interview Details</DialogTitle>
          <DialogDescription>View and edit interview information</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Version Control - Only show on main page */}
          {!isAdmin && interview.audioId && interview.guideId && (
            <div className="border-b pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-semibold">Version Control</Label>
                </div>
                {loadingVersions && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {versions.length > 0 ? (
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedVersion?.toString() || ""}
                    onValueChange={(value) => setSelectedVersion(parseInt(value))}
                    disabled={loadingVersionData}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={v.version} value={v.version.toString()}>
                          Version {v.version} {v.model && `(${v.model})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {loadingVersionData && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {selectedVersion && versions.find(v => v.version === selectedVersion)?.model && (
                      `Model: ${versions.find(v => v.version === selectedVersion)?.model}`
                    )}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No versions available</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Interviewer:</span> {interview.interviewer}
            </div>
            <div>
              <span className="font-medium">Date:</span> {formatDate(interview.date)}
            </div>
            <div>
              <span className="font-medium">Village/District:</span> {interview.village}
            </div>
            <div>
              <span className="font-medium">Farmer Name/ID:</span> {interview.farmerName}
            </div>
            <div>
              <span className="font-medium">Guide:</span> {interview.guideName}
            </div>
            <div>
              <span className="font-medium">Status:</span>{" "}
              <Badge className={getStatusBadgeClassName(interview.status)}>
                {interview.status}
              </Badge>
            </div>
          </div>

          {(hindiTranscript || englishTranscript) && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Transcripts</h3>
              {hindiTranscript && (
                <div className="space-y-2">
                  <Label>Hindi Transcript (हिंदी प्रतिलिपि)</Label>
                  <Textarea readOnly value={hindiTranscript} className="bg-muted min-h-[100px]" />
                </div>
              )}
              {englishTranscript && (
                <div className="space-y-2">
                  <Label>English Transcript</Label>
                  <Textarea readOnly value={englishTranscript} className="bg-muted min-h-[100px]" />
                </div>
              )}
            </div>
          )}

          {/* Prompts Section - Show at top */}
          {prompts.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Prompts & Responses</h3>
              <div className="space-y-3">
                {prompts.map((prompt, idx) => (
                  <div key={idx} className="space-y-2 border rounded p-3">
                    <Label className="text-sm font-medium">Prompt {prompt.index + 1}: {prompt.promptText}</Label>
                    <Textarea
                      value={prompt.response}
                      onChange={(e) => handlePromptResponseChange(idx, e.target.value)}
                      className="bg-background text-sm"
                      rows={15}
                      style={{ minHeight: '300px', height: 'auto' }}
                      placeholder="No response yet"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Questions & Answers</h3>
            {answers.length === 0 && <p className="text-sm text-muted-foreground">No answers available yet.</p>}
            {answers.map((answerBlock, index) => (
              <div key={index} className="space-y-3 border-b pb-4 last:border-b-0">
                <Label className="text-base font-medium">Question {index + 1}: {answerBlock.question}</Label>
                <div className="space-y-2">
                  <Label htmlFor={`answer-${index}`}>Answer</Label>
                  <Textarea id={`answer-${index}`} value={answerBlock.answer} onChange={(e) => handleAnswerChange(index, "answer", e.target.value)} rows={10} className="min-h-[200px]" />
                </div>
                {answerBlock.quotes && answerBlock.quotes.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quotes from transcript:</Label>
                    <div className="space-y-2">
                      {answerBlock.quotes.map((verbatimQuote, quoteIdx) => (
                        <div key={quoteIdx} className="bg-muted p-3 rounded space-y-1">
                          <p className="text-sm italic text-muted-foreground">&quot;{verbatimQuote.quote}&quot;</p>
                          {verbatimQuote.note && (
                            <p className="text-xs text-muted-foreground/80">Note: {verbatimQuote.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {answerBlock.reasoning && (
                  <div className="space-y-2">
                    <Label>Reasoning:</Label>
                    <p className="text-sm text-muted-foreground bg-muted p-2 rounded">{answerBlock.reasoning}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave}>{isAdmin ? "Approve & Submit" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
