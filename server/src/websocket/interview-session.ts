import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import {
  AnswerQuestionDeduplicator,
  cancelActiveAnswers,
  runAnswerPipeline,
} from "../modules/answer-generation/answer-pipeline.service.js";
import {
  AnswerGenerationError,
  createGroqAnswerService,
  type GroqAnswerService,
} from "../integrations/groq/groq-answer.service.js";
import {
  createDeepgramSession,
  type DeepgramSession,
  type DeepgramSessionEvent,
} from "../integrations/deepgram/deepgram.service.js";
import { InterviewSessionMemory, CandidateContextValidationError } from "../modules/conversation/interview-session-memory.service.js";
import { QuestionDetectionSession } from "../modules/question-detection/question-detection-session.js";
import type { ServerConfig } from "../config/environment.js";
import { parseClientMessage, toBuffer, type ServerMessage } from "./protocol.js";

const MAX_PENDING_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVE_ANSWERS = 2;

function getDeepgramStartupError(error: unknown, apiKey: string): {
  diagnostic: string;
  message: string;
} {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : String(error);
  const diagnostic = (apiKey ? rawMessage.replaceAll(apiKey, "[redacted]") : rawMessage).slice(0, 500);
  const status = diagnostic.match(/(?:response:\s*|status(?: code)?\s*[:=]?\s*)(401|403|429)\b/i)?.[1];

  if (status === "401") {
    return {
      diagnostic,
      message: "Deepgram rejected the API key (401). Check DEEPGRAM_API_KEY in server/.env, then restart the backend.",
    };
  }
  if (status === "403") {
    return {
      diagnostic,
      message: "Deepgram denied access (403). Check that this API key's project has access to live transcription.",
    };
  }
  if (status === "429") {
    return {
      diagnostic,
      message: "Deepgram account limit reached (429). Check the project's plan and usage limits.",
    };
  }
  if (/timeout|timed out/i.test(diagnostic)) {
    return {
      diagnostic,
      message: "The backend timed out connecting to Deepgram. Check the backend's internet connection and firewall.",
    };
  }

  return {
    diagnostic,
    message: "Could not connect to Deepgram. Check the API key, live transcription access, network, and backend logs.",
  };
}

let groqAnswerService: GroqAnswerService | null = null;
let groqServiceConfig: { apiKey: string; model: string } | null = null;

