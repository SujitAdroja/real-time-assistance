"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type SessionStartMessage = {
  type: "session-start";
  mimeType: string;
};

type SessionStopMessage = {
  type: "session-stop";
};

type ControlMessage = SessionStartMessage | SessionStopMessage;

export type CandidateContextInput = {
  resume: string;
  jobDescription: string;
};

export type GeneratedAnswer = {
  questionId: string;
  question: string;
  model: string;
  content: string;
  status: "generating" | "complete" | "error" | "cancelled";
  error: string | null;
  timeToFirstTokenMs: number | null;
  totalMs: number | null;
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
type QuestionClassification =
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

type ServerMessage =
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
  | { type: "context:saved" }
  | { type: "answer:start"; questionId: string; question: string; model: string; startedAt: number }
  | { type: "answer:token"; questionId: string; token: string }
  | { type: "answer:complete"; questionId: string; totalMs: number; timeToFirstTokenMs: number | null }
  | { type: "answer:error"; questionId: string; code: string; message: string };

type SttStatus = "disconnected" | "connecting" | "ready" | "closed" | "error";
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

function isServerMessage(message: unknown): message is ServerMessage {
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

  if (message.type === "context:saved") {
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
    (typeof message.timeToFirstTokenMs === "number" || message.timeToFirstTokenMs === null)
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

export function useInterviewWebSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sttStatus, setSttStatus] = useState<SttStatus>("disconnected");
  const [sttError, setSttError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState<TranscriptSegment[]>([]);
  const [detectedQuestion, setDetectedQuestion] = useState<DetectedQuestion | null>(null);
  const [questionDetectionStatus, setQuestionDetectionStatus] =
    useState<QuestionDetectionStatus | null>(null);
  const [candidateContext, setCandidateContext] = useState<CandidateContextInput>({
    resume: "",
    jobDescription: "",
  });
  const [isCandidateContextSaved, setIsCandidateContextSaved] = useState(false);
  const [answers, setAnswers] = useState<GeneratedAnswer[]>([]);
  const seenQuestionIdsRef = useRef(new Set<string>());
  const candidateContextRef = useRef<CandidateContextInput>(candidateContext);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;

    if (socket) {
      socketRef.current = null;
      socket.close(1000, "Client disconnected");
    }

    setConnectionStatus("disconnected");
  }, []);

  const cancelAnswer = useCallback((questionId: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "answer:cancel", questionId }));
    }
  }, []);

  const connect = useCallback((): Promise<boolean> => {
    const existingSocket = socketRef.current;

    if (existingSocket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }

    if (existingSocket?.readyState === WebSocket.CONNECTING) {
      return Promise.resolve(false);
    }

    setConnectionStatus("connecting");
    setConnectionError(null);

    return new Promise((resolve) => {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      let settled = false;

      const finish = (connected: boolean) => {
        if (!settled) {
          settled = true;
          resolve(connected);
        }
      };

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          socket.close(1000, "Connection superseded");
          finish(false);
          return;
        }

        setConnectionStatus("connected");
        setConnectionError(null);
        socket.send(
          JSON.stringify({
            type: "context:update",
            ...candidateContextRef.current,
          }),
        );
        setIsCandidateContextSaved(false);
        finish(true);
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) {
          return;
        }

        setConnectionStatus("error");
        setConnectionError("Unable to connect to the audio server.");
        finish(false);
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) {
          return;
        }

        let message: unknown;

        try {
          message = JSON.parse(event.data) as unknown;
        } catch (error) {
          console.error("Received invalid WebSocket JSON:", error);
          setConnectionError("The audio server sent an invalid message.");
          return;
        }

        if (!isServerMessage(message)) {
          console.warn("Ignoring unrecognized audio server message.");
          return;
        }

        switch (message.type) {
          case "stt:connecting":
            setSttStatus("connecting");
            setSttError(null);
            break;
          case "stt:ready":
            setSttStatus("ready");
            setSttError(null);
            break;
          case "stt:closed":
            setSttStatus("closed");
            setInterimTranscript("");
            break;
          case "stt:error":
            setSttStatus("error");
            setSttError(message.message);
            break;
          case "transcript:interim":
            setInterimTranscript(message.text);
            break;
          case "transcript:final":
            setInterimTranscript("");
            setFinalTranscripts((previous) =>
              previous.some((segment) => segment.id === message.id)
                ? previous
                : [
                    ...previous,
                    {
                      id: message.id,
                      text: message.text,
                      speechFinal: message.speechFinal,
                    },
                  ],
            );
            break;
          case "question:detected":
            if (!seenQuestionIdsRef.current.has(message.id)) {
              seenQuestionIdsRef.current.add(message.id);
              setDetectedQuestion({
                id: message.id,
                text: message.text,
                category: message.category,
                detectedAt: message.detectedAt,
              });
            }
            break;
          case "question:status":
            setQuestionDetectionStatus({
              classification: message.classification,
              reason: message.reason,
              shouldTriggerAnswer: message.shouldTriggerAnswer,
            });
            break;
          case "context:saved":
            setIsCandidateContextSaved(true);
            break;
          case "answer:start":
            setAnswers((previous) => [
              {
                questionId: message.questionId,
                question: message.question,
                model: message.model,
                content: "",
                status: "generating",
                error: null,
                timeToFirstTokenMs: null,
                totalMs: null,
              },
              ...previous.filter((answer) => answer.questionId !== message.questionId),
            ]);
            break;
          case "answer:token":
            setAnswers((previous) =>
              previous.map((answer) =>
                answer.questionId === message.questionId && answer.status === "generating"
                  ? { ...answer, content: answer.content + message.token }
                  : answer,
              ),
            );
            break;
          case "answer:complete":
            setAnswers((previous) =>
              previous.map((answer) =>
                answer.questionId === message.questionId
                  ? {
                      ...answer,
                      status: "complete",
                      timeToFirstTokenMs: message.timeToFirstTokenMs,
                      totalMs: message.totalMs,
                    }
                  : answer,
              ),
            );
            break;
          case "answer:error":
            setAnswers((previous) =>
              previous.map((answer) =>
                answer.questionId === message.questionId
                  ? {
                      ...answer,
                      status: message.code === "cancelled" ? "cancelled" : "error",
                      error: message.message,
                    }
                  : answer,
              ),
            );
            break;
        }
      };

      socket.onclose = (event) => {
        if (socketRef.current !== socket) {
          return;
        }

        socketRef.current = null;

        if (event.code === 1000) {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("error");
          setConnectionError(`Audio server connection closed (code ${event.code}).`);
        }

        finish(false);
      };
    });
  }, [url]);

  const saveCandidateContext = useCallback((context: CandidateContextInput) => {
    candidateContextRef.current = context;
    setCandidateContext(context);
    setIsCandidateContextSaved(false);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "context:update", ...context }));
    }
  }, []);

  const sendControlMessage = useCallback((message: ControlMessage): boolean => {
    const socket = socketRef.current;

    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (message.type === "session-start") {
      setSttStatus("connecting");
      setSttError(null);
      setInterimTranscript("");
      setFinalTranscripts([]);
      setDetectedQuestion(null);
      setQuestionDetectionStatus(null);
      seenQuestionIdsRef.current.clear();
      setAnswers([]);
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const sendAudioChunk = useCallback((audioChunk: Blob): boolean => {
    const socket = socketRef.current;

    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(audioChunk);
    return true;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    connect,
    answers,
    cancelAnswer,
    candidateContext,
    connectionError,
    connectionStatus,
    detectedQuestion,
    disconnect,
    finalTranscripts,
    interimTranscript,
    isCandidateContextSaved,
    questionDetectionStatus,
    saveCandidateContext,
    sendAudioChunk,
    sendControlMessage,
    sttError,
    sttStatus,
  };
}
