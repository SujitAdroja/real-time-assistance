export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type SttStatus = "disconnected" | "connecting" | "ready" | "closed" | "error";
export type RecordingStatus = "idle" | "starting" | "recording" | "stopping";
export type SessionControlMessage =
  | { type: "session-start"; mimeType: string }
  | { type: "session-stop" };

export type CandidateContextInput = {
  resume: string;
  jobDescription: string;
};

export type CandidateContextStatus =
  | "empty"
  | "unsaved"
  | "saving"
  | "saved"
  | "error";

export type GeneratedAnswer = {
  questionId: string;
  question: string;
  model: string;
  content: string;
  status: "generating" | "complete" | "error" | "cancelled";
  error: string | null;
  timeToFirstTokenMs: number | null;
  totalMs: number | null;
  llmRequestLatencyMs: number | null;
  questionCompletedAt: number | null;
  llmRequestStartedAt: number | null;
  firstTokenAt: number | null;
  answerCompletedAt: number | null;
};

export type TranscriptSegment = {
  id: string;
  text: string;
  speechFinal: boolean;
};

export type QuestionCategory =
  | "technical"
  | "experience"
  | "behavioral"
  | "scenario"
  | "general";

export type QuestionClassification =
  | "INTERVIEW_QUESTION"
  | "SMALL_TALK"
  | "STATEMENT"
  | "INCOMPLETE"
  | "AMBIGUOUS";

export type DetectedQuestion = {
  id: string;
  text: string;
  category: QuestionCategory;
  detectedAt: number;
};

export type QuestionDetectionStatus = {
  classification: QuestionClassification;
  reason: string;
  shouldTriggerAnswer: boolean;
};
