import { logActivity as secureLogActivity } from '@/lib/security/activity-log';

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
  secureLogActivity({
    action: input.action,
    status: input.outcome === "error" ? "FAILURE" : "SUCCESS",
    workspaceId: input.workspaceId ?? null,
    actor: {
        userId: input.actorId,
        email: input.actorEmail,
    },
    entity: {
        type: input.entityType,
        id: input.entityId,
    },
    metadata: input.metadata as Record<string, unknown>,
  }).catch(err => console.error("Failed to default proxy logActivity:", err));
}
