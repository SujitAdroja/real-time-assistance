export type AnswerGenerationErrorCode =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "model_unavailable"
  | "provider"
  | "cancelled";

export class AnswerGenerationError extends Error {
  constructor(
    readonly code: AnswerGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnswerGenerationError";
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AnswerModelService {
  streamAnswer(input: {
    messages: ChatMessage[];
    signal: AbortSignal;
    onRequestStart?: () => void;
    onToken: (token: string) => void;
  }): Promise<void>;
}
