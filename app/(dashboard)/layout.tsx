import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import AuthModal from "@/components/AuthModal";
import AIChatbot from "@/components/AIChatbot";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // If no session is found, redirect to the landing page.
  if (!session) {
    redirect("/?auth=required");
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col md:pl-64">
        <main className="flex-1 relative">
          <AuthModal />
          {children}
        </main>
      </div>
      <AIChatbot />
    </div>
  );
}
