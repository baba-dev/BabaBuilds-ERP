import type { Prisma } from "@prisma/client";

/** Prisma include used everywhere a service is returned to the catalog UI. */
export const SERVICE_INCLUDE = {
  nicCode: true,
  sacCode: true,
  _count: { select: { proposalItems: true, retainerItems: true } },
} satisfies Prisma.ServiceTemplateInclude;

type ServiceWithCounts = Prisma.ServiceTemplateGetPayload<{ include: typeof SERVICE_INCLUDE }>;

/** Adds `usage` for the catalog UI; the rest of the shape is unchanged (callers read it as an array). */
export function withUsage(service: ServiceWithCounts) {
  const { _count, ...rest } = service;
  return { ...rest, usage: { proposals: _count.proposalItems, retainers: _count.retainerItems } };
}
