
export type RichSection = {
  title: string;
  body?: string;
  mediaUrl?: string;
};

/**
 * Parsers the sections and rich media list of a proposal safely, bridging the older
 * declineReason JSON serialization hacks with the dedicated richSections column.
 */
export function parseProposalSections(proposal: any): RichSection[] {
  if (!proposal) return [];

  // 1. If modern richSections JSON exists, use it
  if (proposal.richSections) {
    try {
      const sections = typeof proposal.richSections === 'string'
        ? JSON.parse(proposal.richSections)
        : proposal.richSections;

      if (Array.isArray(sections)) {
        return sections.map((s: any) => ({
          title: String(s.title ?? "").trim(),
          body: typeof s.body === 'string' ? s.body : "",
          mediaUrl: typeof s.mediaUrl === 'string' ? s.mediaUrl : ""
        })).filter(s => s.title.length > 0);
      }
      
      if (sections && Array.isArray(sections.richSections)) {
        return (sections.richSections as any[]).map((s: any) => ({
          title: String(s.title ?? "").trim(),
          body: typeof s.body === 'string' ? s.body : "",
          mediaUrl: typeof s.mediaUrl === 'string' ? s.mediaUrl : ""
        })).filter(s => s.title.length > 0);
      }
    } catch (e) {
      console.error("🚨 Failed parsing richSections:", e);
    }
  }

  // 2. Fallback to parsing declineReason for historical proposals
  if (proposal.declineReason && typeof proposal.declineReason === 'string') {
    const trimmed = proposal.declineReason.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        
        if (parsed && Array.isArray(parsed.richSections)) {
          return parsed.richSections.map((section: any) => ({
            title: String(section.title ?? "").trim(),
            body: typeof section.body === "string" ? section.body : "",
            mediaUrl: typeof section.mediaUrl === "string" ? section.mediaUrl : "",
          })).filter((section: any) => section.title.length > 0);
        }
        
        if (parsed && Array.isArray(parsed.richMedia)) {
          return parsed.richMedia.map((media: any) => ({
            title: String(media.title ?? "").trim(),
            body: "",
            mediaUrl: String(media.url ?? "").trim(),
          })).filter((section: any) => section.title.length > 0);
        }
      } catch {
        // Fallback: declineReason is just a regular string message from client
      }
    }
  }

  return [];
}
