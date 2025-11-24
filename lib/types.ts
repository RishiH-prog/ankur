export type Guide = {
  id: string;
  name: string;
  questions: string[];
  prompts?: string[]; // Optional prompts/outline items
  questionnaireId?: string; // Azure questionnaire ID
};

export type InterviewStatus = "Draft" | string; // Can be "Draft" or model name like "gpt-5.1", "gpt-5.1-human-edit", etc.

export type VerbatimQuote = {
  quote: string;
  note?: string;
};

export type AnswerBlock = {
  question: string;
  answer: string;
  quotes?: VerbatimQuote[]; // Array of all verbatim quotes with notes
  reasoning?: string;
};

export type Interview = {
  id: string;
  guideId: string;
  guideName: string;
  interviewer: string;
  date: string;
  village: string;
  farmerName: string;
  audioFile: string; // file name or blob URL
  status: InterviewStatus;
  answers: AnswerBlock[];
  hindiTranscript?: string;
  englishTranscript?: string;
  audioId?: string; // Azure audioId
  uploadUrl?: string; // SAS URL (temporary)
};

export type AzureUploadMeta = {
  farmerName: string;
  village: string;
  interviewer?: string;
  interviewDate?: string;
  surveyId?: string;
  tags?: string[];
  notes?: string;
};

export type AzureRecord = {
  audioId: string;
  originalFilename: string;
  audioBlobName: string;
  uploadedAt: string;
  meta: AzureUploadMeta;
  transcript?: {
    status: "pending" | "completed";
    location?: string;
  };
  translation?: {
    status: "pending" | "completed";
    location?: string;
  };
};

export type TranscriptResponse = {
  status: "pending" | "ready";
  data?: string;
};
