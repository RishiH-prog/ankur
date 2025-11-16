"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TOAST_MESSAGES } from "@/lib/toastMessages";
import { createUploadUrl, uploadToSAS, pollForTranscripts } from "@/lib/azure";
import { Loader2, X } from "lucide-react";
import { formatFileSize } from "@/lib/format";

interface UploadAudioSectionProps {
  onUploadSuccess?: () => void;
}

export function UploadAudioSection({ onUploadSuccess }: UploadAudioSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [interviewer, setInterviewer] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [village, setVillage] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [audioId, setAudioId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleAddTag = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleAddTag(e);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select an audio file");
      return;
    }

    if (!interviewer.trim()) {
      toast.error("Please enter interviewer name");
      return;
    }

    if (!farmerName.trim()) {
      toast.error("Please enter farmer name");
      return;
    }

    if (!village.trim()) {
      toast.error("Please enter village/district");
      return;
    }

    if (!interviewDate) {
      toast.error("Please select interview date");
      return;
    }

    setIsUploading(true);

    try {
      // Check file size for large file warnings
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 50) {
        toast.info(TOAST_MESSAGES.LARGE_FILE_INFO_2);
      } else if (fileSizeMB > 20) {
        toast.info(TOAST_MESSAGES.LARGE_FILE_INFO_1);
      }

      // Step 1: Get SAS URL
      const { uploadUrl, audioId: uploadedAudioId } = await createUploadUrl(
        file.name,
        file.size,
        file.type,
        {
          farmerName: farmerName.trim(),
          village: village.trim(),
          interviewer: interviewer.trim(),
          interviewDate: interviewDate,
          tags: tags.length > 0 ? tags : undefined,
          notes: `Interviewer: ${interviewer.trim()}, Date: ${interviewDate}`,
        }
      );

      setAudioId(uploadedAudioId);

      // Step 2: Upload to SAS URL
      await uploadToSAS(uploadUrl, file);

      // Show upload successful notification and enable button
      toast.success("Upload successful!");
      setIsUploading(false); // Enable button after upload succeeds

      // Trigger background processing (no notifications)
      pollForTranscripts(
        uploadedAudioId,
        () => {
          // Silent progress updates
        },
        30,
        2000
      ).catch((error) => {
        // Silent error handling - just log it
        console.error("Background transcription error:", error);
      });

      // Notify parent component to refresh transcripts view
      onUploadSuccess?.();

      // Reset form
      setFile(null);
      setInterviewer("");
      setFarmerName("");
      setVillage("");
      setInterviewDate("");
      setTags([]);
      setTagInput("");
      
      // Reset file input
      const fileInput = document.getElementById("audio-file-upload") as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }

    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        TOAST_MESSAGES.PROCESSING_FAILED(
          error instanceof Error ? error.message : "Unknown error"
        )
      );
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Audio for Transcription</CardTitle>
        <CardDescription>
          Upload audio file to transcribe (Hindi) and translate (English). No interview will be created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="interviewer">
            Interviewer <span className="text-red-500">*</span>
          </Label>
          <Input
            id="interviewer"
            placeholder="Enter interviewer name"
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="farmer-name">
            Farmer Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="farmer-name"
            placeholder="Enter farmer name"
            value={farmerName}
            onChange={(e) => setFarmerName(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="village">
            Village / District <span className="text-red-500">*</span>
          </Label>
          <Input
            id="village"
            placeholder="Enter village or district"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="interview-date">
            Interview Date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="interview-date"
            type="date"
            value={interviewDate}
            onChange={(e) => setInterviewDate(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">
            Tags (Optional)
          </Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              placeholder="Enter a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleAddTag(e)}
              disabled={isUploading || !tagInput.trim()}
            >
              Add Tag
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
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
                    disabled={isUploading}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="audio-file-upload">
            Audio File <span className="text-red-500">*</span>
          </Label>
          <Input
            id="audio-file-upload"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          {file && (
            <div className="text-sm text-muted-foreground">
              Selected: {file.name} ({formatFileSize(file.size)})
            </div>
          )}
        </div>

        {audioId && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <strong>Audio ID:</strong> {audioId}
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={
            isUploading ||
            !file ||
            !interviewer.trim() ||
            !farmerName.trim() ||
            !village.trim() ||
            !interviewDate
          }
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            "Upload"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

