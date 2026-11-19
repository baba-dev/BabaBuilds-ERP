import type { ReactNode } from "react";
import LandingFooter from "@/components/LandingFooter";
import LandingNavbar from "@/components/LandingNavbar";

export default function FeaturesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-base">
      <LandingNavbar sectionPath="/" />
      <main className="pt-24">{children}</main>
      <LandingFooter sectionPath="/" />
    </div>
  );
}
