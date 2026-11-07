import type {
  QuestionCategory,
  QuestionClassification,
} from "@/types/interview";

export type ServerMessage =
  | { type: "stt:connecting" }
  | { type: "stt:ready" }
  | { type: "stt:closed" }
  | { type: "stt:error"; message: string }
  | { type: "transcript:interim"; text: string }
  | { type: "transcript:final"; id: string; text: string; speechFinal: boolean }
  | {
      type: "question:detected";
      id: string;
      text: string;
      category: QuestionCategory;
      detectedAt: number;
    }
  | {
      type: "question:status";
      classification: QuestionClassification;
      reason: string;
      shouldTriggerAnswer: boolean;
    }
  | {
      type: "context:saved";
      hasResume: boolean;
      hasJobDescription: boolean;
      resumeCharacters: number;
      jobDescriptionCharacters: number;
    }
  | { type: "context:error"; code: string; message: string }
  | { type: "answer:start"; questionId: string; question: string; model: string; startedAt: number }
  | { type: "answer:token"; questionId: string; token: string }
  | {
      type: "answer:complete";
      questionId: string;
      totalMs: number;
      timeToFirstTokenMs: number | null;
      llmRequestLatencyMs?: number | null;
      questionCompletedAt?: number | null;
      llmRequestStartedAt?: number | null;
      firstTokenAt?: number | null;
      answerCompletedAt?: number | null;
    }
  | { type: "answer:error"; questionId: string; code: string; message: string };

const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
  "technical",
  "experience",
  "behavioral",
  "scenario",
  "general",
];
const QUESTION_CLASSIFICATIONS: readonly QuestionClassification[] = [
  "INTERVIEW_QUESTION",
  "SMALL_TALK",
  "STATEMENT",
  "INCOMPLETE",
  "AMBIGUOUS",
];

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

export function isServerMessage(message: unknown): message is ServerMessage {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return false;
  }

  if (message.type === "stt:connecting" || message.type === "stt:ready" || message.type === "stt:closed") {
    return true;
  }

  if (
    message.type === "stt:error" &&
    "message" in message &&
    typeof message.message === "string"
  ) {
    return true;
  }

  if (
    message.type === "transcript:interim" &&
    "text" in message &&
    typeof message.text === "string"
  ) {
    return true;
  }

  if (
    message.type === "transcript:final" &&
    "id" in message &&
    typeof message.id === "string" &&
    "text" in message &&
    typeof message.text === "string" &&
    "speechFinal" in message &&
    typeof message.speechFinal === "boolean"
  ) {
    return true;
  }

  if (
    message.type === "question:detected" &&
    "id" in message &&
    typeof message.id === "string" &&
    "text" in message &&
    typeof message.text === "string" &&
    "category" in message &&
    isOneOf(message.category, QUESTION_CATEGORIES) &&
    "detectedAt" in message &&
    typeof message.detectedAt === "number"
  ) {
    return true;
  }

  if (
    message.type === "question:status" &&
    "classification" in message &&
    isOneOf(message.classification, QUESTION_CLASSIFICATIONS) &&
    "reason" in message &&
    typeof message.reason === "string" &&
    "shouldTriggerAnswer" in message &&
    typeof message.shouldTriggerAnswer === "boolean"
  ) {
    return true;
  }

  if (
    message.type === "context:saved" &&
    "hasResume" in message &&
    typeof message.hasResume === "boolean" &&
    "hasJobDescription" in message &&
    typeof message.hasJobDescription === "boolean" &&
    "resumeCharacters" in message &&
    typeof message.resumeCharacters === "number" &&
    "jobDescriptionCharacters" in message &&
    typeof message.jobDescriptionCharacters === "number"
  ) {
    return true;
  }

  if (
    message.type === "context:error" &&
    "code" in message &&
    typeof message.code === "string" &&
    "message" in message &&
    typeof message.message === "string"
  ) {
    return true;
  }

  if (
    message.type === "answer:start" &&
    "questionId" in message &&
    typeof message.questionId === "string" &&
    "question" in message &&
    typeof message.question === "string" &&
    "model" in message &&
    typeof message.model === "string" &&
    "startedAt" in message &&
    typeof message.startedAt === "number"
  ) {
    return true;
  }

  if (
    message.type === "answer:token" &&
    "questionId" in message &&
    typeof message.questionId === "string" &&
    "token" in message &&
    typeof message.token === "string"
  ) {
    return true;
  }

  if (
    message.type === "answer:complete" &&
    "questionId" in message &&
    typeof message.questionId === "string" &&
    "totalMs" in message &&
    typeof message.totalMs === "number" &&
    "timeToFirstTokenMs" in message &&
    (typeof message.timeToFirstTokenMs === "number" || message.timeToFirstTokenMs === null) &&
    (!("llmRequestLatencyMs" in message) ||
      typeof message.llmRequestLatencyMs === "number" ||
      message.llmRequestLatencyMs === null) &&
    (!("questionCompletedAt" in message) ||
      typeof message.questionCompletedAt === "number" ||
      message.questionCompletedAt === null) &&
    (!("llmRequestStartedAt" in message) ||
      typeof message.llmRequestStartedAt === "number" ||
      message.llmRequestStartedAt === null) &&
    (!("firstTokenAt" in message) ||
      typeof message.firstTokenAt === "number" ||
      message.firstTokenAt === null) &&
    (!("answerCompletedAt" in message) ||
      typeof message.answerCompletedAt === "number" ||
      message.answerCompletedAt === null)
  ) {
    return true;
  }

  return (
    message.type === "answer:error" &&
    "questionId" in message &&
    typeof message.questionId === "string" &&
    "code" in message &&
    typeof message.code === "string" &&
    "message" in message &&
    typeof message.message === "string"
  );
}

