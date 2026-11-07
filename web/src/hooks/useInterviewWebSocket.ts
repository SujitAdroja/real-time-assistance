"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isServerMessage } from "@/services/interviewWebSocketProtocol";
import type {
  CandidateContextInput,
  CandidateContextStatus,
  ConnectionStatus,
  DetectedQuestion,
  GeneratedAnswer,
  QuestionDetectionStatus,
  SessionControlMessage,
  SttStatus,
  TranscriptSegment,
} from "@/types/interview";
export type {
  CandidateContextInput,
  CandidateContextStatus,
  ConnectionStatus,
  DetectedQuestion,
  GeneratedAnswer,
  QuestionCategory,
  QuestionClassification,
  QuestionDetectionStatus,
  SessionControlMessage,
  SttStatus,
  TranscriptSegment,
} from "@/types/interview";

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
  const [candidateContextStatus, setCandidateContextStatus] =
    useState<CandidateContextStatus>("empty");
  const [candidateContextError, setCandidateContextError] = useState<string | null>(null);
  const [candidateContextRevision, setCandidateContextRevision] = useState(0);
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
    candidateContextRef.current = { resume: "", jobDescription: "" };
    setCandidateContext({ resume: "", jobDescription: "" });
    setCandidateContextRevision((revision) => revision + 1);
    setCandidateContextStatus("empty");
    setCandidateContextError(null);
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

    if (
      existingSocket &&
      (existingSocket.readyState === WebSocket.CLOSING ||
        existingSocket.readyState === WebSocket.CLOSED)
    ) {
      socketRef.current = null;
      candidateContextRef.current = { resume: "", jobDescription: "" };
      setCandidateContext({ resume: "", jobDescription: "" });
      setCandidateContextRevision((revision) => revision + 1);
      setCandidateContextStatus("empty");
      setCandidateContextError(null);
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
        setCandidateContextStatus("saving");
        setCandidateContextError(null);
        socket.send(
          JSON.stringify({
            type: "context:update",
            ...candidateContextRef.current,
          }),
        );
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
            setCandidateContextStatus(
              message.hasResume || message.hasJobDescription ? "saved" : "empty",
            );
            setCandidateContextError(null);
            break;
          case "context:error":
            setCandidateContextStatus("error");
            setCandidateContextError(message.message);
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
                llmRequestLatencyMs: null,
                questionCompletedAt: null,
                llmRequestStartedAt: null,
                firstTokenAt: null,
                answerCompletedAt: null,
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
                      llmRequestLatencyMs: message.llmRequestLatencyMs ?? null,
                      questionCompletedAt: message.questionCompletedAt ?? null,
                      llmRequestStartedAt: message.llmRequestStartedAt ?? null,
                      firstTokenAt: message.firstTokenAt ?? null,
                      answerCompletedAt: message.answerCompletedAt ?? null,
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
        setSttStatus("disconnected");
        setInterimTranscript("");
        setAnswers((previous) =>
          previous.map((answer) =>
            answer.status === "generating"
              ? {
                  ...answer,
                  status: "error",
                  error: "Connection lost while this answer was generating. Reconnect and try again.",
                }
              : answer,
          ),
        );

        if (event.code === 1000) {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("error");
          setConnectionError(`Audio server connection closed (code ${event.code}).`);
        }

        candidateContextRef.current = { resume: "", jobDescription: "" };
        setCandidateContext({ resume: "", jobDescription: "" });
        setCandidateContextRevision((revision) => revision + 1);
        setCandidateContextStatus("empty");
        setCandidateContextError(null);
        finish(false);
      };
    });
  }, [url]);

  const saveCandidateContext = useCallback((context: CandidateContextInput) => {
    candidateContextRef.current = context;
    setCandidateContext(context);
    setCandidateContextRevision((revision) => revision + 1);
    setCandidateContextStatus(
      context.resume.trim() || context.jobDescription.trim() ? "unsaved" : "saving",
    );
    setCandidateContextError(null);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "context:update", ...context }));
      setCandidateContextStatus("saving");
    } else if (!context.resume.trim() && !context.jobDescription.trim()) {
      setCandidateContextStatus("empty");
    }
  }, []);

  const sendControlMessage = useCallback((message: SessionControlMessage): boolean => {
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
    candidateContextError,
    candidateContextRevision,
    candidateContextStatus,
    connectionError,
    connectionStatus,
    detectedQuestion,
    disconnect,
    finalTranscripts,
    interimTranscript,
    questionDetectionStatus,
    saveCandidateContext,
    sendAudioChunk,
    sendControlMessage,
    sttError,
    sttStatus,
  };
}
