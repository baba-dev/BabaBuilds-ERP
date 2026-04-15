import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cash Flow · BabaBuilds ERP",
  robots: { index: false, follow: false },
};

export default function CashFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}

