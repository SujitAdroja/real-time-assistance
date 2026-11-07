export type ConversationAnswerSource = "AI_GENERATED_UNVERIFIED";

export interface ConversationTurn {
  questionId: string;
  question: string;
  answer: string;
  answerSource: ConversationAnswerSource;
  timestamp: number;
  topic?: string;
}

export interface CandidateContext {
  resume: string;
  jobDescription: string;
  recentConversation: ConversationTurn[];
}
