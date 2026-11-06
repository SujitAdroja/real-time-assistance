import { DeepgramClient } from "@deepgram/sdk";

export type DeepgramSessionEvent =
  | { type: "interim"; text: string }
  | { type: "final"; text: string; speechFinal: boolean }
  | { type: "error"; error: Error }
  | { type: "closed" };

export interface DeepgramSession {
  sendAudio(audio: Buffer): boolean;
  isClosed(): boolean;
  close(): Promise<void>;
}

export async function createDeepgramSession(
  apiKey: string,
  signal: AbortSignal,
  onEvent: (event: DeepgramSessionEvent) => void,
): Promise<DeepgramSession> {
  const deepgram = new DeepgramClient({ apiKey });
  const connection = await deepgram.listen.v1.connect({
    model: "nova-3",
    language: "en-US",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    endpointing: 300,
    utterance_end_ms: "1000",
    reconnectAttempts: 0,
    shouldReconnect: () => false,
    connectionTimeoutInSeconds: 10,
    abortSignal: signal,
  });

  let closed = false;
  let resolveClosed: () => void = () => {};
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let ready = false;
  let closeRequested = false;
  let startupError: Error | null = null;

  connection.on("message", (message) => {
    if (message.type === "Error") {
      const error = new Error(`${message.variant}: ${message.description}`);
      if (ready) {
        onEvent({ type: "error", error });
      } else {
        startupError = error;
      }
      return;
    }

    if (message.type !== "Results") {
      return;
    }

    const text = message.channel.alternatives[0]?.transcript.trim();

    if (!text) {
      return;
    }

    if (message.is_final) {
      onEvent({
        type: "final",
        text,
        speechFinal: message.speech_final === true,
      });
    } else {
      onEvent({ type: "interim", text });
    }
  });

  connection.on("error", (error) => {
    if (ready) {
      onEvent({ type: "error", error });
    }
  });

  connection.on("close", () => {
    if (closed) {
      return;
    }

    closed = true;
    resolveClosed();
    if (ready) {
      if (!closeRequested) {
        onEvent({ type: "error", error: new Error("Deepgram closed the connection unexpectedly.") });
      }
      onEvent({ type: "closed" });
    }
  });

  connection.connect();

  try {
    await connection.waitForOpen();
    if (startupError) {
      throw startupError;
    }

    ready = true;
    if (closed) {
      onEvent({ type: "closed" });
      throw new Error("Deepgram closed the connection during startup.");
    }
  } catch (error) {
    connection.close();
    throw error;
  }

  return {
    isClosed() {
      return closed;
    },
    sendAudio(audio) {
      if (closed) {
        return false;
      }

      try {
        connection.sendMedia(audio);
        return true;
      } catch (error) {
        onEvent({
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return false;
      }
    },
    async close() {
      if (closed) {
        return;
      }

      closeRequested = true;
      try {
        connection.sendCloseStream({ type: "CloseStream" });
        await Promise.race([
          closedPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
      } finally {
        if (!closed) {
          connection.close();
          if (!closed) {
            closed = true;
            resolveClosed();
            onEvent({ type: "closed" });
          }
        }
      }
    },
  };
}
