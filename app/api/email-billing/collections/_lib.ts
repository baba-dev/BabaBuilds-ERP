import { NextResponse } from 'next/server';
import { CollectionError } from '@/lib/email-billing/collections';

/** Parses a YYYY-MM-DD (or ISO) day; blank means today. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function collectionErrorResponse(error: unknown, context: string) {
  if (error instanceof CollectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(`Email hosting ${context} failed:`, error);
  return NextResponse.json({ error: 'Something went wrong. Nothing was changed unless a message says otherwise.' }, { status: 500 });
}
