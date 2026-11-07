import { resolve } from "node:path";
import dotenv from "dotenv";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

export type ServerConfig = {
  port: number;
  deepgramApiKey: string | undefined;
  groqApiKey: string | undefined;
  groqModel: string;
};

export function loadEnvironment(): void {
  dotenv.config({ path: resolve(__dirname, "../../.env") });
}

export function readServerConfig(): ServerConfig {
  const portValue = process.env.PORT ?? "4000";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer from 0 to 65535.");
  }

  return {
    port,
    deepgramApiKey: process.env.DEEPGRAM_API_KEY?.trim() || undefined,
    groqApiKey: process.env.GROQ_API_KEY?.trim() || undefined,
    groqModel: process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
  };
}
