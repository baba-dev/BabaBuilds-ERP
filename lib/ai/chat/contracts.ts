import { z } from "zod";

const chatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});

const chatContextSchema = z
  .object({
    currentRoute: z.string().trim().max(256).optional(),
    pageTitle: z.string().trim().max(256).optional(),
    selectedItemName: z.string().trim().max(256).optional(),
  })
  .default({});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  history: z.array(chatHistoryItemSchema).max(20).default([]),
  context: chatContextSchema,
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ToolAction =
  | { type: "NAVIGATE"; path: string; payload?: Record<string, unknown> | null }
  | { type: "SET_THEME"; theme: "light" | "dark" | "system" };

