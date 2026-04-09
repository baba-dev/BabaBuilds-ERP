export type ProtocolLaunchEvent = {
  count: number;
  lastSeenAt: string;
  outcome: "success" | "failure";
  scheme: string;
  entityType: string;
  reason: string;
};

function getProtocolObservabilityStore() {
  const globalStore = globalThis as typeof globalThis & {
    __protocolLaunchCounts?: Map<string, ProtocolLaunchEvent>;
  };

  if (!globalStore.__protocolLaunchCounts) {
    globalStore.__protocolLaunchCounts = new Map<string, ProtocolLaunchEvent>();
  }

  return globalStore.__protocolLaunchCounts;
}

export function recordProtocolLaunch(input: {
  outcome: "success" | "failure";
  scheme: string;
  entityType: string;
  reason: string;
}) {
  const store = getProtocolObservabilityStore();
  const key = `${input.outcome}::${input.scheme}::${input.entityType}::${input.reason}`;
  const current = store.get(key);

  store.set(key, {
    count: (current?.count || 0) + 1,
    lastSeenAt: new Date().toISOString(),
    outcome: input.outcome,
    scheme: input.scheme,
    entityType: input.entityType,
    reason: input.reason,
  });
}

export function getProtocolLaunchMetrics() {
  return Array.from(getProtocolObservabilityStore().values()).sort((a, b) => b.count - a.count);
}
