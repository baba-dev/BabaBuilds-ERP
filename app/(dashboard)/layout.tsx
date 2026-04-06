import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AIChatbot from "@/components/AIChatbot";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/?auth=required");
  }

  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      <AIChatbot />
    </>
  );
}
