"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInterviewsStore } from "@/store/interviews";
import type { Interview } from "@/lib/types";
import { Pencil } from "lucide-react";

interface InterviewsTableProps {
  onEdit: (interview: Interview) => void;
}

function getStatusBadgeVariant(status: Interview["status"]): "default" | "secondary" | "outline" {
  if (status === "Draft") {
    return "outline";
  }
  return "default";
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

export function InterviewsTable({ onEdit }: InterviewsTableProps) {
  const { interviews, loadInterviews } = useInterviewsStore();
  const [localInterviews, setLocalInterviews] = useState<Interview[]>([]);

  useEffect(() => {
    loadInterviews();
  }, [loadInterviews]);

  useEffect(() => {
    setLocalInterviews(interviews);
  }, [interviews]);

  // Auto-refresh every 5 seconds by reloading from Azure
  useEffect(() => {
    const id = setInterval(() => {
      loadInterviews();
    }, 5000);
    return () => clearInterval(id);
  }, [loadInterviews]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Questionnaire</CardTitle>
        <CardDescription>View and edit questionnaire answers</CardDescription>
      </CardHeader>
      <CardContent>
        {localInterviews.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No interviews yet. Create one above!</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farmer Name</TableHead>
                  <TableHead>Guide Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localInterviews.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell className="font-medium">{interview.farmerName}</TableCell>
                    <TableCell>{interview.guideName}</TableCell>
                    <TableCell>{new Date(interview.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(interview.status)} className={getStatusBadgeClassName(interview.status)}>
                        {interview.status === "Draft" ? "Processing" : interview.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(interview)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Questionnaire
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
