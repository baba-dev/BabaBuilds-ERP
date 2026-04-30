import type { Metadata } from "next";
import ResellerLandingClient from "./reseller-landing-client";

export const metadata: Metadata = {
  title: "برنامج موزعي BabaBuilds ERP",
  description:
    "انضم إلى برنامج موزعي BabaBuilds ERP. قدّم خصومات للعملاء في السنة الأولى، واكسب عمولات، واحصل على دعم تمكين الشركاء.",
  alternates: {
    canonical: "https://erp.bababuilds.com/reseller",
  },
};

export default function ResellerPage() {
  return <ResellerLandingClient />;
}
