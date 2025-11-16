"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAnalysis, getAnalysis } from "@/lib/azure";
import { Loader2, Eye, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface AnalysisVersionControlProps {
  audioId: string;
  questionnaireId: string;
}

interface AnalysisVersion {
  version: number;
  blobName: string;
  size: number;
  lastModified: string;
  model?: string;
  createdAt?: string;
}

export function AnalysisVersionControl({ audioId, questionnaireId }: AnalysisVersionControlProps) {
  const [versions, setVersions] = useState<AnalysisVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [versionDetails, setVersionDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioId, questionnaireId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      // Get all versions (not just latest)
      const allAnalyses = await listAnalysis({ audioId, questionnaireId, latestOnly: false });
      // Fetch model info for each version
      const versionsWithModel = await Promise.all(
        allAnalyses.map(async (a) => {
          let model = "";
          try {
            const analysis = await getAnalysis(audioId, questionnaireId, { version: a.version });
            model = analysis?.model || analysis?.payload?.model || "";
          } catch (e) {
            // Ignore errors for individual version fetches
          }
          return {
            version: a.version,
            blobName: a.blobName,
            size: a.size || 0,
            lastModified: a.lastModified || new Date().toISOString(),
            model,
          };
        })
      );
      // Sort by version number descending
      const sorted = versionsWithModel.sort((a, b) => b.version - a.version);
      setVersions(sorted);
    } catch (error) {
      console.error("Error loading versions:", error);
      toast.error("Failed to load analysis versions");
    } finally {
      setLoading(false);
    }
  };

  const handleViewVersion = async (version: number) => {
    setLoadingDetails(true);
    setSelectedVersion(version);
    try {
      const analysis = await getAnalysis(audioId, questionnaireId, { version });
      setVersionDetails(analysis);
    } catch (error) {
      console.error("Error loading version details:", error);
      toast.error("Failed to load version details");
      setVersionDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis Version Control</CardTitle>
        <CardDescription>
          View all versions for audioId: {audioId.substring(0, 8)}... and questionnaireId: {questionnaireId.substring(0, 8)}...
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No versions found</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow key={v.version}>
                      <TableCell className="font-medium">v{v.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {v.model || "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell>{(v.size / 1024).toFixed(2)} KB</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(v.lastModified)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewVersion(v.version)}
                          disabled={loadingDetails && selectedVersion === v.version}
                        >
                          {loadingDetails && selectedVersion === v.version ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Eye className="h-4 w-4 mr-2" />
                          )}
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {versionDetails && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">Version {selectedVersion} Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Model:</span>{" "}
                        <Badge variant="outline">
                          {versionDetails.model || versionDetails.payload?.model || "Unknown"}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Created At:</span>{" "}
                        {versionDetails.createdAt || versionDetails.payload?.createdAt
                          ? formatDate(versionDetails.createdAt || versionDetails.payload?.createdAt)
                          : "N/A"}
                      </div>
                    </div>
                    {versionDetails.payload?.result?.questions && (
                      <div className="space-y-2">
                        <h4 className="font-semibold">Questions ({versionDetails.payload.result.questions.length}):</h4>
                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                          {versionDetails.payload.result.questions.map((q: any, idx: number) => (
                            <div key={idx} className="border rounded p-3 text-sm">
                              <div className="font-medium mb-1">Q{idx + 1}: {q.questionText}</div>
                              <div className="text-muted-foreground">
                                Answer Found: {q.answerFound ? "Yes" : "No"}
                              </div>
                              {q.answerSummary && (
                                <div className="mt-2 text-sm">
                                  <span className="font-medium">Summary:</span> {q.answerSummary}
                                </div>
                              )}
                              {q.verbatimQuotes && q.verbatimQuotes.length > 0 && (
                                <div className="mt-2">
                                  <span className="font-medium">Quotes ({q.verbatimQuotes.length}):</span>
                                  <ul className="list-disc list-inside mt-1 space-y-1">
                                    {q.verbatimQuotes.map((quote: any, qIdx: number) => (
                                      <li key={qIdx} className="text-xs italic">
                                        &quot;{quote.quote}&quot;
                                        {quote.note && <span className="text-muted-foreground"> - {quote.note}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

