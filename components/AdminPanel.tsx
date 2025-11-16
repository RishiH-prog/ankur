"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
import { AdminGuidesSection } from "@/components/AdminGuidesSection";
import { AllInterviewsAdmin } from "@/components/AllInterviewsAdmin";
import { ViewTranscriptsSection } from "@/components/ViewTranscriptsSection";
import { InterviewModal } from "@/components/InterviewModal";
import { AnalysisVersionControl } from "@/components/AnalysisVersionControl";
import type { Interview } from "@/lib/types";

interface AdminPanelProps {
  isAuthenticated: boolean;
  onAuthenticate: (password: string) => boolean;
  onLogout: () => void;
}

export function AdminPanel({
  isAuthenticated,
  onAuthenticate,
  onLogout,
}: AdminPanelProps) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showAdminWindow, setShowAdminWindow] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [showVersionControl, setShowVersionControl] = useState(false);
  const [versionControlAudioId, setVersionControlAudioId] = useState<string>("");
  const [versionControlQuestionnaireId, setVersionControlQuestionnaireId] = useState<string>("");

  useEffect(() => {
    if (isAuthenticated && !showAdminWindow) {
      const t = setTimeout(() => setShowAdminWindow(true), 150);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated, showAdminWindow]);

  const handlePasswordSubmit = () => {
    const ok = onAuthenticate(password);
    if (ok) {
      setPassword("");
      setPasswordError(false);
      setShowPasswordDialog(false);
      setTimeout(() => toast.success("Admin access granted"), 100);
    } else {
      setPasswordError(true);
      toast.error("Incorrect password");
      setPassword("");
    }
  };

  const handleLogout = () => {
    setShowAdminWindow(false);
    onLogout();
  };

  const handleViewInterview = (interview: Interview) => {
    setSelectedInterview(interview);
    setInterviewModalOpen(true);
  };

  const handleViewVersions = (audioId: string, questionnaireId: string) => {
    setVersionControlAudioId(audioId);
    setVersionControlQuestionnaireId(questionnaireId);
    setShowVersionControl(true);
  };

  return (
    <>
      {/* Admin Button */}
      <div className="fixed top-4 left-4 z-50">
        {!isAuthenticated ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPasswordDialog(true)}
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            Admin
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAdminWindow(true)}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Unlock className="h-4 w-4" />
            Admin
          </Button>
        )}
      </div>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Access</DialogTitle>
            <DialogDescription>Enter password to access admin features</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
                placeholder="Enter admin password"
                autoFocus
              />
              {passwordError && <p className="text-sm text-red-500">Incorrect password</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowPasswordDialog(false); setPassword(""); setPasswordError(false); }}>Cancel</Button>
              <Button onClick={handlePasswordSubmit}>Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Window */}
      <Dialog
        open={!!(showAdminWindow && isAuthenticated)}
        onOpenChange={() => { /* prevent closing via X */ }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" hideCloseButton>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Admin Panel</DialogTitle>
                <DialogDescription>Manage guides, transcripts, and interviews</DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
            </div>
          </DialogHeader>

          <div className="space-y-8 mt-4">
            {/* Upload Interview Guide */}
            <section>
              <AdminGuidesSection />
            </section>

            {/* View Transcripts & Translations */}
            <section>
              <ViewTranscriptsSection isAdmin={true} />
            </section>

            {/* All Interviews */}
            <section>
              <AllInterviewsAdmin onView={handleViewInterview} onViewVersions={handleViewVersions} />
            </section>

            {/* Version Control */}
            {showVersionControl && versionControlAudioId && versionControlQuestionnaireId && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Analysis Versions</h3>
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowVersionControl(false);
                    setVersionControlAudioId("");
                    setVersionControlQuestionnaireId("");
                  }}>
                    Close
                  </Button>
                </div>
                <AnalysisVersionControl 
                  audioId={versionControlAudioId} 
                  questionnaireId={versionControlQuestionnaireId} 
                />
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Interview Modal */}
      <InterviewModal interview={selectedInterview} open={interviewModalOpen} onOpenChange={setInterviewModalOpen} isAdmin={true} />
    </>
  );
}

