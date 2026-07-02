import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { fetchMailBillingInventory } from '@/lib/email-billing/miab-client';
import { requireEmailBilling } from '../../../_lib/auth';
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('workspace.manage_settings'); if('response'in auth)return auth.response; const {id}=await params; const server=await prisma.mailBillingServer.findFirst({where:{id,workspaceId:auth.workspaceId}}); if(!server)return NextResponse.json({error:'Not found'},{status:404}); const inventory=await fetchMailBillingInventory({baseUrl:server.baseUrl,accessMode:server.accessMode as any,token:server.encryptedToken?decrypt(server.encryptedToken):undefined}); return NextResponse.json({ok:true,domains:inventory.domains.length,mailboxes:inventory.domains.reduce((n,d)=>n+d.mailboxes.length,0)});}
