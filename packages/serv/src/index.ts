import { DEFAULT_SERV_BASE_URL } from "./client";

export type ServEnvironment = {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs?: number;
};

export function readServEnvironment(env: NodeJS.ProcessEnv = process.env): ServEnvironment {
  const apiKey = env.SERV_API_KEY?.trim();
  const model = env.SERV_MODEL?.trim();

  if (!apiKey) {
    throw new Error("SERV_API_KEY is required for SERV-backed evaluations.");
  }

  if (!model) {
    throw new Error("SERV_MODEL is required for SERV-backed evaluations.");
  }

  const baseUrl = env.SERV_BASE_URL?.trim() || DEFAULT_SERV_BASE_URL;
  const timeoutValue = env.SERV_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutValue ? Number(timeoutValue) : undefined;

  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error("SERV_TIMEOUT_MS must be a positive number when provided.");
  }

  return {
    apiKey,
    model,
    baseUrl,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

export * from "./client";
export * from "./prompt";
export * from "./types";
