import { AzureUploadMeta, AzureRecord, TranscriptResponse } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_AZURE_BASE_URL || "";

if (!BASE_URL) {
  console.warn(
    "NEXT_PUBLIC_AZURE_BASE_URL is not set. Azure integration will not work."
  );
}

export interface CreateUploadUrlResponse {
  uploadUrl: string;
  audioId: string;
}

export interface ListRecordsResponse {
  records: AzureRecord[];
}

/**
 * Creates a SAS upload URL for direct client-side blob upload
 * @param filename Original filename
 * @param size File size in bytes
 * @param contentType MIME type
 * @param meta Metadata for the upload
 * @returns Upload URL and audioId
 */
export async function createUploadUrl(
  filename: string,
  size: number,
  contentType: string,
  meta: AzureUploadMeta
): Promise<CreateUploadUrlResponse> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/api/create_upload_url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        size,
        contentType,
        meta,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to create upload URL (${response.status}): ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function at ${BASE_URL} does not allow requests from ${typeof window !== "undefined" ? window.location.origin : "this origin"}. Please configure CORS on the Azure Function to allow your origin.`
      );
    }
    throw error;
  }
}

/**
 * Lists all records from Azure
 * @returns Array of all records sorted by upload time desc
 */
export async function listRecords(): Promise<AzureRecord[]> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/api/records`, {
      method: "GET",
    });

    // Some implementations may return 204 No Content when there are no records
    if (response.status === 204) {
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const msg = `Failed to list records: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
      throw new Error(msg);
    }

    // Try to parse JSON, with fallbacks
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (parseError) {
      // If body is empty or not JSON, treat as no records
      return [];
    }

    // Accept multiple shapes: array of records, or { records: [...] }
    if (Array.isArray(raw)) {
      return raw as AzureRecord[];
    }

    if (raw && typeof raw === "object" && (raw as any).records) {
      return ((raw as any).records as AzureRecord[]) || [];
    }

    // Unexpected shape - log and return empty list
    console.warn("listRecords(): Unexpected response shape", raw);
    return [];
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Gets transcript for a given audioId
 * @param audioId The audio ID
 * @returns Transcript response with status and optional data
 */
export async function getTranscript(
  audioId: string
): Promise<TranscriptResponse> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(
      `${BASE_URL}/api/records/${audioId}/transcript`,
      {
        method: "GET",
      }
    );

    if (response.status === 202) {
      return { status: "pending" };
    }

    if (!response.ok) {
      throw new Error(`Failed to get transcript: ${response.statusText}`);
    }

    const data = await response.json();
    // Extract text from transcript JSON (structure may vary)
    const text =
      typeof data === "string"
        ? data
        : data.text || data.transcript || JSON.stringify(data);

    return { status: "ready", data: text };
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Gets translation for a given audioId
 * @param audioId The audio ID
 * @returns Translation response with status and optional data
 */
export async function getTranslation(
  audioId: string
): Promise<TranscriptResponse> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(
      `${BASE_URL}/api/records/${audioId}/translation`,
      {
        method: "GET",
      }
    );

    if (response.status === 202) {
      return { status: "pending" };
    }

    if (!response.ok) {
      throw new Error(`Failed to get translation: ${response.statusText}`);
    }

    const data = await response.json();
    // Extract translatedTranscript from translation JSON
    let text: string;
    
    if (typeof data === "string") {
      // If it's a string, try to parse it
      try {
        const parsed = JSON.parse(data);
        text = parsed.translatedTranscript || parsed.text || parsed.translation || data;
      } catch {
        text = data;
      }
    } else if (data && typeof data === "object") {
      // Extract translatedTranscript field if it exists
      text = data.translatedTranscript || data.text || data.translation || JSON.stringify(data);
    } else {
      text = JSON.stringify(data);
    }

    return { status: "ready", data: text };
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Uploads a file directly to Azure Blob Storage using a SAS URL
 * @param uploadUrl The SAS URL from createUploadUrl
 * @param file The file to upload
 */
export async function uploadToSAS(
  uploadUrl: string,
  file: File
): Promise<void> {
  try {
    // Some browsers do not set file.type for .txt; set a sensible default
    let contentType = file.type;
    if (!contentType || contentType.trim() === "") {
      const name = (file as any).name as string | undefined;
      if (name && name.toLowerCase().endsWith(".txt")) {
        contentType = "text/plain";
      } else {
        contentType = "application/octet-stream";
      }
    }

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": contentType,
      },
      body: file,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to upload file to blob storage (${response.status}): ${errorText}`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: Azure Blob Storage does not allow uploads from ${typeof window !== "undefined" ? window.location.origin : "this origin"}. Please configure CORS on your Azure Storage Account to allow PUT requests from your origin.`
      );
    }
    throw error;
  }
}

/**
 * Creates a SAS upload URL for questionnaire file upload
 * @param filename Original filename
 * @param size File size in bytes
 * @param contentType MIME type
 * @param meta Optional metadata
 * @returns Upload URL and questionnaireId
 */
export interface CreateQuestionnaireUploadUrlResponse {
  uploadUrl: string;
  questionnaireId: string;
}

export async function createQuestionnaireUploadUrl(
  filename: string,
  size: number,
  contentType: string,
  meta?: Record<string, any>
): Promise<CreateQuestionnaireUploadUrlResponse> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/api/create_questionnaire_upload_url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        size,
        contentType,
        meta,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Failed to create questionnaire upload URL (${response.status}): ${errorText}`
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function at ${BASE_URL} does not allow requests from ${typeof window !== "undefined" ? window.location.origin : "this origin"}. Please configure CORS on the Azure Function to allow your origin.`
      );
    }
    throw error;
  }
}

/**
 * Lists all questionnaires
 * @param limit Optional limit on number of records
 * @returns Array of questionnaire records
 */
export interface QuestionnaireRecord {
  questionnaireId: string;
  originalFilename: string;
  uploadedAt: string;
  meta?: Record<string, any>;
}

export interface ListQuestionnairesResponse {
  questionnaires: QuestionnaireRecord[];
}

export async function listQuestionnaires(
  limit?: number
): Promise<QuestionnaireRecord[]> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const url = limit
      ? `${BASE_URL}/api/questionnaires?limit=${limit}`
      : `${BASE_URL}/api/questionnaires`;
    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to list questionnaires: ${response.statusText}`);
    }

    const data: ListQuestionnairesResponse = await response.json();
    return data.questionnaires || [];
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Gets a questionnaire record and its text content
 * @param questionnaireId The questionnaire ID
 * @returns Questionnaire record with text content
 */
