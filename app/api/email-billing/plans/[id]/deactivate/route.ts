import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('invoices.edit'); if('response'in auth)return auth.response; const {id}=await params; const plan=await prisma.mailBillingPlan.findFirst({where:{id,workspaceId:auth.workspaceId}}); if(!plan)return NextResponse.json({error:'Not found'},{status:404}); return NextResponse.json({plan:await prisma.mailBillingPlan.update({where:{id},data:{isActive:false}})});}
