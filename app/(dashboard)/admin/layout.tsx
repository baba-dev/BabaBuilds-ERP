import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // STRICT LOCKOUT: Case-insensitive check
  if (session?.user?.email?.toLowerCase() !== "admin@bababuilds.com") {
    redirect("/"); // Instantly bounce unauthorized users
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 selection:bg-indigo-500/30">
      {children}
    </div>
  );
}