import type { RawData } from "ws";
import type {
  QuestionCategory,
  QuestionClassification,
} from "../modules/question-detection/question-detection.service.js";

export type ClientMessage =
  | { type: "session-start"; mimeType: string }
  | { type: "session-stop" }
  | { type: "context:update"; resume: string; jobDescription: string }
  | { type: "answer:cancel"; questionId: string };

export type ServerMessage =
  | { type: "stt:connecting" | "stt:ready" | "stt:closed" }
  | { type: "stt:error"; message: string }
  | { type: "transcript:interim"; text: string }
  | { type: "transcript:final"; id: string; text: string; speechFinal: boolean }
  | {
      type: "question:status";
      classification: QuestionClassification;
      reason: string;
      shouldTriggerAnswer: boolean;
    }
  | {
      type: "question:detected";
      id: string;
      text: string;
      category: QuestionCategory;
      detectedAt: number;
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

export function parseClientMessage(data: RawData): ClientMessage | null {
  let message: unknown;

  try {
    message = JSON.parse(data.toString()) as unknown;
  } catch {
    return null;
  }

  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    typeof message.type !== "string"
  ) {
    return null;
  }

  if (message.type === "session-stop") {
    return { type: "session-stop" };
  }

  if (
    message.type === "answer:cancel" &&
    "questionId" in message &&
    typeof message.questionId === "string"
  ) {
    return { type: "answer:cancel", questionId: message.questionId };
  }

  if (
    message.type === "context:update" &&
    "resume" in message &&
    typeof message.resume === "string" &&
    "jobDescription" in message &&
    typeof message.jobDescription === "string"
  ) {
    return {
      type: "context:update",
      resume: message.resume,
      jobDescription: message.jobDescription,
    };
  }

  if (
    message.type === "session-start" &&
    "mimeType" in message &&
    typeof message.mimeType === "string"
  ) {
    return { type: "session-start", mimeType: message.mimeType };
  }

  return null;
}

export function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  return data;
}