export interface GetQuestionnaireResponse extends QuestionnaireRecord {
  text: string;
}

export async function getQuestionnaire(
  questionnaireId: string
): Promise<GetQuestionnaireResponse> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const url = `${BASE_URL}/api/questionnaires/${questionnaireId}`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("getQuestionnaire not ok:", response.status, response.statusText, errText);
      throw new Error(`Failed to get questionnaire: ${response.status} ${response.statusText}${errText ? ` - ${errText}` : ""}`);
    }

    const ct = response.headers.get("content-type") || "";
    console.debug("getQuestionnaire content-type:", ct);

    if (ct.includes("application/json")) {
      const data: any = await response.json();
      console.debug("getQuestionnaire json keys:", Object.keys(data || {}));

      // Prefer explicit questionsText field per backend response
      let text: string = "";
      if (typeof data?.questionsText === "string") {
        // Normalize CRLF -> LF and add blank lines between questions for readability
        const normalized = data.questionsText.replace(/\r\n/g, "\n").trim();
        text = normalized.split("\n").join("\n\n");
      } else {
        // Attempt to resolve text from multiple likely fields
        text =
          data?.text ??
          data?.content ??
          data?.fileText ??
          data?.raw ??
          data?.body ??
          "";

        // If API returns a URL to the text blob, follow it
        const possibleUrl: string | undefined =
          data?.textUrl || data?.contentUrl || data?.blobUrl || data?.fileUrl || data?.record?.questionnaireBlobUrl;
        if (!text && possibleUrl && typeof possibleUrl === "string") {
          try {
            const blobResp = await fetch(possibleUrl);
            if (blobResp.ok) {
              const fetched = await blobResp.text();
              const normalized = fetched.replace(/\r\n/g, "\n").trim();
              text = normalized.split("\n").join("\n\n");
            } else {
              console.warn("getQuestionnaire blob fetch failed:", blobResp.status, blobResp.statusText);
            }
          } catch (e) {
            console.warn("getQuestionnaire blob fetch error:", e);
          }
        }

        // Final fallback: stringify unknown structure
        if (!text && data) {
          try {
            text = JSON.stringify(data);
          } catch {
            text = "";
          }
        }
      }

      return {
        questionnaireId: data?.record?.questionnaireId || data?.questionnaireId || questionnaireId,
        originalFilename: data?.record?.originalFilename || data?.originalFilename || "",
        uploadedAt: data?.record?.uploadedAt || data?.uploadedAt || "",
        meta: data?.record?.meta || data?.meta || undefined,
        text: text || "",
      };
    }

    // Fallback: non-JSON (assume plain text)
    const textBodyRaw = await response.text();
    const normalized = textBodyRaw.replace(/\r\n/g, "\n").trim();
    const spaced = normalized.split("\n").join("\n\n");
    console.debug("getQuestionnaire text length:", spaced?.length || 0);
    return {
      questionnaireId,
      originalFilename: "",
      uploadedAt: "",
      text: spaced,
    } as GetQuestionnaireResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Deletes a questionnaire and its record
 * @param questionnaireId The questionnaire ID to delete
 * @returns Object with list of deleted and missing files
 */
