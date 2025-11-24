"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useGuidesStore } from "@/store/guides";
import { TOAST_MESSAGES } from "@/lib/toastMessages";
import {
  createQuestionnaireUploadUrl,
  uploadToSAS,
  deleteQuestionnaire,
  listQuestionnaires,
  getQuestionnaire,
} from "@/lib/azure";
import { Trash2, Loader2, FileText, Plus, X, RefreshCw, Download } from "lucide-react";
import type { Guide } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { listAnalysis, deleteAnalysis } from "@/lib/azure";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InputMode = "questions" | "outline";

export function AdminGuidesSection() {
  const { guides, setGuides, deleteGuide } = useGuidesStore();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingGuides, setLoadingGuides] = useState(false);

  // Metadata inputs
  const [guideName, setGuideName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Direct input mode
  const [inputMode, setInputMode] = useState<InputMode>("questions");
  const [directQuestions, setDirectQuestions] = useState<string[]>([]);
  const [directPrompts, setDirectPrompts] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  // Azure questionnaire rows for table
  const [questionnaires, setQuestionnaires] = useState<Array<{ questionnaireId: string; originalFilename: string; uploadedAt: string; meta?: Record<string, any>; }>>([]);

  // View dialog state
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<string | null>(null);
  const [selectedQuestionnaireData, setSelectedQuestionnaireData] = useState<{ questions?: string[]; prompts?: string[]; text?: string } | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    loadGuidesFromAzure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGuidesFromAzure = async () => {
    setLoadingGuides(true);
    try {
      const q = await listQuestionnaires();
      setQuestionnaires(q);

      const loadedGuides: Guide[] = [];
      for (const questionnaire of q) {
        try {
          const questionnaireData = await getQuestionnaire(questionnaire.questionnaireId);
          const parsed = parseQuestionnaireData(questionnaireData);
          if (parsed.questions.length > 0 || parsed.prompts.length > 0) {
            const derivedName = questionnaire.originalFilename.replace(/\.[^/.]+$/, "");
            const name = (questionnaire.meta && typeof questionnaire.meta.guideName === "string" && questionnaire.meta.guideName.trim())
              ? questionnaire.meta.guideName.trim()
              : derivedName;
            loadedGuides.push({
              id: questionnaire.questionnaireId,
              name,
              questions: parsed.questions,
              prompts: parsed.prompts.length > 0 ? parsed.prompts : undefined,
              questionnaireId: questionnaire.questionnaireId,
            } as Guide);
          }
        } catch {
          // continue loading others
        }
      }
      setGuides(loadedGuides);
    } catch (error) {
      console.error("Error loading guides from Azure:", error);
      toast.error("Failed to load guides from Azure");
    } finally {
      setLoadingGuides(false);
    }
  };

  const parseQuestionnaireData = (data: any): { questions: string[]; prompts: string[] } => {
    // First check if API returned questions/prompts directly
    if (Array.isArray(data?.questions) || Array.isArray(data?.prompts)) {
      return {
        questions: Array.isArray(data.questions) ? data.questions : [],
        prompts: Array.isArray(data.prompts) ? data.prompts : [],
      };
    }

    // Try to parse as JSON from text field
    let jsonData: any = null;
    try {
      if (typeof data === "string") {
        jsonData = JSON.parse(data);
      } else if (data?.text) {
        // Try parsing text as JSON
        try {
          jsonData = JSON.parse(data.text);
        } catch {
          // Not JSON, treat as plain text
        }
      }
    } catch {
      // Not JSON, will parse as text
    }

    if (jsonData && (jsonData.questions || jsonData.prompts)) {
      return {
        questions: Array.isArray(jsonData.questions) ? jsonData.questions : [],
        prompts: Array.isArray(jsonData.prompts) ? jsonData.prompts : [],
      };
    }

    // Fallback: parse as plain text (legacy format)
    const text = data?.text || data || "";
    const lines = text.split("\n");
    const questions: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^\d+\.\s*(.+)$/);
      const question = match ? match[1] : trimmed;
      if (question) questions.push(question);
    }
    return { questions, prompts: [] };
  };

  const handleAddTag = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };
  const handleRemoveTag = (t: string) => setTags(tags.filter((x) => x !== t));
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAddTag(e);
  };

  const handleAddQuestion = () => {
    const trimmed = newQuestion.trim();
    if (trimmed && !directQuestions.includes(trimmed)) {
      setDirectQuestions([...directQuestions, trimmed]);
      setNewQuestion("");
    }
  };

  const handleRemoveQuestion = (index: number) => {
    setDirectQuestions(directQuestions.filter((_, i) => i !== index));
  };

  const handleAddPrompt = () => {
    const trimmed = newPrompt.trim();
    if (trimmed && !directPrompts.includes(trimmed)) {
      setDirectPrompts([...directPrompts, trimmed]);
      setNewPrompt("");
    }
  };

  const handleRemovePrompt = (index: number) => {
    setDirectPrompts(directPrompts.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsUploading(true);

    try {
      // Read file content
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(selectedFile);
      });

      // Parse JSON or text
      let jsonData: { questions?: string[]; prompts?: string[] };
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        // Not JSON, treat as plain text with questions
        const lines = fileContent.split("\n").map(l => l.trim()).filter(Boolean);
        jsonData = { questions: lines };
      }

      // Validate structure
      if (!jsonData.questions && !jsonData.prompts) {
        toast.error("File must contain 'questions' or 'prompts' array");
        setIsUploading(false);
        return;
      }

      // Create JSON blob for upload
      const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
      const jsonFile = new File([jsonBlob], selectedFile.name.replace(/\.[^/.]+$/, "") + ".json", { type: "application/json" });

      const meta: Record<string, any> = {
        guideName: guideName || selectedFile.name.replace(/\.[^/.]+$/, ""),
      };
      if (tags.length > 0) meta.tags = tags;

      const { uploadUrl } = await createQuestionnaireUploadUrl(
        jsonFile.name,
        jsonFile.size,
        "application/json",
        meta
      );
      await uploadToSAS(uploadUrl, jsonFile);

      toast.success(TOAST_MESSAGES.GUIDE_UPLOADED(meta.guideName));

      setGuideName("");
      setTags([]);
      setTagInput("");
      setFile(null);
      const inp = document.getElementById("guide-file") as HTMLInputElement | null;
      if (inp) inp.value = "";

      await new Promise((r) => setTimeout(r, 500));
      await loadGuidesFromAzure();
    } catch (error) {
      console.error("Azure upload error:", error);
      toast.error(`Failed to upload guide to Azure: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveDirectInput = async () => {
    if (inputMode === "questions" && directQuestions.length === 0) {
      toast.error("Please add at least one question");
      return;
    }
    if (inputMode === "outline" && directPrompts.length === 0) {
      toast.error("Please add at least one prompt");
      return;
    }

    setIsUploading(true);
    try {
      const jsonData: { questions?: string[]; prompts?: string[] } = {};
      if (inputMode === "questions") {
        jsonData.questions = directQuestions;
      } else {
        jsonData.prompts = directPrompts;
      }

      const fileName = guideName || `guide-${Date.now()}`;
      const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
      const jsonFile = new File([jsonBlob], fileName + ".json", { type: "application/json" });

      const meta: Record<string, any> = {
        guideName: guideName || fileName,
      };
      if (tags.length > 0) meta.tags = tags;

      const { uploadUrl } = await createQuestionnaireUploadUrl(
        jsonFile.name,
        jsonFile.size,
        "application/json",
        meta
      );
      await uploadToSAS(uploadUrl, jsonFile);

      toast.success(TOAST_MESSAGES.GUIDE_UPLOADED(meta.guideName));

      // Reset form
      setGuideName("");
      setTags([]);
      setTagInput("");
      setDirectQuestions([]);
      setDirectPrompts([]);
      setNewQuestion("");
      setNewPrompt("");
      setInputMode("questions");

      await new Promise((r) => setTimeout(r, 500));
      await loadGuidesFromAzure();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(`Failed to save guide: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (questionnaireId: string) => {
    const qRow = questionnaires.find((x) => x.questionnaireId === questionnaireId);
    if (!qRow) return;
    if (!confirm(`Delete questionnaire ${qRow.originalFilename}?`)) return;

    try {
      await deleteQuestionnaire(questionnaireId);
      toast.success("Guide deleted");
      await loadGuidesFromAzure();
    } catch (error) {
      toast.error("Failed to delete guide");
      console.error("Error deleting guide:", error);
    }
  };

  const handleDeleteAnalyses = async (questionnaireId: string) => {
    try {
      const items = await listAnalysis({ questionnaireId, latestOnly: false });
      if (!items || items.length === 0) {
        toast.info("No analyses found for this guide");
        return;
      }
      const confirmMsg = `Delete all analysis versions for this guide across ${new Set(items.map(i => i.audioId)).size} audio file(s)?`;
      if (!confirm(confirmMsg)) return;

      const uniquePairs = Array.from(new Set(items.map(i => `${i.audioId}|${questionnaireId}`)));
      let success = 0;
      for (const key of uniquePairs) {
        const [audioId] = key.split("|");
        try {
          await deleteAnalysis(audioId, questionnaireId, { allVersions: true });
          success++;
        } catch (e) {
          console.error("Failed to delete analyses for", audioId, questionnaireId, e);
        }
      }
      toast.success(`Deleted analyses for ${success} audio file(s)`);
    } catch (e) {
      console.error("listAnalysis error:", e);
      toast.error("Failed to delete analyses");
    }
  };

  const handleView = async (questionnaireId: string) => {
    setSelectedQuestionnaireId(questionnaireId);
    setSelectedQuestionnaireData(null);
    setViewOpen(true);
    setLoadingView(true);
    try {
      console.debug("Viewing questionnaire:", questionnaireId);
      const data = await getQuestionnaire(questionnaireId);
      const parsed = parseQuestionnaireData(data);
      setSelectedQuestionnaireData({
        questions: parsed.questions,
        prompts: parsed.prompts,
        text: data?.text || "",
      });
    } catch (error) {
      toast.error("Failed to load questionnaire");
      console.error("getQuestionnaire error:", error);
      setSelectedQuestionnaireData({ questions: [], prompts: [], text: "(Error loading questionnaire)" });
    } finally {
      setLoadingView(false);
    }
  };

  const handleRefreshView = async () => {
    if (!selectedQuestionnaireId) return;
    setLoadingView(true);
    try {
      const data = await getQuestionnaire(selectedQuestionnaireId);
      const parsed = parseQuestionnaireData(data);
      setSelectedQuestionnaireData({
        questions: parsed.questions,
        prompts: parsed.prompts,
        text: data?.text || "",
      });
      toast.success("Questionnaire refreshed");
    } catch (error) {
      toast.error("Failed to refresh questionnaire");
      console.error("getQuestionnaire error:", error);
    } finally {
      setLoadingView(false);
    }
  };

  const handleDownloadQuestionnaire = async (questionnaireId: string) => {
    try {
      const data = await getQuestionnaire(questionnaireId);
      const parsed = parseQuestionnaireData(data);
      
      // Create JSON structure
      const jsonData: { questions?: string[]; prompts?: string[] } = {};
      if (parsed.questions.length > 0) {
        jsonData.questions = parsed.questions;
      }
      if (parsed.prompts.length > 0) {
        jsonData.prompts = parsed.prompts;
      }
      
      const qRow = questionnaires.find(q => q.questionnaireId === questionnaireId);
      const fileName = qRow ? getDisplayName(questionnaireId) : `questionnaire-${questionnaireId.substring(0, 8)}`;
      
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Questionnaire downloaded");
    } catch (error) {
      toast.error("Failed to download questionnaire");
      console.error("Download error:", error);
    }
  };

  const getDisplayName = (qId: string) => {
    const qRow = questionnaires.find(q => q.questionnaireId === qId);
    const derived = qRow?.originalFilename ? qRow.originalFilename.replace(/\.[^/.]+$/, "") : "";
    const metaName = (qRow?.meta && typeof qRow.meta.guideName === "string" && qRow.meta.guideName.trim()) ? qRow.meta.guideName.trim() : "";
    return metaName || derived || "-";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Interview Guide (Admin)</CardTitle>
        <CardDescription>Upload a JSON file with questions and prompts, or input them directly</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="guide-name">Guide Name</Label>
            <Input
              id="guide-name"
              placeholder="Enter guide name (optional)"
              value={guideName}
              onChange={(e) => setGuideName(e.target.value)}
              disabled={isUploading}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                disabled={isUploading}
              />
              <Button type="button" variant="outline" onClick={handleAddTag} disabled={isUploading || !tagInput.trim()}>
                Add Tag
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-1">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="guide-file">Upload JSON File (.json) <span className="text-red-500">*</span></Label>
          <Input id="guide-file" type="file" accept=".json,.txt" onChange={handleFileUpload} disabled={isUploading} />
          {isUploading && <p className="text-sm text-muted-foreground">Uploading to Azure...</p>}
          <p className="text-xs text-muted-foreground">
            JSON format: {"{"} &quot;questions&quot;: [], &quot;prompts&quot;: [] {"}"}
          </p>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {/* Direct Input Section */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Direct Input</Label>
            <Select value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="questions">Questions Mode</SelectItem>
                <SelectItem value="outline">Outline/Prompts Mode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inputMode === "questions" ? (
            <div className="space-y-3">
              <Label>Questions</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddQuestion();
                    }
                  }}
                  disabled={isUploading}
                />
                <Button type="button" onClick={handleAddQuestion} disabled={isUploading || !newQuestion.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {directQuestions.length > 0 && (
                <div className="space-y-2">
                  {directQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                      <span className="flex-1 text-sm">{idx + 1}. {q}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQuestion(idx)}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Prompts/Outline</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a prompt"
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPrompt();
                    }
                  }}
                  disabled={isUploading}
                />
                <Button type="button" onClick={handleAddPrompt} disabled={isUploading || !newPrompt.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {directPrompts.length > 0 && (
                <div className="space-y-2">
                  {directPrompts.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                      <span className="flex-1 text-sm">{idx + 1}. {p}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePrompt(idx)}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleSaveDirectInput} disabled={isUploading || (inputMode === "questions" ? directQuestions.length === 0 : directPrompts.length === 0)}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Guide"
            )}
          </Button>
        </div>

        {/* Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Guides</h3>
            <Button variant="outline" size="sm" onClick={loadGuidesFromAzure} disabled={loadingGuides}>
              {loadingGuides ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Refreshing...</>) : ("Refresh from Azure")}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guide ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questionnaires.map((q) => (
                  <TableRow key={q.questionnaireId}>
                    <TableCell className="font-mono text-xs">{q.questionnaireId.substring(0, 8)}...</TableCell>
                    <TableCell className="max-w-[220px] truncate">{getDisplayName(q.questionnaireId)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{q.originalFilename}</TableCell>
                    <TableCell>{q.uploadedAt ? new Date(q.uploadedAt).toLocaleString() : "-"}</TableCell>
                    <TableCell>
                      {(q.meta?.tags && Array.isArray(q.meta.tags) && q.meta.tags.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {q.meta.tags.map((t: string, idx: number) => (
                            <Badge key={`${q.questionnaireId}-tag-${idx}`} variant="secondary">{t}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => handleView(q.questionnaireId)}>
                        <FileText className="h-4 w-4 mr-2" /> View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadQuestionnaire(q.questionnaireId)}
                      >
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAnalyses(q.questionnaireId)}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete Analyses
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(q.questionnaireId)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* View Dialog */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle>Questionnaire Details</DialogTitle>
                  <DialogDescription>
                    {selectedQuestionnaireId ? `ID: ${selectedQuestionnaireId}` : ""}
                  </DialogDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefreshView} disabled={loadingView || !selectedQuestionnaireId}>
                  {loadingView ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
            </DialogHeader>
            {loadingView ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedQuestionnaireData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="font-semibold">Name:</Label>
                    <p className="text-muted-foreground">{selectedQuestionnaireId ? getDisplayName(selectedQuestionnaireId) : "-"}</p>
                  </div>
                  <div>
                    <Label className="font-semibold">Filename:</Label>
                    <p className="text-muted-foreground">
                      {questionnaires.find(q => q.questionnaireId === selectedQuestionnaireId)?.originalFilename || "-"}
                    </p>
                  </div>
                </div>

                {selectedQuestionnaireData.prompts && selectedQuestionnaireData.prompts.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold">Prompts</Label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {selectedQuestionnaireData.prompts.map((prompt, idx) => (
                        <div key={idx} className="p-3 border rounded bg-muted">
                          <p className="text-sm">{idx + 1}. {prompt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedQuestionnaireData.questions && selectedQuestionnaireData.questions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold">Questions</Label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {selectedQuestionnaireData.questions.map((question, idx) => (
                        <div key={idx} className="p-3 border rounded">
                          <p className="text-sm font-medium">Q{idx + 1}: {question}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedQuestionnaireData.text && (
                  <div className="space-y-2">
                    <Label className="font-semibold">Raw Text</Label>
                    <Textarea readOnly value={selectedQuestionnaireData.text} className="min-h-[200px] bg-muted font-mono text-sm" />
                  </div>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
