'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Ban, CheckCircle2, FileWarning, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ImportFlow = 'expenses' | 'invoices' | 'reconciliation';
type UiState = 'idle' | 'processing' | 'success' | 'unsupported' | 'permissionDenied' | 'error';

type ImportResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
  redirectTo?: string;
};

declare global {
  interface Window {
    launchQueue?: {
      setConsumer: (consumer: (launchParams: { files: FileSystemFileHandle[] }) => void | Promise<void>) => void;
    };
  }
}

const supportedText = 'Supported files: .pdf, .csv, .xlsx, .png, .jpg';

export default function OpenFilePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<UiState>('idle');
  const [isDragActive, setIsDragActive] = useState(false);
  const initialStatus = typeof window !== 'undefined' && !window.launchQueue?.setConsumer
    ? 'No launched file detected. You can still choose a file manually.'
    : 'Waiting for launched file...';
  const [statusText, setStatusText] = useState<string>(initialStatus);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [redirectTo, setRedirectTo] = useState<string>('');

  const preferredFlow = useMemo(() => {
    const raw = searchParams.get('flow');
    return raw === 'expenses' || raw === 'invoices' || raw === 'reconciliation' ? (raw as ImportFlow) : undefined;
  }, [searchParams]);

  const importFile = async (file: File, flow?: ImportFlow) => {
    setState('processing');
    setSelectedFileName(file.name);
    setStatusText(`Importing ${file.name}...`);

    const formData = new FormData();
    formData.append('file', file);
    if (flow) formData.append('flow', flow);

    try {
      const res = await fetch('/api/open-file', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as ImportResponse;

      if (!res.ok) {
        if (res.status === 403 || data.code === 'PERMISSION_DENIED') {
          setState('permissionDenied');
          setStatusText('Permission denied. Please sign in to import files.');
          return;
        }

        if (res.status === 415 || data.code?.includes('UNSUPPORTED')) {
          setState('unsupported');
          setStatusText(data.error || 'Unsupported file type for this import flow.');
          return;
        }

        setState('error');
        setStatusText(data.error || 'Failed to import launched file.');
        return;
      }

      setState('success');
      setStatusText(data.message || 'File imported successfully.');
      setRedirectTo(data.redirectTo || '');
    } catch {
      setState('error');
      setStatusText('Could not reach import endpoint. Please try again.');
    }
  };

  useEffect(() => {
    if (!window.launchQueue?.setConsumer) {
      return;
    }

    window.launchQueue.setConsumer(async (launchParams) => {
      const fileHandle = launchParams.files?.[0];
      if (!fileHandle) {
        setStatusText('No file was provided by the launcher.');
        return;
      }

      try {
        const file = await fileHandle.getFile();
        await importFile(file, preferredFlow);
      } catch {
        setState('permissionDenied');
        setStatusText('Permission denied while opening the launched file handle.');
      }
    });
  }, [preferredFlow]);

  const onManualFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importFile(file, preferredFlow);
  };

  const isProcessing = state === 'processing';

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 flex items-center justify-center">
      <Card className="max-w-xl w-full border-zinc-200 dark:border-zinc-800">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-2xl">Open file import</CardTitle>
          <CardDescription>{supportedText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex gap-3 items-start">
            {state === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mt-0.5" />}
            {state === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />}
            {state === 'unsupported' && <FileWarning className="w-5 h-5 text-amber-500 mt-0.5" />}
            {state === 'permissionDenied' && <Ban className="w-5 h-5 text-rose-500 mt-0.5" />}
            {state === 'error' && <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5" />}
            {state === 'idle' && <UploadCloud className="w-5 h-5 text-zinc-500 mt-0.5" />}

            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{statusText}</p>
              {selectedFileName && <p className="text-xs text-zinc-500">File: {selectedFileName}</p>}
            </div>
          </div>

          {(state === 'unsupported' || state === 'permissionDenied') && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{supportedText}</p>
          )}

          <div
            className={cn(
              'rounded-lg border-2 border-dashed p-4 transition-colors',
              isDragActive
                ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/30'
                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40',
              isProcessing && 'opacity-60',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isProcessing) setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              if (isProcessing) return;
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void importFile(file, preferredFlow);
              }
            }}
          >
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Choose file manually</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Drag and drop or use the file chooser.</p>
              </div>
              <Input
                id="manual-file-input"
                type="file"
                disabled={isProcessing}
                className="peer sr-only"
                accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
                onChange={onManualFileSelect}
                aria-describedby="manual-file-help"
              />
              <label
                htmlFor="manual-file-input"
                className={cn(
                  'inline-flex h-10 items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors',
                  'focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2',
                  isProcessing
                    ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-500'
                    : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                {isProcessing ? 'Uploading…' : 'Choose file'}
              </label>
              <p id="manual-file-help" className="text-xs text-zinc-500 dark:text-zinc-400">
                Accepted: PDF, CSV, XLSX, PNG, JPG.
              </p>
            </div>
          </div>

          {state === 'success' && redirectTo && (
            <Button className="w-full" onClick={() => router.push(redirectTo)}>
              Continue to mapped flow
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
