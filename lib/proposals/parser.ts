
export type RichSection = {
  title: string;
  body?: string;
  mediaUrl?: string;
};

type ProposalSectionSource = {
  richSections?: unknown;
  richMedia?: unknown;
  declineReason?: unknown;
} | null | undefined;

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  value && typeof value === "object" ? (value as RawRecord) : {};

const toSection = (raw: unknown): RichSection => {
  const section = asRecord(raw);
  return {
    title: String(section.title ?? "").trim(),
    body: typeof section.body === "string" ? section.body : "",
    mediaUrl: typeof section.mediaUrl === "string" ? section.mediaUrl : "",
  };
};

const toMediaSection = (raw: unknown): RichSection => {
  const media = asRecord(raw);
  return {
    title: String(media.title ?? "").trim(),
    body: "",
    mediaUrl: String(media.url ?? "").trim(),
  };
};

const hasTitle = (section: RichSection) => section.title.length > 0;

/**
 * Parsers the sections and rich media list of a proposal safely, bridging the older
 * declineReason JSON serialization hacks with the dedicated richSections column.
 */
export function parseProposalSections(proposal: ProposalSectionSource): RichSection[] {
  if (!proposal) return [];

  // 1. If modern richSections JSON exists, use it
  if (proposal.richSections) {
    try {
      const sections: unknown = typeof proposal.richSections === 'string'
        ? JSON.parse(proposal.richSections)
        : proposal.richSections;

      if (Array.isArray(sections)) {
        return sections.map(toSection).filter(hasTitle);
      }

      const nested = asRecord(sections).richSections;
      if (Array.isArray(nested)) {
        return nested.map(toSection).filter(hasTitle);
      }
    } catch (e) {
      console.error("🚨 Failed parsing richSections:", e);
    }
  }

  // 1b. Dedicated media column (media-only proposals).
  if (Array.isArray(proposal.richMedia)) {
    const media = proposal.richMedia.map(toMediaSection).filter(hasTitle);
    if (media.length) return media;
  }

  // 2. Fallback to parsing declineReason for historical proposals
  if (proposal.declineReason && typeof proposal.declineReason === 'string') {
    const trimmed = proposal.declineReason.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = asRecord(JSON.parse(trimmed));

        if (Array.isArray(parsed.richSections)) {
          return parsed.richSections.map(toSection).filter(hasTitle);
        }

        if (Array.isArray(parsed.richMedia)) {
          return parsed.richMedia.map(toMediaSection).filter(hasTitle);
        }
      } catch {
        // Fallback: declineReason is just a regular string message from client
      }
    }
  }

  return [];
}
