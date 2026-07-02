import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('invoices.edit'); if('response'in auth)return auth.response; const {id}=await params; const existing=await prisma.mailBillingSubscription.findFirst({where:{id,workspaceId:auth.workspaceId}}); if(!existing)return NextResponse.json({error:'Not found'},{status:404}); return NextResponse.json({subscription:await prisma.mailBillingSubscription.update({where:{id},data:{billingStatus:'CANCELLED'}})});}
