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
import { Trash2 } from "lucide-react";

export function GuidesAdmin() {
  const { guides, loadGuides, addGuide, deleteGuide } = useGuidesStore();
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    loadGuides();
  }, [loadGuides]);

  const parseQuestionsFromFile = (text: string): string[] => {
    const lines = text.split("\n");
    const questions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^\d+\.\s*(.+)$/);
      const question = match ? match[1] : trimmed;

      if (question) {
        questions.push(question);
      }
    }

    return questions;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const questions = parseQuestionsFromFile(text);

        if (questions.length === 0) {
          toast.error(TOAST_MESSAGES.NO_QUESTIONS_FOUND);
          return;
        }

        const guideName = selectedFile.name.replace(/\.[^/.]+$/, "");

        addGuide({
          name: guideName,
          questions,
        });

        toast.success(TOAST_MESSAGES.GUIDE_UPLOADED(guideName));
        setFile(null);
      } catch (error) {
        toast.error(TOAST_MESSAGES.ERROR_SAVING_GUIDE);
        console.error("Error parsing file:", error);
      }
    };

    reader.readAsText(selectedFile);
  };

  const handleDelete = (id: string) => {
    const guide = guides.find((g) => g.id === id);
    if (!guide) return;

    if (!confirm(`Are you sure you want to delete this guide?`)) {
      return;
    }

    try {
      deleteGuide(id);
      toast.success(TOAST_MESSAGES.GUIDE_DELETED);
    } catch (error) {
      toast.error(TOAST_MESSAGES.ERROR_DELETING_GUIDE);
      console.error("Error deleting guide:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Interview Guide (Admin)</CardTitle>
        <CardDescription>Upload a .txt file with questions (one per line, or numbered)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="guide-file">Guide File (.txt)</Label>
          <Input id="guide-file" type="file" accept=".txt" onChange={handleFileUpload} />
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold">Guides</h3>
          {guides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guides uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {guides.map((guide) => (
                <div key={guide.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium">{guide.name}</h4>
                      <Badge variant="secondary">{guide.questions.length} question{guide.questions.length !== 1 ? "s" : ""}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(guide.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
