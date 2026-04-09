'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Ban, CheckCircle2, FileWarning, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

export default function OpenFilePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<UiState>('idle');
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 flex items-center justify-center">
      <Card className="max-w-xl w-full border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl">Open file import</CardTitle>
          <CardDescription>{supportedText}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 flex gap-3 items-start">
            {state === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mt-0.5" />}
            {state === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />}
            {state === 'unsupported' && <FileWarning className="w-5 h-5 text-amber-500 mt-0.5" />}
            {state === 'permissionDenied' && <Ban className="w-5 h-5 text-rose-500 mt-0.5" />}
            {state === 'error' && <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5" />}
            {state === 'idle' && <UploadCloud className="w-5 h-5 text-zinc-500 mt-0.5" />}

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{statusText}</p>
              {selectedFileName && <p className="text-xs text-zinc-500 mt-1">File: {selectedFileName}</p>}
            </div>
          </div>

          {(state === 'unsupported' || state === 'permissionDenied') && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{supportedText}</p>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium">Choose file manually</label>
            <input
              type="file"
              className="w-full text-sm"
              accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
              onChange={onManualFileSelect}
            />
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
