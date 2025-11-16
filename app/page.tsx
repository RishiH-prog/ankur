"use client";

import { useState, useEffect } from "react";
import { InterviewsTable } from "@/components/InterviewsTable";
import { InterviewModal } from "@/components/InterviewModal";
import { UploadAudioSection } from "@/components/UploadAudioSection";
import { ViewTranscriptsSection } from "@/components/ViewTranscriptsSection";
import { AdminPanel } from "@/components/AdminPanel";
import { UserGate } from "@/components/UserGate";
import { AnalyzeSection } from "@/components/AnalyzeSection";
import { useGuidesStore } from "@/store/guides";
import { useInterviewsStore } from "@/store/interviews";
import type { Interview } from "@/lib/types";

const ADMIN_PASSWORD = "saas";

export default function Home() {
  const { loadGuides } = useGuidesStore();
  const { loadInterviews } = useInterviewsStore();
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUserAuthed, setIsUserAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");

  useEffect(() => {
    loadGuides();
    loadInterviews();
  }, [loadGuides, loadInterviews]);

  const handleEditInterview = (interview: Interview) => {
    setSelectedInterview(interview);
    setModalOpen(true);
  };

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleAdminAuthenticate = (password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
  };

  if (!isUserAuthed) {
    return (
      <UserGate
        onSuccess={(name) => {
          setIsUserAuthed(true);
          setCurrentUser(name);
        }}
      />
    );
  }

  return (
    <>
      <AdminPanel isAuthenticated={isAdmin} onAuthenticate={handleAdminAuthenticate} onLogout={handleAdminLogout} />

      <main className="container mx-auto py-8 px-4 space-y-8">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold">Project Ankur — AI Farmer Interview Platform</h1>
          <p className="text-muted-foreground">Welcome{currentUser ? `, ${currentUser}` : ""}</p>
        </div>

        {/* Audio Upload & Processing Section */}
        <section>
          <UploadAudioSection onUploadSuccess={handleUploadSuccess} />
        </section>

        {/* View Transcripts & Translations Section */}
        <section>
          <ViewTranscriptsSection refreshTrigger={refreshTrigger} isAdmin={isAdmin} />
        </section>

        {/* Analyze Section (Main page) */}
        <section>
          <AnalyzeSection />
        </section>

        {/* Edit Interviews Section */}
        <section>
          <InterviewsTable onEdit={handleEditInterview} />
        </section>

        <InterviewModal interview={selectedInterview} open={modalOpen} onOpenChange={setModalOpen} />
      </main>
    </>
  );
}
