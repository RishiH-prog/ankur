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
import { Trash2, Loader2, FileText } from "lucide-react";
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

export function AdminGuidesSection() {
  const { guides, setGuides, deleteGuide } = useGuidesStore();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingGuides, setLoadingGuides] = useState(false);

  // Metadata inputs
  const [guideName, setGuideName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Azure questionnaire rows for table
  const [questionnaires, setQuestionnaires] = useState<Array<{ questionnaireId: string; originalFilename: string; uploadedAt: string; meta?: Record<string, any>; }>>([]);

  // View dialog state
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<string | null>(null);
  const [selectedQuestionnaireText, setSelectedQuestionnaireText] = useState<string>("");
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    loadGuidesFromAzure();
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
          const questions = parseQuestionsFromFile(questionnaireData.text);
          if (questions.length > 0) {
            const derivedName = questionnaire.originalFilename.replace(/\.[^/.]+$/, "");
            const name = (questionnaire.meta && typeof questionnaire.meta.guideName === "string" && questionnaire.meta.guideName.trim())
              ? questionnaire.meta.guideName.trim()
              : derivedName;
            loadedGuides.push({
              id: questionnaire.questionnaireId,
              name,
              questions,
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

  const parseQuestionsFromFile = (text: string): string[] => {
    const lines = text.split("\n");
    const questions: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^\d+\.\s*(.+)$/);
      const question = match ? match[1] : trimmed;
      if (question) questions.push(question);
    }
    return questions;
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsUploading(true);

    try {
      const meta: Record<string, any> = {
        guideName: guideName || selectedFile.name.replace(/\.[^/.]+$/, ""),
      };
      if (tags.length > 0) meta.tags = tags;

      const { uploadUrl } = await createQuestionnaireUploadUrl(
        selectedFile.name,
        selectedFile.size,
        selectedFile.type || "text/plain",
        meta
      );
      await uploadToSAS(uploadUrl, selectedFile);

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
    setSelectedQuestionnaireText("");
    setViewOpen(true);
    setLoadingView(true);
    try {
      console.debug("Viewing questionnaire:", questionnaireId);
      const data = await getQuestionnaire(questionnaireId);
      const txt = (data as any)?.text ?? "";
      if (!txt) {
        console.warn("Questionnaire returned no text field", data);
      } else {
        console.debug("Questionnaire text length:", txt.length);
      }
      setSelectedQuestionnaireText(txt || "(No text returned)");
    } catch (error) {
      toast.error("Failed to load questionnaire");
      console.error("getQuestionnaire error:", error);
      setSelectedQuestionnaireText("(Error loading questionnaire)");
    } finally {
      setLoadingView(false);
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
        <CardDescription>Upload a .txt file with questions and metadata</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metadata + File */}
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
        <div className="space-y-2">
          <Label htmlFor="guide-file">Guide File (.txt) <span className="text-red-500">*</span></Label>
          <Input id="guide-file" type="file" accept=".txt" onChange={handleFileUpload} disabled={isUploading} />
          {isUploading && <p className="text-sm text-muted-foreground">Uploading to Azure...</p>}
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
              <DialogTitle>Questionnaire Details</DialogTitle>
              <DialogDescription>
                {selectedQuestionnaireId ? `ID: ${selectedQuestionnaireId}` : ""}
              </DialogDescription>
            </DialogHeader>
            {loadingView ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
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
                <Label className="font-semibold">Questionnaire Text</Label>
                <Textarea readOnly value={selectedQuestionnaireText} className="min-h-[300px] bg-muted font-mono text-sm" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

