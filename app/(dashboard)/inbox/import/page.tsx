import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  isValidShareId,
  loadSharedPayload,
  toSafeHttpUrl,
  type SharedImportFile,
} from '@/lib/uploads/share-target';

const formatter = new Intl.NumberFormat('en-US');

function getDefaultClassification(file: SharedImportFile) {
  if (file.mimeType === 'application/pdf') return 'Proposal attachment';
  return 'Expense';
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
  const payload = isValidShareId(shareId) ? await loadSharedPayload(workspaceId, shareId) : null;
  const sourceUrl = toSafeHttpUrl(payload?.url);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">Share Target Inbox</Badge>
          <CardTitle as="h1">Import shared content</CardTitle>
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
              {sourceUrl ? (
                <p>
                  Source URL:{' '}
                  <a className="text-indigo-600 hover:underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                    {sourceUrl}
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