export async function deleteQuestionnaire(questionnaireId: string): Promise<{
  deleted: string[];
  missing: string[];
}> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/api/questionnaires/${questionnaireId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Failed to delete questionnaire (${response.status}): ${errorText}`
      );
    }

    const result = await response.json();
    return {
      deleted: result.deleted || [],
      missing: result.missing || [],
    };
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Deletes an audio record and all associated files
 * @param audioId The audio ID to delete
 * @returns Object with list of deleted and missing files
 */
export async function deleteRecord(audioId: string): Promise<{
  deleted: string[];
  missing: string[];
}> {
  if (!BASE_URL) {
    throw new Error(
      "Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file."
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/api/records/${audioId}`, {
      method: "DELETE",
    });

    // Treat 404 as already missing; return a synthetic response instead of throwing
    if (response.status === 404) {
      const text = await response.text().catch(() => "");
      console.warn(`deleteRecord: 404 for ${audioId} - treating as missing. Body: ${text}`);
      return { deleted: [], missing: [audioId] };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to delete record (${response.status}): ${errorText}`);
    }

    // Response may be empty or non-JSON
    let result: any = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    return {
      deleted: result.deleted || [],
      missing: result.missing || [],
    };
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `CORS error: The Azure Function does not allow requests from this origin. Please configure CORS on the Azure Function.`
      );
    }
    throw error;
  }
}

/**
 * Polls for transcript and translation to be ready
 * @param audioId The audio ID
 * @param onProgress Optional callback for progress updates
 * @param maxAttempts Maximum polling attempts (default: 30)
 * @param intervalMs Polling interval in ms (default: 2000)
 * @returns Object with transcript and translation text when ready
 */
export async function pollForTranscripts(
  audioId: string,
  onProgress?: (message: string) => void,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{ hindiTranscript?: string; englishTranscript?: string }> {
  let attempts = 0;
  let hindiTranscript: string | undefined;
  let englishTranscript: string | undefined;

  while (attempts < maxAttempts) {
    attempts++;

    // Try to get transcript
    if (!hindiTranscript) {
      try {
        const transcriptResp = await getTranscript(audioId);
        if (transcriptResp.status === "ready" && transcriptResp.data) {
          hindiTranscript = transcriptResp.data;
          onProgress?.("Hindi transcript ready");
        }
      } catch (error) {
        // Continue polling
      }
    }

    // Try to get translation
    if (!englishTranscript) {
      try {
        const translationResp = await getTranslation(audioId);
        if (translationResp.status === "ready" && translationResp.data) {
          englishTranscript = translationResp.data;
          onProgress?.("English translation ready");
        }
      } catch (error) {
        // Continue polling
      }
    }

    // If both are ready, return
    if (hindiTranscript && englishTranscript) {
      return { hindiTranscript, englishTranscript };
    }

    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Return what we have (may be partial)
  return { hindiTranscript, englishTranscript };
}

export interface AnalysisListItem {
  audioId: string;
  questionnaireId: string;
  version: number;
  blobName: string;
  size?: number;
  lastModified?: string;
}

export interface ListAnalysisResponse {
  analysis: AnalysisListItem[];
}

export async function listAnalysis(params?: { audioId?: string; questionnaireId?: string; latestOnly?: boolean }): Promise<AnalysisListItem[]> {
  if (!BASE_URL) {
    throw new Error("Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file.");
  }
  try {
    const qs = new URLSearchParams();
    if (params?.audioId) qs.set("audioId", params.audioId);
    if (params?.questionnaireId) qs.set("questionnaireId", params.questionnaireId);
    if (params?.latestOnly) qs.set("latestOnly", "true");
    const url = `${BASE_URL}/api/analysis${qs.toString() ? `?${qs.toString()}` : ""}`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Failed to list analysis: ${resp.status} ${resp.statusText}${t ? ` - ${t}` : ""}`);
    }
    const data: any = await resp.json().catch(() => ({}));
    return (data?.analysis as AnalysisListItem[]) || [];
  } catch (e) {
    if (e instanceof TypeError && e.message === "Failed to fetch") {
      throw new Error(`CORS error: The Azure Function does not allow requests from this origin. Please configure CORS.`);
    }
    throw e;
  }
}

