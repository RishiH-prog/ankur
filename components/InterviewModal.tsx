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
import { getAnalysis, getTranscript, getTranslation, createManualAnalysis, listAnalysis } from "@/lib/azure";
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
              lastModified: a.lastModified,
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
        const resultQs: Array<any> = analysis?.payload?.result?.questions || analysis?.result?.questions || [];
        const guide = guides.find((g) => g.id === interview.guideId);
        if (guide && Array.isArray(resultQs) && resultQs.length > 0) {
          const mapped: AnswerBlock[] = guide.questions.map((qText, i) => {
            const found = resultQs.find((q: any) => q.index === i) || resultQs[i] || {};
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

  const handleSave = async () => {
    try {
      if (!interview.audioId || !interview.guideId) {
        toast.error("Missing audio/guide identifiers");
        return;
      }
      // Build result payload from current answers
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
              lastModified: a.lastModified,
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

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Questions & Answers</h3>
            {answers.length === 0 && <p className="text-sm text-muted-foreground">No answers available yet.</p>}
            {answers.map((answerBlock, index) => (
              <div key={index} className="space-y-3 border-b pb-4 last:border-b-0">
                <Label className="text-base font-medium">Question {index + 1}: {answerBlock.question}</Label>
                <div className="space-y-2">
                  <Label htmlFor={`answer-${index}`}>Answer</Label>
                  <Textarea id={`answer-${index}`} value={answerBlock.answer} onChange={(e) => handleAnswerChange(index, "answer", e.target.value)} className="min-h-[80px]" />
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
