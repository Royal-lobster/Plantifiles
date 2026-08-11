import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  GITHUB_ID: z.string().default(""),
  GITHUB_SECRET: z.string().default(""),
  PLANTIFILES_BASE_URL: z.url().transform((value) => value.replace(/\/$/, "")),
  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const config = Object.freeze({
  databaseUrl: parsed.DATABASE_URL,
  authSecret: parsed.AUTH_SECRET,
  githubId: parsed.GITHUB_ID,
  githubSecret: parsed.GITHUB_SECRET,
  baseUrl: parsed.PLANTIFILES_BASE_URL,
  anthropicApiKey: parsed.ANTHROPIC_API_KEY,
});
