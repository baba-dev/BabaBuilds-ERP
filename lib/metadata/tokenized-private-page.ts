import type { Metadata } from "next";

type TokenizedPrivateMetadataInput = {
  title: string;
  description: string;
};

/**
 * Metadata policy for tokenized private pages (e.g. /invite/[token], /p/[token], /invoices/public/[token]).
 *
 * Rules:
 * 1) Never define alternates.canonical for tokenized routes.
 * 2) Always set robots to noindex/nofollow.
 * 3) Keep title/description generic and never include token or sensitive private details.
 */
export function getTokenizedPrivatePageMetadata({
  title,
  description,
}: TokenizedPrivateMetadataInput): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
  };
}
