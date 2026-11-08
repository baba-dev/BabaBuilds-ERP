export type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  longDescription?: string | null;
  defaultPrice: number | string;
  imageUrl?: string | null;
  nicCode?: { id?: string; code: string; description: string } | null;
  sacCode?: { id?: string; code: string; description: string; igstRate: number } | null;
  usage?: { proposals: number; retainers: number };
};

export type ServiceSort = "name" | "priceDesc" | "priceAsc" | "used";

export const priceOf = (s: ServiceItem) => Number(s.defaultPrice) || 0;
export const usageOf = (s: ServiceItem) => (s.usage?.proposals ?? 0) + (s.usage?.retainers ?? 0);

export function sortServices(list: ServiceItem[], sort: ServiceSort): ServiceItem[] {
  const copy = [...list];
  switch (sort) {
    case "priceDesc":
      return copy.sort((a, b) => priceOf(b) - priceOf(a) || a.name.localeCompare(b.name));
    case "priceAsc":
      return copy.sort((a, b) => priceOf(a) - priceOf(b) || a.name.localeCompare(b.name));
    case "used":
      return copy.sort((a, b) => usageOf(b) - usageOf(a) || a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function filterServices(list: ServiceItem[], query: string): ServiceItem[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return list;
  return list.filter((s) =>
    [s.name, s.description ?? "", s.sacCode?.code ?? "", s.nicCode?.code ?? ""].some((field) => field.toLocaleLowerCase().includes(q)),
  );
}
