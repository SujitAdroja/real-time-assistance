import Groq from "groq-sdk";
import {
  AnswerGenerationError,
  type AnswerGenerationErrorCode,
  type AnswerModelService,
} from "../../modules/answer-generation/answer-generation.types.js";

export { AnswerGenerationError } from "../../modules/answer-generation/answer-generation.types.js";
export type AnswerErrorCode = AnswerGenerationErrorCode;
export type GroqAnswerService = AnswerModelService;

export function createGroqAnswerService(
  apiKey: string,
  model: string,
  fetcher: typeof fetch = fetch,
): AnswerModelService {
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
    async streamAnswer({ messages, signal, onRequestStart, onToken }) {
      if (signal.aborted) {
        throw new AnswerGenerationError("cancelled", "Answer generation was cancelled.");
      }

      await checkModelAvailable(signal);

      try {
        onRequestStart?.();
        const stream = await client.chat.completions.create(
          {
            model,
            messages,
            stream: true,
            max_completion_tokens: 700,
            temperature: 0.3,
            ...(model.startsWith("openai/gpt-oss-")
              ? { reasoning_effort: "low" as const, include_reasoning: false }
              : {}),
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

          if (chunk.choices[0]?.finish_reason === "length") {
            throw new AnswerGenerationError(
              "provider",
              "The answer reached the model's output limit and may be incomplete. Please try the question again.",
            );
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
    return new AnswerGenerationError(
      "provider",
      "Groq answer generation failed. Please try the question again.",
    );
  }

  return new AnswerGenerationError(
    "provider",
    "Groq answer generation failed for an unknown reason.",
  );
}
