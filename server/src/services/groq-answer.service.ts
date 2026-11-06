import Groq from "groq-sdk";
import {
  buildAnswerPrompt,
  type CandidateContext,
} from "./prompt-builder.service.js";

export type AnswerErrorCode =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "model_unavailable"
  | "provider"
  | "cancelled";

export class AnswerGenerationError extends Error {
  constructor(
    readonly code: AnswerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnswerGenerationError";
  }
}

export interface GroqAnswerService {
  streamAnswer(input: {
    question: string;
    context: CandidateContext;
    signal: AbortSignal;
    onToken: (token: string) => void;
  }): Promise<void>;
}

export function createGroqAnswerService(
  apiKey: string,
  model: string,
  fetcher: typeof fetch = fetch,
): GroqAnswerService {
  const client = new Groq({
    apiKey,
    fetch: fetcher,
    maxRetries: 0,
    timeout: 30_000,
  });
  let modelAvailable: Promise<boolean> | null = null;

  const checkModelAvailable = async (signal: AbortSignal): Promise<void> => {
    modelAvailable ??= client.models
      .list({ signal })
      .then((response) => response.data.some((availableModel) => availableModel.id === model))
      .catch((error: unknown) => {
        modelAvailable = null;
        throw toAnswerGenerationError(error);
      });

    if (!(await modelAvailable)) {
      modelAvailable = null;
      throw new AnswerGenerationError(
        "model_unavailable",
        `The configured Groq model "${model}" is not available to this API key. Check GROQ_MODEL against the models enabled for your Groq account.`,
      );
    }
  };

  return {
    async streamAnswer({ question, context, signal, onToken }) {
      if (signal.aborted) {
        throw new AnswerGenerationError("cancelled", "Answer generation was cancelled.");
      }

      await checkModelAvailable(signal);

      try {
        const stream = await client.chat.completions.create(
          {
            model,
            messages: buildAnswerPrompt(question, context),
            stream: true,
            max_completion_tokens: 220,
            temperature: 0.3,
          },
          { signal },
        );

        for await (const chunk of stream) {
          if (signal.aborted) {
            throw new AnswerGenerationError("cancelled", "Answer generation was cancelled.");
          }

          const content = chunk.choices[0]?.delta.content;
          if (typeof content === "string" && content.length > 0) {
            onToken(content);
          }
        }
      } catch (error) {
        if (signal.aborted) {
          throw new AnswerGenerationError("cancelled", "Answer generation was cancelled.");
        }
        throw toAnswerGenerationError(error);
      }
    },
  };
}

export function toAnswerGenerationError(error: unknown): AnswerGenerationError {
  if (error instanceof AnswerGenerationError) {
    return error;
  }

  if (error instanceof Groq.RateLimitError) {
    return new AnswerGenerationError(
      "rate_limit",
      "Groq rate limit reached. Wait briefly, then try the question again.",
    );
  }

  if (error instanceof Groq.APIConnectionTimeoutError) {
    return new AnswerGenerationError(
      "timeout",
      "Groq took too long to respond. Please try the question again.",
    );
  }

  if (error instanceof Groq.AuthenticationError || error instanceof Groq.PermissionDeniedError) {
    return new AnswerGenerationError(
      "authentication",
      "Groq rejected the API key or account permissions. Check GROQ_API_KEY.",
    );
  }

  if (error instanceof Groq.NotFoundError) {
    return new AnswerGenerationError(
      "model_unavailable",
      "The configured Groq model is unavailable to this account. Check GROQ_MODEL.",
    );
  }

  if (error instanceof Groq.APIConnectionError) {
    return new AnswerGenerationError(
      "provider",
      "Could not connect to Groq. Check the backend network connection and try again.",
    );
  }

  if (error instanceof Error) {
    return new AnswerGenerationError("provider", error.message);
  }

  return new AnswerGenerationError(
    "provider",
    "Groq answer generation failed for an unknown reason.",
  );
}
