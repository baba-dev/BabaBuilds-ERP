import { NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { syncMailBillingServer } from '@/lib/email-billing/sync';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireEmailBilling('workspace.manage_settings'); if('response'in auth)return auth.response; try{const {id}=await params; const summary=await syncMailBillingServer({workspaceId:auth.workspaceId,serverId:id,actorUserId:auth.userId,request:req}); return NextResponse.json(summary);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Sync failed'},{status:400});}}
