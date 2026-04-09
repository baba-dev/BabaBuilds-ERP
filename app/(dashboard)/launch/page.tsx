import { redirect } from "next/navigation";
import { recordProtocolLaunch } from "@/lib/protocol-observability";

type LaunchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ALLOWED_SCHEMES = new Set(["web+erp:", "web+bababuilds-erp:"]);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,64}$/;

type EntityType = "client" | "invoice" | "proposal";

const ENTITY_ROUTE_MAP: Record<EntityType, string> = {
  client: "/clients",
  invoice: "/ledger",
  proposal: "/proposals",
};

function resolveEntityType(url: URL): EntityType | null {
  const hostEntity = url.hostname.toLowerCase();
  if (hostEntity === "client" || hostEntity === "invoice" || hostEntity === "proposal") {
    return hostEntity;
  }

  const [resource] = url.pathname.split("/").filter(Boolean);
  if (resource === "client" || resource === "invoice" || resource === "proposal") {
    return resource;
  }

  return null;
}

function resolveRecordId(url: URL): string | null {
  const pathParts = url.pathname.split("/").filter(Boolean);
  const hostEntity = url.hostname.toLowerCase();
  const pathEntity = pathParts[0]?.toLowerCase();

  let candidateId = "";
  if (hostEntity === "client" || hostEntity === "invoice" || hostEntity === "proposal") {
    candidateId = pathParts[0] ?? "";
  } else if (pathEntity === "client" || pathEntity === "invoice" || pathEntity === "proposal") {
    candidateId = pathParts[1] ?? "";
  }

  if (!candidateId || !SAFE_ID_PATTERN.test(candidateId)) {
    return null;
  }

  return candidateId;
}

function protocolFailureRedirect(reason: string, scheme = "unknown", entityType = "unknown"): never {
  recordProtocolLaunch({
    outcome: "failure",
    scheme,
    entityType,
    reason,
  });
  redirect(`/dashboard?protocolError=${encodeURIComponent(reason)}`);
}

export default async function ProtocolLaunchPage({ searchParams }: LaunchPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawUrlParam = resolvedSearchParams.url;
  const rawUrl = Array.isArray(rawUrlParam) ? rawUrlParam[0] : rawUrlParam;

  if (!rawUrl || rawUrl.length > 512) {
    protocolFailureRedirect("missing_or_too_large_url");
  }

  const safeRawUrl = rawUrl;
  let parsed: URL;
  try {
    parsed = new URL(safeRawUrl);
  } catch {
    protocolFailureRedirect("invalid_url_format");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    protocolFailureRedirect("unsupported_scheme", parsed.protocol);
  }

  const entityType = resolveEntityType(parsed);
  if (!entityType) {
    protocolFailureRedirect("unsupported_entity", parsed.protocol, "unknown");
  }

  const recordId = resolveRecordId(parsed);
  if (!recordId) {
    protocolFailureRedirect("invalid_record_id", parsed.protocol, entityType);
  }

  const destination = ENTITY_ROUTE_MAP[entityType];
  const params = new URLSearchParams({
    protocolRecord: recordId,
    protocolEntity: entityType,
    protocolScheme: parsed.protocol.replace(":", ""),
  });

  recordProtocolLaunch({
    outcome: "success",
    scheme: parsed.protocol,
    entityType,
    reason: "accepted",
  });

  redirect(`${destination}?${params.toString()}`);
}