export function handleInterviewConnection(
  socket: WebSocket,
  request: IncomingMessage,
  config: ServerConfig,
): void {
  const clientAddress = request.socket.remoteAddress ?? "unknown client";
  let isConnected = true;
  let sessionGeneration = 0;
  let session: DeepgramSession | null = null;
  let startupController: AbortController | null = null;
  let sessionClosing = false;
  let sessionFailed = false;
  let audioReceived = false;
  let pendingAudio: Buffer[] = [];
  let pendingAudioBytes = 0;
  let finalTranscriptId = 0;
  let questionDetectionSession: QuestionDetectionSession | null = null;
  const sessionMemory = new InterviewSessionMemory();
  const answerControllers = new Map<string, AbortController>();
  const answeredQuestionIds = new AnswerQuestionDeduplicator();

  console.log(`WebSocket client connected: ${clientAddress}`);

  const send = (message: ServerMessage) => {
    if (isConnected && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const sendSttError = (message: string) => {
    sessionFailed = true;
    send({ type: "stt:error", message });
  };

  const clearPendingAudio = () => {
    pendingAudio = [];
    pendingAudioBytes = 0;
  };

  const getGroqAnswerService = (): GroqAnswerService => {
    const apiKey = config.groqApiKey;
    if (!apiKey) {
      throw new AnswerGenerationError(
        "configuration",
        "Groq is not configured. Set GROQ_API_KEY in server/.env and restart the backend.",
      );
    }

    const model = config.groqModel;
    if (
      !groqAnswerService ||
      groqServiceConfig?.apiKey !== apiKey ||
      groqServiceConfig?.model !== model
    ) {
      groqAnswerService = createGroqAnswerService(apiKey, model);
      groqServiceConfig = { apiKey, model };
    }

    return groqAnswerService;
  };

  const generateAnswer = async (question: {
    id: string;
    text: string;
    category: string;
    detectedAt: number;
  }): Promise<void> => {
    if (!answeredQuestionIds.claim(question.id)) {
      return;
    }

    const model = config.groqModel;
    const controller = new AbortController();
    answerControllers.set(question.id, controller);
    await runAnswerPipeline({
      question: {
        id: question.id,
        text: question.text,
        category: question.category,
        completedAt: question.detectedAt,
      },
      memory: sessionMemory,
      getService: getGroqAnswerService,
      model,
      signal: controller.signal,
      validate: () => {
        if (answerControllers.size > MAX_ACTIVE_ANSWERS) {
          throw new AnswerGenerationError(
            "provider",
            "Too many answers are being generated at once. Wait for one to finish.",
          );
        }
      },
      emit: (event) => {
        if (!isConnected || controller.signal.aborted) {
          return;
        }
        if (event.type === "answer:error") {
          console.error("Groq answer generation failed:", event.message);
        }
        if (event.type === "answer:complete") {
          send({
            ...event,
            totalMs: event.totalResponseTimeMs,
            timeToFirstTokenMs: event.firstTokenLatencyMs,
          });
        } else {
          send(event);
        }
      },
    });

    if (answerControllers.get(question.id) === controller) {
      answerControllers.delete(question.id);
    }
  };

  const stopSession = async () => {
    cancelActiveAnswers(
      answerControllers,
      (event) => {
        if (event.type === "answer:error") {
          send(event);
        }
      },
      "Answer generation was cancelled because the recording session stopped.",
    );
    answerControllers.clear();

    const pendingStart = startupController;
    startupController = null;
    if (pendingStart) {
      sessionGeneration += 1;
      pendingStart.abort();
    }
    clearPendingAudio();

    const activeSession = session;
    session = null;

    if (activeSession) {
      sessionClosing = true;
      try {
        await activeSession.close();
      } catch (error) {
        console.error(
          "Failed to close Deepgram session:",
          error instanceof Error ? error.name : "UnknownError",
        );
        sendSttError("The backend could not close the Deepgram session cleanly.");
      } finally {
        sessionClosing = false;
        sessionGeneration += 1;
      }
    } else if (!pendingStart) {
      sessionGeneration += 1;
    }
  };

  const handleDeepgramEvent = (
    event: DeepgramSessionEvent,
    generation: number,
    sessionRef: { current: DeepgramSession | null },
  ) => {
    if (!isConnected || generation !== sessionGeneration) {
      return;
    }

    if (event.type === "interim") {
      send({ type: "transcript:interim", text: event.text });
      return;
    }

    if (event.type === "final") {
      finalTranscriptId += 1;
      send({
        type: "transcript:final",
        id: `${generation}:${finalTranscriptId}`,
        text: event.text,
        speechFinal: event.speechFinal,
      });
      questionDetectionSession?.addFinalSegment({
        id: event.id,
        text: event.text,
        speechFinal: event.speechFinal,
      });
      return;
    }

    if (event.type === "utterance-end") {
      questionDetectionSession?.signalUtteranceEnd();
      return;
    }

    if (event.type === "error") {
      console.error(
        "Deepgram live transcription error:",
        event.error instanceof Error ? event.error.name : "UnknownError",
      );
      sendSttError(
        "Deepgram reported an error. Verify the API key and network connection; see the backend logs for details.",
      );
      return;
    }

    questionDetectionSession?.flush();
    send({ type: "stt:closed" });
    if (session === sessionRef.current) {
      session = null;
    }
  };

  const startSession = async (mimeType: string) => {
    if (session || startupController || sessionClosing) {
      sendSttError("A transcription session is already active.");
      return;
    }

    const apiKey = config.deepgramApiKey;
    if (!apiKey) {
      sendSttError("Deepgram is not configured. Set DEEPGRAM_API_KEY in server/.env and restart the backend.");
      return;
    }

    const generation = ++sessionGeneration;
    const controller = new AbortController();
    const sessionRef: { current: DeepgramSession | null } = { current: null };
    audioReceived = false;
    startupController = controller;
    finalTranscriptId = 0;
    questionDetectionSession = new QuestionDetectionSession(
      String(generation),
      (event) => {
        // A close flush must not start a new answer after stop or STT failure.
        if (
          event.type === "question:detected" &&
          (sessionClosing || sessionFailed)
        ) {
          return;
        }
        send(event);
        if (event.type === "question:detected") {
          void generateAnswer({
            id: event.id,
            text: event.text,
            category: event.category,
            detectedAt: event.detectedAt,
          });
        }
      },
    );

    console.log(`Starting Deepgram session for audio MIME type: ${mimeType}`);
    send({ type: "stt:connecting" });

    try {
      const newSession = await createDeepgramSession(apiKey, controller.signal, (event) =>
        handleDeepgramEvent(event, generation, sessionRef),
      );
      sessionRef.current = newSession;

      if (newSession.isClosed()) {
        startupController = null;
        clearPendingAudio();
        return;
      }

      if (!isConnected || generation !== sessionGeneration) {
        await newSession.close();
        return;
      }

      session = newSession;
      startupController = null;
      send({ type: "stt:ready" });

      const audioToForward = pendingAudio;
      clearPendingAudio();

      for (const chunk of audioToForward) {
        if (!newSession.sendAudio(chunk)) {
          sendSttError("The Deepgram connection closed while forwarding audio.");
          void stopSession();
          return;
        }
      }
    } catch (error) {
      if (generation !== sessionGeneration) {
        return;
      }

      startupController = null;
      clearPendingAudio();
      const failure = getDeepgramStartupError(error, apiKey);
      console.error("Failed to start Deepgram session:", failure.diagnostic || "UnknownError");
      sendSttError(failure.message);
    }
  };

  socket.on("message", (data, isBinary) => {
    try {
      if (isBinary) {
        if (sessionFailed) {
          return;
        }

        const audio = toBuffer(data);
        if (audio.length > 0) {
          audioReceived = true;
        }

        if (session) {
          if (!session.sendAudio(audio)) {
            sendSttError("The Deepgram connection is not ready to receive audio.");
          }
          return;
        }

        if (startupController) {
          if (pendingAudioBytes + audio.byteLength > MAX_PENDING_AUDIO_BYTES) {
            sendSttError("Audio arrived faster than Deepgram could connect. Stop and start recording again.");
            void stopSession();
            return;
          }

          pendingAudio.push(audio);
          pendingAudioBytes += audio.byteLength;
          return;
        }

        sendSttError("Start a transcription session before sending audio.");
        return;
      }

      const message = parseClientMessage(data);
      if (!message) {
        sendSttError("Invalid WebSocket control message.");
        return;
      }

      if (message.type === "answer:cancel") {
        const controller = answerControllers.get(message.questionId);
        if (controller && !controller.signal.aborted) {
          controller.abort();
          send({
            type: "answer:error",
            questionId: message.questionId,
            code: "cancelled",
            message: "Answer generation was cancelled.",
          });
        }
      } else if (message.type === "context:update") {
        try {
          send({
            type: "context:saved",
            ...sessionMemory.updateCandidateContext(message),
          });
        } catch (error) {
          if (error instanceof CandidateContextValidationError) {
            send({
              type: "context:error",
              code: "invalid_context",
              message: error.message,
            });
          } else {
            throw error;
          }
        }
      } else if (message.type === "session-start") {
        sessionFailed = false;
        void startSession(message.mimeType);
      } else {
        if (!sessionFailed && !audioReceived) {
          sendSttError("No audio was received. Check microphone access and try recording again.");
        }
        sessionFailed = false;
        void stopSession();
      }
    } catch (error) {
      console.error("Failed to handle WebSocket message:", error);
      sendSttError("The backend could not process the WebSocket message.");
    }
  });

  socket.on("error", (error) => {
    console.error("WebSocket client error:", error);
  });

  socket.on("close", (code, reason) => {
    isConnected = false;
    cancelActiveAnswers(
      answerControllers,
      (event) => {
        if (event.type === "answer:error") {
          send(event);
        }
      },
      "Answer generation was cancelled because the connection closed.",
    );
    answerControllers.clear();
    sessionMemory.clear();
    answeredQuestionIds.clear();
    void stopSession();
    console.log(
      `WebSocket client disconnected (code ${code}): ${reason.toString() || "no reason"}`,
    );
  });

}
