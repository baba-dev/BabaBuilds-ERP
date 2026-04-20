type DistLogPayload = Record<string, string | number | boolean | null | undefined>;

export function logDistributorEvent(event: string, payload: DistLogPayload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...payload });
  console.info(`[distributor] ${line}`);
}
