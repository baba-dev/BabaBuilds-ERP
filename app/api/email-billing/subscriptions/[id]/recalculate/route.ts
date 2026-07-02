import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('invoices.edit'); if('response'in auth)return auth.response; const {id}=await params; const sub=await prisma.mailBillingSubscription.findFirst({where:{id,workspaceId:auth.workspaceId},include:{domain:true,plan:true,retainer:{include:{items:true}}}}); if(!sub)return NextResponse.json({error:'Not found'},{status:404}); const calculation=calculateMailBilling({plan:sub.plan,subscription:sub,syncedMailboxCount:sub.domain.mailboxCount,domain:sub.domain.domain}); return NextResponse.json({calculation});}
