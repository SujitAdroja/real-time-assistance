import type {
  CandidateContext,
  ConversationTurn,
} from "./prompt-builder.service.js";

export const MAX_CANDIDATE_CONTEXT_CHARS = 15_000;
export const MAX_SESSION_HISTORY_TURNS = 8;
const MAX_REMEMBERED_QUESTION_IDS = 512;

export type CandidateContextInput = {
  resume: string;
  jobDescription: string;
};

export type CandidateContextStatus = {
  hasResume: boolean;
  hasJobDescription: boolean;
  resumeCharacters: number;
  jobDescriptionCharacters: number;
};

export class CandidateContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateContextValidationError";
  }
}

export type CompletedConversationTurn = ConversationTurn;
export type CompletedConversationTurnInput = Omit<ConversationTurn, "answerSource">;

export class InterviewSessionMemory {
  private resume = "";
  private jobDescription = "";
  private readonly turns: CompletedConversationTurn[] = [];
  private readonly completedQuestionIds = new Set<string>();

  updateCandidateContext(input: CandidateContextInput): CandidateContextStatus {
    if (input.resume.length > MAX_CANDIDATE_CONTEXT_CHARS) {
      throw new CandidateContextValidationError(
        `Resume must be ${MAX_CANDIDATE_CONTEXT_CHARS.toLocaleString()} characters or fewer.`,
      );
    }

    if (input.jobDescription.length > MAX_CANDIDATE_CONTEXT_CHARS) {
      throw new CandidateContextValidationError(
        `Job description must be ${MAX_CANDIDATE_CONTEXT_CHARS.toLocaleString()} characters or fewer.`,
      );
    }

    this.resume = input.resume.trim();
    this.jobDescription = input.jobDescription.trim();
    return this.getCandidateContextStatus();
  }

  getCandidateContextStatus(): CandidateContextStatus {
    return {
      hasResume: this.resume.length > 0,
      hasJobDescription: this.jobDescription.length > 0,
      resumeCharacters: this.resume.length,
      jobDescriptionCharacters: this.jobDescription.length,
    };
  }

  getRecentConversation(): CompletedConversationTurn[] {
    return this.turns.map((turn) => ({ ...turn }));
  }

  getAnswerContext(): CandidateContext {
    return {
      resume: this.resume,
      jobDescription: this.jobDescription,
      recentConversation: this.getRecentConversation(),
    };
  }

  recordCompletedTurn(turn: CompletedConversationTurnInput): boolean {
    if (
      !turn.questionId.trim() ||
      !turn.question.trim() ||
      !turn.answer.trim() ||
      this.completedQuestionIds.has(turn.questionId)
    ) {
      return false;
    }

    this.completedQuestionIds.add(turn.questionId);
    if (this.completedQuestionIds.size > MAX_REMEMBERED_QUESTION_IDS) {
      const oldestQuestionId = this.completedQuestionIds.values().next().value;
      if (oldestQuestionId !== undefined) {
        this.completedQuestionIds.delete(oldestQuestionId);
      }
    }

    this.turns.push({
      ...turn,
      answerSource: "AI_GENERATED_UNVERIFIED",
    });
    if (this.turns.length > MAX_SESSION_HISTORY_TURNS) {
      this.turns.splice(0, this.turns.length - MAX_SESSION_HISTORY_TURNS);
    }
    return true;
  }

  clear(): void {
    this.resume = "";
    this.jobDescription = "";
    this.turns.length = 0;
    this.completedQuestionIds.clear();
  }
}

export async function rememberAfterSuccessfulGeneration(
  memory: InterviewSessionMemory,
  input: {
    questionId: string;
    question: string;
    topic?: string;
    getAnswer: () => string;
    shouldRemember?: () => boolean;
  },
  generate: () => Promise<void>,
  now: () => number = Date.now,
): Promise<void> {
  await generate();
  if (input.shouldRemember && !input.shouldRemember()) {
    return;
  }

  const answer = input.getAnswer();
  if (!answer.trim()) {
    return;
  }

  memory.recordCompletedTurn({
    questionId: input.questionId,
    question: input.question,
    answer,
    timestamp: now(),
    topic: input.topic,
  });
}
