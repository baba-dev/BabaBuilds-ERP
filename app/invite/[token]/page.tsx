import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role, getMaxUsersForPlan } from "@/lib/permissions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const BASE_URL = "https://erp.bababuilds.com";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;

  return {
    title: "Workspace Invite",
    description: "Private workspace invitation acceptance page.",
    alternates: {
      canonical: `${BASE_URL}/invite/${token}`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function InviteAcceptancePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: { include: { users: true, workspaceInvites: true } } }
  });

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-rose-500">Invalid or Expired Invite</h1>
          <p className="mt-2">This invitation uses an invalid token or has expired.</p>
        </div>
      </div>
    );
  }

  if (invite.expiresAt < new Date()) {
    // Optionally delete expired invite here
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-rose-500">Invite Expired</h1>
          <p className="mt-2">This invitation has expired. Please ask the sender for a new one.</p>
        </div>
      </div>
    );
  }

  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    // Not logged in -> Redirect to sign in/up page with callback to this URL
    redirect(`/api/auth/signin?callbackUrl=/invite/${token}`);
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email || "" } });

  if (!user || user.email !== invite.email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-rose-500">Wrong Account</h1>
          <p className="mt-2">This invite was sent to {invite.email}, but you are signed in as {session.user.email}.</p>
          <a href="/api/auth/signout" className="text-indigo-500 underline mt-4 inline-block">Sign out and switch accounts</a>
        </div>
      </div>
    );
  }

  // Check limits again before insertion (in case they downgraded or filled the spot)
  const currentMemberCount = invite.workspace.users.length;
  const maxUsers = getMaxUsersForPlan(invite.workspace.planTier);

  if (currentMemberCount >= maxUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-rose-500">Workspace is Full</h1>
          <p className="mt-2">The workspace "{invite.workspace.name}" has reached its maximum user limit.</p>
        </div>
      </div>
    );
  }

  // Accept Invite: Add user to WorkspaceUser, delete Invite
  await prisma.$transaction([
    prisma.workspaceUser.create({
      data: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        role: invite.role,
      }
    }),
    prisma.workspaceInvite.delete({
      where: { id: invite.id }
    })
  ]);

  // Optionally set this as their active workspace if needed
  // ...
  
  redirect("/");
}
