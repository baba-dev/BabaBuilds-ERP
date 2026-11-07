import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type SharedImportFile = {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  publicUrl: string;
  relativePath?: string;
};

type SharedImportPayload = {
  id: string;
  createdAt: string;
  source: 'web-share-target';
  title: string | null;
  text: string | null;
  url: string | null;
  files: SharedImportFile[];
};

const formatter = new Intl.NumberFormat('en-US');

function getDefaultClassification(file: SharedImportFile) {
  if (file.mimeType === 'application/pdf') return 'Proposal attachment';
  return 'Expense';
}

async function loadSharedPayload(workspaceId: string, shareId: string): Promise<SharedImportPayload | null> {
  const payloadPath = path.join(process.cwd(), 'tmp', 'share-target', workspaceId, `${shareId}.json`);

  if (!fs.existsSync(payloadPath)) return null;

  try {
    const raw = fs.readFileSync(payloadPath, 'utf-8');
    const parsed = JSON.parse(raw) as SharedImportPayload;
    // Ensure previews always hit the protected route even if older payloads used a public path.
    const files = Array.isArray(parsed.files)
      ? parsed.files.map((file) => {
          const url = typeof file.publicUrl === 'string' ? file.publicUrl : '';
          if (url.startsWith('/uploads/share-target/')) return file;
          if (typeof file.relativePath === 'string' && file.relativePath.startsWith('/uploads/share-target/')) {
            return { ...file, publicUrl: file.relativePath };
          }
          return file;
        })
      : [];
    return { ...parsed, files };
  } catch {
    return null;
  }
}

export default async function SharedImportPage({
  searchParams,
}: {
  searchParams: Promise<{ shareId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  if (!workspaceId) {
    redirect('/login?callbackUrl=/inbox/import');
  }

  const { shareId } = await searchParams;
  const payload = shareId ? await loadSharedPayload(workspaceId, shareId) : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">Share Target Inbox</Badge>
          <CardTitle>Import shared content</CardTitle>
          <CardDescription>
            Review incoming files and classify each item before adding it to Expenses, Clients, or Proposals.
          </CardDescription>
        </CardHeader>
      </Card>

      {!payload ? (
        <Card>
          <CardHeader>
            <CardTitle>No shared payload found</CardTitle>
            <CardDescription>
              Use your device share sheet and choose BabaBuilds ERP to send text, links, images, or PDFs here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{payload.title || 'Untitled shared item'}</CardTitle>
              <CardDescription>
                Received {new Date(payload.createdAt).toLocaleString()} · {payload.files.length} file(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              {payload.text ? <p>{payload.text}</p> : null}
              {payload.url ? (
                <p>
                  Source URL:{' '}
                  <a className="text-indigo-600 hover:underline" href={payload.url} target="_blank" rel="noreferrer">
                    {payload.url}
                  </a>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {payload.files.map((file) => (
              <Card key={`${file.publicUrl}-${file.fieldName}`}>
                <CardHeader>
                  <CardTitle className="text-base">{file.originalName}</CardTitle>
                  <CardDescription>
                    {file.mimeType} · {formatter.format(file.size)} bytes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor={`class-${file.originalName}`}>
                      Classification
                    </label>
                    <select
                      id={`class-${file.originalName}`}
                      defaultValue={getDefaultClassification(file)}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option>Expense</option>
                      <option>Client attachment</option>
                      <option>Proposal attachment</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <a href={file.publicUrl} target="_blank" rel="noreferrer">Preview</a>
                    </Button>
                    <Button>Queue for import</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
