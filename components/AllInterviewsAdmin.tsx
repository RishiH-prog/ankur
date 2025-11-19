"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInterviewsStore } from "@/store/interviews";
import { useGuidesStore } from "@/store/guides";
import { downloadSingleInterview, downloadBulkInterviews } from "@/lib/download";
import { toast } from "sonner";
import { TOAST_MESSAGES } from "@/lib/toastMessages";
import type { Interview } from "@/lib/types";
import { Download, Eye, ArrowUpDown, Trash2, GitBranch } from "lucide-react";
import { deleteRecord, deleteAnalysis } from "@/lib/azure";

type SortField = "guideName" | "interviewer" | "farmerName" | "date" | "village" | "status";
type SortOrder = "asc" | "desc";

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

const EMPTY_VALUE = "__empty__";

export function AllInterviewsAdmin({ 
  onView, 
  onViewVersions 
}: { 
  onView: (interview: Interview) => void;
  onViewVersions?: (audioId: string, questionnaireId: string) => void;
}) {
  const { interviews, loadInterviews, deleteInterview } = useInterviewsStore();
  const { guides, loadGuides } = useGuidesStore();

  const [filters, setFilters] = useState({
    guide: "all",
    interviewer: "all",
    village: "all",
    farmer: "",
    status: "all",
  });

  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    loadInterviews();
    loadGuides();
  }, [loadInterviews, loadGuides]);

  const filteredAndSorted = useMemo(() => {
    let filtered = [...interviews];

    if (filters.guide && filters.guide !== "all") {
      filtered = filtered.filter((i) => i.guideId === filters.guide);
    }
    if (filters.interviewer && filters.interviewer !== "all") {
      if (filters.interviewer === EMPTY_VALUE) {
        filtered = filtered.filter((i) => (i.interviewer || "").trim() === "");
      } else {
        filtered = filtered.filter((i) => i.interviewer === filters.interviewer);
      }
    }
    if (filters.village && filters.village !== "all") {
      if (filters.village === EMPTY_VALUE) {
        filtered = filtered.filter((i) => (i.village || "").trim() === "");
      } else {
        filtered = filtered.filter((i) => i.village === filters.village);
      }
    }
    if (filters.farmer) {
      filtered = filtered.filter((i) => i.farmerName.toLowerCase().includes(filters.farmer.toLowerCase()));
    }
    if (filters.status && filters.status !== "all") {
      filtered = filtered.filter((i) => i.status === filters.status);
    }

    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortField) {
        case "guideName":
          aVal = a.guideName; bVal = b.guideName; break;
        case "interviewer":
          aVal = a.interviewer; bVal = b.interviewer; break;
        case "farmerName":
          aVal = a.farmerName; bVal = b.farmerName; break;
        case "date":
          aVal = new Date(a.date).getTime(); bVal = new Date(b.date).getTime(); break;
        case "village":
          aVal = a.village; bVal = b.village; break;
        case "status":
          aVal = a.status; bVal = b.status; break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [interviews, filters, sortField, sortOrder]);

  const handleDownload = async (interview: Interview) => {
    try {
      await downloadSingleInterview(interview, guides);
      toast.success(TOAST_MESSAGES.INTERVIEW_DOWNLOADED);
    } catch (error) {
      console.error("Error downloading interview:", error);
      toast.error("Failed to download interview");
    }
  };

  const handleBulkDownload = async () => {
    if (filteredAndSorted.length === 0) {
      toast.error(TOAST_MESSAGES.NO_INTERVIEWS_TO_DOWNLOAD);
      return;
    }
    try {
      const filterInfo = Object.entries(filters)
        .filter(([_, value]) => value && value !== "all")
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ") || "None";
      toast.info(`Downloading ${filteredAndSorted.length} interview(s)...`);
      await downloadBulkInterviews(filteredAndSorted, filterInfo, guides);
      toast.success(TOAST_MESSAGES.DOWNLOADED_INTERVIEWS(filteredAndSorted.length));
    } catch (error) {
      console.error("Error downloading interviews:", error);
      toast.error("Failed to download interviews");
    }
  };

  const uniqueInterviewers = useMemo(() => {
    const set = new Set(interviews.map((i) => (i.interviewer || "").trim()));
    return Array.from(set).sort();
  }, [interviews]);

  const uniqueVillages = useMemo(() => {
    const set = new Set(interviews.map((i) => (i.village || "").trim()));
    return Array.from(set).sort();
  }, [interviews]);

  const interviewerOptions = useMemo(() => {
    return uniqueInterviewers
      .map((val) => ({ value: val === "" ? EMPTY_VALUE : val, label: val === "" ? "Unknown" : val }))
      .filter((opt) => opt.value !== undefined);
  }, [uniqueInterviewers]);

  const villageOptions = useMemo(() => {
    return uniqueVillages
      .map((val) => ({ value: val === "" ? EMPTY_VALUE : val, label: val === "" ? "Unknown" : val }))
      .filter((opt) => opt.value !== undefined);
  }, [uniqueVillages]);

  const handleDeleteInterview = async (interview: Interview) => {
    try {
      const ok = confirm(`Delete interview for ${interview.farmerName}? This removes Azure artifacts for this item.`);
      if (!ok) return;

      // Attempt to delete audio record if available
      if (interview.audioId) {
        try {
          await deleteRecord(interview.audioId);
        } catch (e) {
          console.warn("deleteRecord warning:", e);
          // Continue even if record missing
        }
      }

      // Attempt to delete all analysis versions for this pair
      if (interview.audioId && interview.guideId) {
        try {
          await deleteAnalysis(interview.audioId, interview.guideId, { allVersions: true });
        } catch (e) {
          console.warn("deleteAnalysis warning:", e);
        }
      }

      deleteInterview(interview.id);
      await loadInterviews();
      toast.success("Interview deleted");
    } catch (e) {
      console.error("Delete interview error:", e);
      toast.error("Failed to delete interview");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Interviews (Admin View)</CardTitle>
        <CardDescription>View, filter, sort, and download interviews</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Guide</Label>
            <Select value={filters.guide} onValueChange={(value) => setFilters({ ...filters, guide: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Guides" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Guides</SelectItem>
                {guides.map((guide) => (
                  <SelectItem key={guide.id} value={guide.id}>{guide.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Interviewer</Label>
            <Select value={filters.interviewer} onValueChange={(value) => setFilters({ ...filters, interviewer: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Interviewers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Interviewers</SelectItem>
                {interviewerOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Village</Label>
            <Select value={filters.village} onValueChange={(value) => setFilters({ ...filters, village: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Villages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Villages</SelectItem>
                {villageOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Farmer</Label>
            <Input placeholder="Search farmer..." value={filters.farmer} onChange={(e) => setFilters({ ...filters, farmer: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="AI-generated">AI-generated</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Farmer Name</TableHead>
                <TableHead>Guide Name</TableHead>
                <TableHead>Interviewer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No interviews match the current filters.</TableCell>
                </TableRow>
              ) : (
                filteredAndSorted.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell className="font-medium">{interview.farmerName}</TableCell>
                    <TableCell>{interview.guideName}</TableCell>
                    <TableCell>{interview.interviewer || "Unknown"}</TableCell>
                    <TableCell>{new Date(interview.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeClassName(interview.status)}>{interview.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onView(interview)}>
                          <Eye className="h-4 w-4 mr-2" />View
                        </Button>
                        {onViewVersions && interview.audioId && interview.guideId && (
                          <Button variant="ghost" size="sm" onClick={() => onViewVersions(interview.audioId!, interview.guideId)}>
                            <GitBranch className="h-4 w-4 mr-2" />Versions
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(interview)}>
                          <Download className="h-4 w-4 mr-2" />Download
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteInterview(interview)}>
                          <Trash2 className="h-4 w-4 mr-2" />Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Download All Button */}
        {filteredAndSorted.length > 0 && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleBulkDownload} variant="default">
              <Download className="h-4 w-4 mr-2" />
              Download All ({filteredAndSorted.length} interview{filteredAndSorted.length !== 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
