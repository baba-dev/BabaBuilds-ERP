import type { ProposalDetailDto } from "@/lib/proposals/types";

export type DraftItem = {
  key: string;
  serviceTemplateId: string | null;
  title: string;
  description: string;
  quantity: string;
  unitPrice: string;
  isOptional: boolean;
  isRecurring: boolean;
};
export type DraftMilestone = { key: string; title: string; amount: string; dueDate: string };
export type DraftSection = { key: string; title: string; body: string; mediaUrl: string };
export type DraftMedia = { key: string; type: "image" | "video"; url: string; title: string };

export type ComposerInitial = {
  clientId: string;
  title: string;
  validUntil: string;
  items: DraftItem[];
  milestones: DraftMilestone[];
  sections: DraftSection[];
  media: DraftMedia[];
};

export type CatalogService = { id: string; name: string; description: string | null; defaultPrice: string | number };
export type ClientOption = { id: string; name: string; email: string | null };

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const blankItem = (): DraftItem => ({ key: newKey(), serviceTemplateId: null, title: "", description: "", quantity: "1", unitPrice: "", isOptional: false, isRecurring: false });

export function dateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function defaultValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return dateInput(d);
}

export function fromDetail(p: ProposalDetailDto): ComposerInitial {
  return {
    clientId: p.clientId,
    title: p.title,
    validUntil: p.validUntil.slice(0, 10),
    items: p.items.map((i) => ({
      key: newKey(),
      serviceTemplateId: i.serviceTemplateId,
      title: i.title,
      description: i.description ?? "",
      quantity: String(i.quantity),
      unitPrice: String(Number(i.unitPrice)),
      isOptional: i.isOptional,
      isRecurring: i.isRecurring,
    })),
    milestones: p.milestones.map((m) => ({ key: newKey(), title: m.title, amount: String(Number(m.amount)), dueDate: m.dueDate ? m.dueDate.slice(0, 10) : "" })),
    sections: p.richSections.map((s) => ({ key: newKey(), title: s.title, body: s.body, mediaUrl: s.mediaUrl })),
    media: p.richMedia.map((m) => ({ key: newKey(), type: m.type, url: m.url, title: m.title })),
  };
}

/** Prefill handed over by the AI assistant's draft_proposal tool (valid for a few seconds). */
export function readAiPayload(clients: ClientOption[]): Partial<ComposerInitial> | null {
  try {
    const raw = sessionStorage.getItem("erp_ai_payload");
    if (!raw) return null;
    const { path, data, timestamp } = JSON.parse(raw) as { path?: string; data?: Record<string, unknown>; timestamp?: number };
    if (!data || !timestamp || Date.now() - timestamp > 15_000 || !(path === "/proposals" || path === "/proposals/new")) return null;
    const out: Partial<ComposerInitial> = {};
    if (typeof data.title === "string") out.title = data.title;
    if (Array.isArray(data.items) && data.items.length) {
      out.items = data.items.map((raw) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return {
          key: newKey(),
          serviceTemplateId: typeof item.serviceTemplateId === "string" && item.serviceTemplateId ? item.serviceTemplateId : null,
          title: String(item.title ?? ""),
          description: String(item.description ?? ""),
          quantity: String(Math.max(1, Math.round(Number(item.quantity) || 1))),
          unitPrice: String(Number(item.unitPrice) || ""),
          isOptional: false,
          isRecurring: false,
        };
      });
    }
    if (typeof data.clientName === "string") {
      const needle = data.clientName.toLowerCase();
      const match = clients.find((c) => c.name.toLowerCase().includes(needle));
      if (match) out.clientId = match.id;
    }
    return out;
  } catch {
    return null;
  }
}
