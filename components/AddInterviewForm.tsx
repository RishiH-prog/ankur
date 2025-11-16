"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useGuidesStore } from "@/store/guides";
import { useInterviewsStore } from "@/store/interviews";
import { TOAST_MESSAGES } from "@/lib/toastMessages";
import { createUploadUrl, uploadToSAS, pollForTranscripts } from "@/lib/azure";
import { generatePlaceholderAnswers } from "@/lib/placeholders";
import { Loader2 } from "lucide-react";
import type { InterviewStatus } from "@/lib/types";

const interviewSchema = z.object({
  guideId: z.string().min(1, "Please select a guide"),
  interviewer: z.string().min(1, "Interviewer name is required"),
  date: z.string().min(1, "Date is required"),
  village: z.string().min(1, "Village/District is required"),
  farmerName: z.string().min(1, "Farmer ID/Name is required"),
  audioFile: z.custom<FileList | undefined>().optional(),
});

type InterviewFormData = z.infer<typeof interviewSchema>;

export function AddInterviewForm() {
  const { guides } = useGuidesStore();
  const { addInterview } = useInterviewsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableGuides = guides;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<InterviewFormData>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      guideId: "",
      interviewer: "",
      date: "",
      village: "",
      farmerName: "",
    },
  });

  const audioFile = watch("audioFile");
  const selectedGuideId = watch("guideId");

  const onSubmit = async (data: InterviewFormData) => {
    const selectedGuide = guides.find((g) => g.id === data.guideId);
    if (!selectedGuide) {
      toast.error(TOAST_MESSAGES.GUIDE_NOT_FOUND);
      return;
    }

    setIsSubmitting(true);

    try {
      const audioFileObj = data.audioFile?.[0];
      let hindiTranscript: string | undefined;
      let englishTranscript: string | undefined;
      let audioId: string | undefined;
      let status: InterviewStatus = "Draft";

      // If audio file is provided, upload and transcribe
      if (audioFileObj) {
        try {
          // Check file size for large file warnings
          const fileSizeMB = audioFileObj.size / (1024 * 1024);
          if (fileSizeMB > 50) {
            toast.info(TOAST_MESSAGES.LARGE_FILE_INFO_2);
          } else if (fileSizeMB > 20) {
            toast.info(TOAST_MESSAGES.LARGE_FILE_INFO_1);
          }

          toast.info(TOAST_MESSAGES.TRANSCRIBING_AUDIO);

          // Step A: Get SAS URL
          const { uploadUrl, audioId: uploadedAudioId } = await createUploadUrl(
            audioFileObj.name,
            audioFileObj.size,
            audioFileObj.type,
            {
              farmerName: data.farmerName,
              village: data.village,
            }
          );

          audioId = uploadedAudioId;

          // Step B: Upload to SAS URL
          await uploadToSAS(uploadUrl, audioFileObj);

          // Poll for transcripts
          toast.info(TOAST_MESSAGES.TRANSCRIPTION_COMPLETE);

          const transcripts = await pollForTranscripts(
            audioId,
            (message) => {
              // Progress updates
            },
            30,
            2000
          );

          hindiTranscript = transcripts.hindiTranscript;
          englishTranscript = transcripts.englishTranscript;

          toast.success(TOAST_MESSAGES.ANSWERS_EXTRACTED);
          status = "AI-generated";
        } catch (error) {
          console.error("Upload/transcription error:", error);
          toast.error(
            TOAST_MESSAGES.PROCESSING_FAILED(
              error instanceof Error ? error.message : "Unknown error"
            )
          );
          // Continue with placeholder data
          toast.info(TOAST_MESSAGES.NO_AUDIO_FILE);
        }
      } else {
        toast.info(TOAST_MESSAGES.NO_AUDIO_FILE);
      }

      // Generate placeholder answers
      const answers = generatePlaceholderAnswers(
        selectedGuide.questions,
        englishTranscript
      );

      // Create interview
      addInterview({
        guideId: selectedGuide.id,
        guideName: selectedGuide.name,
        interviewer: data.interviewer,
        date: data.date,
        village: data.village,
        farmerName: data.farmerName,
        audioFile: audioFileObj ? audioFileObj.name : "",
        status,
        answers,
        hindiTranscript,
        englishTranscript,
        audioId,
      });

      toast.success(TOAST_MESSAGES.INTERVIEW_CREATED);
      reset();
    } catch (error) {
      console.error("Error creating interview:", error);
      toast.error(TOAST_MESSAGES.ERROR_SAVING_INTERVIEW);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Interview</CardTitle>
        <CardDescription>Create a new interview record</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guideId">Guide</Label>
            <Select
              value={selectedGuideId || ""}
              onValueChange={(value) => {
                if (value !== "no-guides") {
                  setValue("guideId", value, { shouldValidate: true });
                }
              }}
            >
              <SelectTrigger id="guideId">
                <SelectValue placeholder="-- Select a guide --" />
              </SelectTrigger>
              <SelectContent>
                {availableGuides.length === 0 ? (
                  <SelectItem value="no-guides" disabled>
                    No guides available
                  </SelectItem>
                ) : (
                  availableGuides.map((guide) => (
                    <SelectItem key={guide.id} value={guide.id}>
                      {guide.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.guideId && (
              <p className="text-sm text-red-500">{errors.guideId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="interviewer">
              Interviewer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="interviewer"
              {...register("interviewer")}
              placeholder="Enter interviewer name"
            />
            {errors.interviewer && (
              <p className="text-sm text-red-500">{errors.interviewer.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">
              Date <span className="text-red-500">*</span>
            </Label>
            <Input id="date" type="date" {...register("date")} />
            {errors.date && (
              <p className="text-sm text-red-500">{errors.date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="village">
              Village / District <span className="text-red-500">*</span>
            </Label>
            <Input
              id="village"
              {...register("village")}
              placeholder="Enter village or district"
            />
            {errors.village && (
              <p className="text-sm text-red-500">{errors.village.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="farmerName">
              Farmer ID / Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="farmerName"
              {...register("farmerName")}
              placeholder="Enter farmer ID or name"
            />
            {errors.farmerName && (
              <p className="text-sm text-red-500">{errors.farmerName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="audioFile">
              Audio File
            </Label>
            <Input
              id="audioFile"
              type="file"
              accept="audio/*"
              {...register("audioFile")}
            />
            {audioFile && audioFile[0] && (
              <p className="text-sm text-muted-foreground">
                Selected: {audioFile[0].name}
              </p>
            )}
            {errors.audioFile && (
              <p className="text-sm text-red-500">{errors.audioFile.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : (
              "Create Interview"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
