import { getTranslations } from "next-intl/server";

type MarketingFaqJsonLdProps = {
  /** Root message namespace containing `seoFaq.items`, e.g. `LandingFreeErp` */
  messageRoot: string;
};

export default async function MarketingFaqJsonLd({ messageRoot }: MarketingFaqJsonLdProps) {
  const t = await getTranslations(`${messageRoot}.seoFaq`);
  const faqItems = (t.raw("items") as Array<{ question: string; answer: string }>).filter(
    (item): item is { question: string; answer: string } =>
      Boolean(item) && typeof item.question === "string" && typeof item.answer === "string",
  );
  if (faqItems.length === 0) return null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
    />
  );
}
