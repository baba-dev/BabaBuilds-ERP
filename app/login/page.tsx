import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import Link from "next/link";
import { Box } from "lucide-react";
import { normalizeLaunchDestination } from "@/lib/launch-routing";

type LoginPageProps = {
  searchParams?: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = await searchParams;
  const callbackUrl = normalizeLaunchDestination(resolvedSearchParams?.callbackUrl ?? "/dashboard");

  // If already authenticated, go to dashboard
  if (session) {
    redirect(callbackUrl);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background elements for a premium feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-600/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="z-10 w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 justify-center mb-8 group">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
            <Box className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black text-white px-2">BabaBuilds</span>
        </Link>
        
        {/* AuthModal handles its own state and UI */}
        <AuthModal callbackUrl={callbackUrl} />
      </div>

      <div className="mt-8 text-center text-zinc-500 text-xs font-medium space-x-4">
        <Link href="/help" className="hover:text-zinc-300 transition-colors">Documentation</Link>
        <span>&bull;</span>
        <Link href="/help/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
        <span>&bull;</span>
        <Link href="/help/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
      </div>
    </div>
  );
}
