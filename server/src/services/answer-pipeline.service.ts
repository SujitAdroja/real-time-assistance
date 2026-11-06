import { performance } from "node:perf_hooks";
import {
  AnswerGenerationError,
  toAnswerGenerationError,
  type GroqAnswerService,
} from "./groq-answer.service.js";
import {
  InterviewSessionMemory,
  rememberAfterSuccessfulGeneration,
} from "./interview-session-memory.service.js";
import { resolveFollowUpQuestion } from "./follow-up-resolver.service.js";

export type AnswerPipelineQuestion = {
  id: string;
  text: string;
  category: string;
  completedAt?: number;
};

export type AnswerPipelineCompletion = {
  questionId: string;
  questionCompletedAt: number;
  llmRequestStartedAt: number;
  firstTokenAt: number | null;
  answerCompletedAt: number;
  firstTokenLatencyMs: number | null;
  llmRequestLatencyMs: number | null;
  totalResponseTimeMs: number;
};

export type AnswerPipelineEvent =
  | {
      type: "answer:start";
      questionId: string;
      question: string;
      model: string;
      startedAt: number;
    }
  | { type: "answer:token"; questionId: string; token: string }
  | ({ type: "answer:complete" } & AnswerPipelineCompletion)
  | {
      type: "answer:error";
      questionId: string;
      code: string;
      message: string;
    };

export type AnswerPipelineClock = {
  timeOrigin: number;
  now: () => number;
};

const systemClock: AnswerPipelineClock = {
  timeOrigin: performance.timeOrigin,
  now: () => performance.now(),
};

export class AnswerQuestionDeduplicator {
  private readonly questionIds = new Set<string>();

  constructor(private readonly maximumIds = 512) {}

  claim(questionId: string): boolean {
    if (!questionId || this.questionIds.has(questionId)) {
      return false;
    }

    this.questionIds.add(questionId);
    if (this.questionIds.size > this.maximumIds) {
      const oldestQuestionId = this.questionIds.values().next().value;
      if (oldestQuestionId !== undefined) {
        this.questionIds.delete(oldestQuestionId);
      }
    }
    return true;
  }

  clear(): void {
    this.questionIds.clear();
  }
}

export function cancelActiveAnswers(
  controllers: ReadonlyMap<string, AbortController>,
  emit: (event: AnswerPipelineEvent) => void,
  message: string,
): void {
  for (const [questionId, controller] of controllers) {
    if (controller.signal.aborted) {
      continue;
    }

    controller.abort();
    emit({
      type: "answer:error",
      questionId,
      code: "cancelled",
      message,
    });
  }
}

export async function runAnswerPipeline(input: {
  question: AnswerPipelineQuestion;
  memory: InterviewSessionMemory;
  getService: () => GroqAnswerService;
  model: string;
  signal: AbortSignal;
  emit: (event: AnswerPipelineEvent) => void;
  validate?: () => void;
  clock?: AnswerPipelineClock;
}): Promise<"complete" | "error" | "cancelled"> {
  const clock = input.clock ?? systemClock;
  const now = () => clock.now();
  const timestamp = (monotonicTime: number) => clock.timeOrigin + monotonicTime;
  const startedMonotonic = now();
  const fallbackQuestionCompletedAt = timestamp(startedMonotonic);
  const providedQuestionCompletedAt = input.question.completedAt;
  const hasValidQuestionCompletedAt =
    Number.isFinite(providedQuestionCompletedAt) &&
    (providedQuestionCompletedAt ?? 0) >= clock.timeOrigin;
  const questionCompletedAt =
    hasValidQuestionCompletedAt
      ? providedQuestionCompletedAt!
      : fallbackQuestionCompletedAt;
  const questionCompletedMonotonic = hasValidQuestionCompletedAt
    ? questionCompletedAt - clock.timeOrigin
    : startedMonotonic;
  let answer = "";
  let firstTokenMonotonic: number | null = null;
  let llmRequestStartedAt: number | null = null;
  let llmRequestStartedMonotonic: number | null = null;

  input.emit({
    type: "answer:start",
    questionId: input.question.id,
    question: input.question.text,
    model: input.model,
    startedAt: timestamp(startedMonotonic),
  });

  try {
    const context = input.memory.getAnswerContext();
    const followUp = resolveFollowUpQuestion(
      input.question.text,
      context.recentConversation,
    );
    input.validate?.();

    const service = input.getService();
    const markLlmRequestStarted = () => {
      if (llmRequestStartedMonotonic !== null) {
        return;
      }
      llmRequestStartedMonotonic = now();
      llmRequestStartedAt = timestamp(llmRequestStartedMonotonic);
    };

    await rememberAfterSuccessfulGeneration(
      input.memory,
      {
        questionId: input.question.id,
        question: input.question.text,
        topic: input.question.category,
        getAnswer: () => answer,
        shouldRemember: () => !input.signal.aborted,
      },
      () =>
        service.streamAnswer({
          question: input.question.text,
          context,
          followUp,
          signal: input.signal,
          onRequestStart: markLlmRequestStarted,
          onToken: (token) => {
            if (input.signal.aborted) {
              return;
            }

            markLlmRequestStarted();
            firstTokenMonotonic ??= now();
            answer += token;
            input.emit({
              type: "answer:token",
              questionId: input.question.id,
              token,
            });
          },
        }),
    );

    if (input.signal.aborted) {
      return "cancelled";
    }

    if (!answer.trim()) {
      throw new AnswerGenerationError(
        "provider",
        "The model returned an empty answer. Please try the question again.",
      );
    }

    const completedMonotonic = now();
    const firstTokenAt =
      firstTokenMonotonic === null ? null : timestamp(firstTokenMonotonic);
    const completion: AnswerPipelineCompletion = {
      questionId: input.question.id,
      questionCompletedAt,
      llmRequestStartedAt: llmRequestStartedAt!,
      firstTokenAt,
      answerCompletedAt: timestamp(completedMonotonic),
      firstTokenLatencyMs:
        firstTokenMonotonic === null
          ? null
          : Math.max(0, firstTokenMonotonic - questionCompletedMonotonic),
      llmRequestLatencyMs:
        firstTokenMonotonic === null || llmRequestStartedMonotonic === null
          ? null
          : Math.max(0, firstTokenMonotonic - llmRequestStartedMonotonic),
      totalResponseTimeMs: Math.max(
        0,
        completedMonotonic - questionCompletedMonotonic,
      ),
    };
    input.emit({ type: "answer:complete", ...completion });
    return "complete";
  } catch (error) {
    if (input.signal.aborted) {
      return "cancelled";
    }

    const generationError = toAnswerGenerationError(error);
    input.emit({
      type: "answer:error",
      questionId: input.question.id,
      code: generationError.code,
      message: generationError.message,
    });
    return "error";
  }
}
