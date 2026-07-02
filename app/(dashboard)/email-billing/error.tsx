'use client';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export default function EmailBillingError({reset}:{error:Error;reset:()=>void}){return <main className="p-6"><Card variant="panel"><CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle aria-hidden className="size-5"/>Failed to load Email Billing</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">The Email Billing view could not be loaded. No secrets or Mail-in-a-Box responses are shown here.</p><Button className="mt-4" onClick={reset}>Try again</Button></CardContent></Card></main>}