export async function getAnalysis(audioId: string, questionnaireId: string, opts?: { version?: number; latest?: boolean }): Promise<any> {
  if (!BASE_URL) {
    throw new Error("Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file.");
  }
  try {
    const qs = new URLSearchParams();
    if (opts?.version != null) qs.set("version", String(opts.version));
    if (opts?.latest) qs.set("latest", "true");
    const url = `${BASE_URL}/api/analysis/${audioId}/${questionnaireId}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Failed to get analysis: ${resp.status} ${resp.statusText}${t ? ` - ${t}` : ""}`);
    }
    return await resp.json();
  } catch (e) {
    if (e instanceof TypeError && e.message === "Failed to fetch") {
      throw new Error(`CORS error: The Azure Function does not allow requests from this origin. Please configure CORS.`);
    }
    throw e;
  }
}

export async function runAnalysis(audioId: string, questionnaireId: string): Promise<any> {
  if (!BASE_URL) {
    throw new Error("Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file.");
  }
  try {
    const resp = await fetch(`${BASE_URL}/api/analyze/${audioId}/${questionnaireId}`, { method: "POST" });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Failed to run analysis: ${resp.status} ${resp.statusText}${t ? ` - ${t}` : ""}`);
    }
    return await resp.json();
  } catch (e) {
    if (e instanceof TypeError && e.message === "Failed to fetch") {
      throw new Error(`CORS error: The Azure Function does not allow requests from this origin. Please configure CORS.`);
    }
    throw e;
  }
}

export async function createManualAnalysis(audioId: string, questionnaireId: string, payload: any): Promise<any> {
  if (!BASE_URL) {
    throw new Error("Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file.");
  }
  try {
    const resp = await fetch(`${BASE_URL}/api/analysis/${audioId}/${questionnaireId}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Failed to create manual analysis: ${resp.status} ${resp.statusText}${t ? ` - ${t}` : ""}`);
    }
    return await resp.json();
  } catch (e) {
    if (e instanceof TypeError && e.message === "Failed to fetch") {
      throw new Error(`CORS error: The Azure Function does not allow requests from this origin. Please configure CORS.`);
    }
    throw e;
  }
}

export async function deleteAnalysis(audioId: string, questionnaireId: string, opts?: { version?: number; allVersions?: boolean }): Promise<any> {
  if (!BASE_URL) {
    throw new Error("Azure base URL is not configured. Please set NEXT_PUBLIC_AZURE_BASE_URL in your .env.local file.");
  }
  try {
    const qs = new URLSearchParams();
    if (opts?.version != null) qs.set("version", String(opts.version));
    if (opts?.allVersions) qs.set("allVersions", "true");
    const url = `${BASE_URL}/api/analysis/${audioId}/${questionnaireId}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const resp = await fetch(url, { method: "DELETE" });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Failed to delete analysis: ${resp.status} ${resp.statusText}${t ? ` - ${t}` : ""}`);
    }
    return await resp.json();
  } catch (e) {
    if (e instanceof TypeError && e.message === "Failed to fetch") {
      throw new Error(`CORS error: The Azure Function does not allow requests from this origin. Please configure CORS.`);
    }
    throw e;
  }
}
