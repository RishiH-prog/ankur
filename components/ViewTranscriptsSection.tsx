"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { listRecords, getTranscript, getTranslation, deleteRecord, updateRecordMetadata } from "@/lib/azure";
import type { AzureRecord, AzureUploadMeta } from "@/lib/types";
import { Loader2, RefreshCw, FileText, Languages, Trash2, Edit, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ViewTranscriptsSectionProps {
  refreshTrigger?: number;
  isAdmin?: boolean;
}

export function ViewTranscriptsSection({
  refreshTrigger,
  isAdmin = false,
}: ViewTranscriptsSectionProps) {
  const [records, setRecords] = useState<AzureRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AzureRecord | null>(null);
  const [hindiTranscript, setHindiTranscript] = useState<string | null>(null);
  const [englishTranscript, setEnglishTranscript] = useState<string | null>(null);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Partial<AzureUploadMeta>>({});
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await listRecords();
      setRecords(data);
    } catch (error) {
      console.error("Error loading records:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load audio records"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  // Auto-refresh when refreshTrigger changes (triggered by upload success)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadRecords();
    }
  }, [refreshTrigger]);

  // Periodic auto-refresh every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      // Avoid spamming if a manual load is in progress
      if (!loading) {
        loadRecords();
      }
    }, 10000);
    return () => clearInterval(id);
  }, [loading]);

  const handleViewRecord = async (record: AzureRecord) => {
    setSelectedRecord(record);
    setHindiTranscript(null);
    setEnglishTranscript(null);
    setLoadingTranscripts(true);

    try {
      // Try to load Hindi transcript (always try)
      try {
        const transcriptResp = await getTranscript(record.audioId);
        console.log("Transcript response:", transcriptResp);
        if (transcriptResp.status === "ready" && transcriptResp.data) {
          setHindiTranscript(transcriptResp.data);
        } else {
          console.log("Hindi transcript not ready yet:", transcriptResp.status);
        }
      } catch (error) {
        console.error("Error loading Hindi transcript:", error);
        if (record.transcript?.status === "completed") {
          toast.error(`Failed to load Hindi transcript: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      // Try to load English translation (always try)
      try {
        const translationResp = await getTranslation(record.audioId);
        console.log("Translation response:", translationResp);
        if (translationResp.status === "ready" && translationResp.data) {
          setEnglishTranscript(translationResp.data);
        } else {
          console.log("English translation not ready yet:", translationResp.status);
        }
      } catch (error) {
        console.error("Error loading English translation:", error);
        if (record.translation?.status === "completed") {
          toast.error(`Failed to load English translation: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    } catch (error) {
      console.error("Error loading transcripts:", error);
      toast.error("Failed to load transcripts");
    } finally {
      setLoadingTranscripts(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedRecord(null);
    setHindiTranscript(null);
    setEnglishTranscript(null);
    setShowEditMetadata(false);
    setEditingMeta({});
  };

  const handleOpenEditMetadata = (record: AzureRecord) => {
    setEditingMeta({ 
      ...record.meta,
      tags: record.meta.tags || []
    });
    setTagInput("");
    setShowEditMetadata(true);
  };

  const handleAddTag = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmedTag = tagInput.trim();
    const currentTags = editingMeta.tags || [];
    if (trimmedTag && !currentTags.includes(trimmedTag)) {
      setEditingMeta({ ...editingMeta, tags: [...currentTags, trimmedTag] });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = editingMeta.tags || [];
    const newTags = currentTags.filter((tag) => tag !== tagToRemove);
    setEditingMeta({ ...editingMeta, tags: newTags.length > 0 ? newTags : [] });
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleAddTag(e);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedRecord) return;

    setSavingMetadata(true);
    try {
      // Ensure tags is an empty array if no tags, not undefined
      const tagsToSave = editingMeta.tags && editingMeta.tags.length > 0 ? editingMeta.tags : [];
      const metaToSave = {
        ...editingMeta,
        tags: tagsToSave,
      };
      
      // If we're clearing tags (had tags before, now empty), we might need to ensure it's saved
      // Use overwrite: false for normal merge, but ensure tags array is explicitly set
      const updated = await updateRecordMetadata(selectedRecord.audioId, metaToSave, false);
      
      // Update the selected record and the records list
      setSelectedRecord(updated);
      setRecords(records.map(r => r.audioId === updated.audioId ? updated : r));
      
      toast.success("Metadata updated successfully");
      setShowEditMetadata(false);
      setTagInput("");
    } catch (error) {
      console.error("Error updating metadata:", error);
      toast.error(`Failed to update metadata: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleDeleteAudio = async (audioId: string) => {
    if (!confirm(`Are you sure you want to delete this audio record? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await deleteRecord(audioId);
      if (result.deleted.length > 0) {
        console.log("Deleted files:", result.deleted);
      }
      if (result.missing.length > 0) {
        console.log("Missing files (already deleted):", result.missing);
      }
      await loadRecords();
      if (selectedRecord?.audioId === audioId) {
        handleCloseModal();
      }
      toast.success(`Audio record deleted successfully. ${result.deleted.length} file(s) removed.`);
    } catch (error) {
      console.error("Error deleting audio:", error);
      toast.error(`Failed to delete audio: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return <Badge variant="outline">Pending</Badge>;
    if (status === "completed") return <Badge className="bg-green-600 text-white">Completed</Badge>;
    return <Badge variant="secondary">Processing</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>View Transcripts & Translations</CardTitle>
              <CardDescription>
                View Hindi transcripts, English translations, and metadata for uploaded audio files
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadRecords} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><RefreshCw className="mr-2 h-4 w-4" />Refresh</>)}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No audio files uploaded yet. Upload one above to get started.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audio ID</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Farmer</TableHead>
                    <TableHead>Village</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Hindi</TableHead>
                    <TableHead>English</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    {isAdmin && <TableHead className="text-right">Admin</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.audioId}>
                      <TableCell className="font-mono text-xs">
                        {record.audioId.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {record.originalFilename}
                      </TableCell>
                      <TableCell>{record.meta.farmerName || "-"}</TableCell>
                      <TableCell>{record.meta.village || "-"}</TableCell>
                      <TableCell>
                        {formatDate(record.uploadedAt)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record.transcript?.status)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record.translation?.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewRecord(record)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAudio(record.audioId)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedRecord && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle>Audio Details & Transcripts</DialogTitle>
                    <DialogDescription>
                      Audio ID: {selectedRecord.audioId}
                    </DialogDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditMetadata(selectedRecord)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Metadata
                  </Button>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="font-semibold">Filename:</Label>
                <p className="text-muted-foreground">{selectedRecord.originalFilename}</p>
              </div>
              <div>
                <Label className="font-semibold">Uploaded:</Label>
                <p className="text-muted-foreground">{formatDate(selectedRecord.uploadedAt)}</p>
              </div>
              <div>
                <Label className="font-semibold">Farmer Name:</Label>
                <p className="text-muted-foreground">
                  {selectedRecord.meta.farmerName || "-"}
                </p>
              </div>
              <div>
                <Label className="font-semibold">Village / District:</Label>
                <p className="text-muted-foreground">
                  {selectedRecord.meta.village || "-"}
                </p>
              </div>
              {selectedRecord.meta.surveyId && (
                <div>
                  <Label className="font-semibold">Survey ID:</Label>
                  <p className="text-muted-foreground">{selectedRecord.meta.surveyId}</p>
                </div>
              )}
              {selectedRecord.meta.tags && selectedRecord.meta.tags.length > 0 && (
                <div>
                  <Label className="font-semibold">Tags:</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedRecord.meta.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {selectedRecord.meta.notes && (
                <div className="col-span-2">
                  <Label className="font-semibold">Notes:</Label>
                  <p className="text-muted-foreground">{selectedRecord.meta.notes}</p>
                </div>
              )}
            </div>

            {/* Transcripts */}
            {loadingTranscripts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Hindi Transcript */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Label className="text-base font-semibold">
                      Hindi Transcript (हिंदी प्रतिलिपि)
                    </Label>
                    {getStatusBadge(selectedRecord.transcript?.status)}
                  </div>
                  {hindiTranscript ? (
                    <Textarea
                      readOnly
                      value={hindiTranscript}
                      className="bg-muted min-h-[150px] font-mono text-sm"
                    />
                  ) : selectedRecord.transcript?.status === "completed" ? (
                    <p className="text-sm text-muted-foreground">
                      Transcript is ready but could not be loaded. Try refreshing.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Transcript is still being processed...
                    </p>
                  )}
                </div>

                {/* English Translation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    <Label className="text-base font-semibold">
                      English Translation
                    </Label>
                    {getStatusBadge(selectedRecord.translation?.status)}
                  </div>
                  {englishTranscript ? (
                    <Textarea
                      readOnly
                      value={englishTranscript}
                      className="bg-muted min-h-[150px] font-mono text-sm"
                    />
                  ) : selectedRecord.translation?.status === "completed" ? (
                    <p className="text-sm text-muted-foreground">
                      Translation is ready but could not be loaded. Try refreshing.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Translation is still being processed...
                    </p>
                  )}
                </div>
              </>
            )}

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Metadata Dialog */}
      <Dialog open={showEditMetadata} onOpenChange={setShowEditMetadata}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
            <DialogDescription>
              Update metadata for audio ID: {selectedRecord?.audioId}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="farmerName">Farmer Name *</Label>
                <Input
                  id="farmerName"
                  value={editingMeta.farmerName || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, farmerName: e.target.value })}
                  placeholder="Enter farmer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="village">Village / District *</Label>
                <Input
                  id="village"
                  value={editingMeta.village || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, village: e.target.value })}
                  placeholder="Enter village or district"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interviewer">Interviewer</Label>
                <Input
                  id="interviewer"
                  value={editingMeta.interviewer || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, interviewer: e.target.value })}
                  placeholder="Enter interviewer name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interviewDate">Interview Date</Label>
                <Input
                  id="interviewDate"
                  type="date"
                  value={editingMeta.interviewDate || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, interviewDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="surveyId">Survey ID</Label>
                <Input
                  id="surveyId"
                  value={editingMeta.surveyId || ""}
                  onChange={(e) => setEditingMeta({ ...editingMeta, surveyId: e.target.value })}
                  placeholder="Enter survey ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    placeholder="Enter a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    disabled={savingMetadata}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => handleAddTag(e)}
                    disabled={savingMetadata || !tagInput.trim()}
                  >
                    Add Tag
                  </Button>
                </div>
                {editingMeta.tags && editingMeta.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editingMeta.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-destructive"
                          disabled={savingMetadata}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editingMeta.notes || ""}
                onChange={(e) => setEditingMeta({ ...editingMeta, notes: e.target.value })}
                placeholder="Enter any additional notes"
                className="min-h-[100px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditMetadata(false);
                setTagInput("");
              }}
              disabled={savingMetadata}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMetadata}
              disabled={savingMetadata || !editingMeta.farmerName || !editingMeta.village}
            >
              {savingMetadata ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

