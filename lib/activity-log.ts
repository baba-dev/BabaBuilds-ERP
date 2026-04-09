type ActivityOutcome = "success" | "error";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function logActivity(input: {
  action: string;
  outcome: ActivityOutcome;
  entityType: string;
  entityId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, JsonValue>;
}) {
  const payload = {
    ts: new Date().toISOString(),
    ...input,
    metadata: input.metadata ?? {},
  };

  const prefix = `[ACTIVITY] ${input.action} ${input.outcome}`;
  if (input.outcome === "error") {
    console.error(prefix, JSON.stringify(payload));
    return;
  }

  console.info(prefix, JSON.stringify(payload));
}
