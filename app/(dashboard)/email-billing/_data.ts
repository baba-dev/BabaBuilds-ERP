import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { requireModule } from '@/lib/modules';
export async function requireEmailBillingPage(){const session=await getServerSession(authOptions); if(!session?.user?.id||!session.workspaceId)redirect('/login'); await requireModule(session.workspaceId,'MIAB_BILLING'); return session.workspaceId;}
