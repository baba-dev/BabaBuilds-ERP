import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('invoices.view'); if('response'in auth)return auth.response; const {id}=await params; const domain=await prisma.mailBillingDomain.findFirst({where:{id,workspaceId:auth.workspaceId}}); if(!domain)return NextResponse.json({error:'Not found'},{status:404}); return NextResponse.json({mailboxes:await prisma.mailBillingMailbox.findMany({where:{workspaceId:auth.workspaceId,domainId:id},orderBy:{email:'asc'}})});}
