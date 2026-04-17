"use client";

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TAX_IMPORT_TEMPLATE_TYPES, type TaxImportTemplateType } from '@/lib/tax/import-templates';

const ENTITY_TYPES = [
  { value: 'RETURN_ACKNOWLEDGMENT', label: 'Return acknowledgment' },
  { value: 'WITHHOLDING_CERTIFICATE', label: 'Withholding certificate' },
  { value: 'TAX_PAYMENT_PROOF', label: 'Tax payment proof' },
] as const;

const RELATIONS = [
  { value: 'ACKNOWLEDGMENT', label: 'Acknowledgment' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'PROOF', label: 'Proof' },
  { value: 'EVIDENCE', label: 'Evidence' },
] as const;

type TaxLink = {
  id: string;
  relation: string;
  entityType: string;
  entityKey: string;
  notes: string | null;
  document: {
    id: string;
    title: string;
    category: string;
    status: string;
  };
};

export function TaxComplianceOps() {
  const [entityType, setEntityType] = useState<string>('RETURN_ACKNOWLEDGMENT');
  const [entityKey, setEntityKey] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [relation, setRelation] = useState('ACKNOWLEDGMENT');
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState<TaxLink[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);

  const [templateType, setTemplateType] = useState<TaxImportTemplateType>('WITHHOLDING_CERTIFICATES');
  const [sourceName, setSourceName] = useState('manual-entry.csv');
  const [jsonRows, setJsonRows] = useState('[\n  {"certificateNumber":"WHT-2026-001","issuerName":"ABC Payer LLC"}\n]');
  const [isPersisting, setIsPersisting] = useState(false);

  const activeEntityLabel = useMemo(() => {
    return ENTITY_TYPES.find((item) => item.value === entityType)?.label ?? entityType;
  }, [entityType]);

  const loadLinks = async () => {
    if (!entityKey.trim()) {
      toast.error('Enter an entity key to fetch linked documents.');
      return;
    }

    setIsLoadingLinks(true);
    try {
      const params = new URLSearchParams({ entityType, entityKey: entityKey.trim() });
      const res = await fetch(`/api/tax/document-links?${params.toString()}`, { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || 'Failed to load tax links');

      setLinks(Array.isArray(payload?.links) ? payload.links : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load links');
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const attachLink = async () => {
    if (!entityKey.trim() || !documentId.trim()) {
      toast.error('entity key and document id are required.');
      return;
    }

    setIsLinking(true);
    try {
      const res = await fetch('/api/tax/document-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          entityKey: entityKey.trim(),
          documentId: documentId.trim(),
          relation,
          notes,
        }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || 'Failed to attach tax link');

      toast.success(payload?.acknowledgment?.message ?? 'Tax link saved');
      setDocumentId('');
      setNotes('');
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to attach link');
    } finally {
      setIsLinking(false);
    }
  };

  const removeLink = async (linkId: string) => {
    try {
      const res = await fetch('/api/tax/document-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId }),
      });
      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || 'Failed to remove link');
      toast.success(payload?.acknowledgment?.message ?? 'Tax link removed');
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove link');
    }
  };

  const downloadTemplate = async (type: TaxImportTemplateType) => {
    try {
      const res = await fetch(`/api/tax/import/templates?template=${type}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to download template');
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `tax-import-${type.toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download template');
    }
  };

  const persistDiagnostics = async () => {
    setIsPersisting(true);
    try {
      const parsed = JSON.parse(jsonRows) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('JSON rows must be a non-empty array');
      }

      const rows = parsed.map((rawData, index) => ({ rowNumber: index + 1, rawData }));
      const res = await fetch('/api/tax/import/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateType, sourceName, rows }),
      });

      const payload = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(payload?.error || 'Failed to persist import diagnostics');

      const counts = payload?.acknowledgment?.batch;
      toast.success(
        `${payload?.acknowledgment?.message ?? 'Diagnostics saved'} (${counts?.successCount ?? 0} success / ${counts?.errorCount ?? 0} error)`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to persist diagnostics');
    } finally {
      setIsPersisting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tax document links</CardTitle>
          <CardDescription>Attach vault documents to return acknowledgments, certificates, and payment proofs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label>Tax entity type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Entity key (period/reference)</Label>
            <Input value={entityKey} onChange={(e) => setEntityKey(e.target.value)} placeholder="FY2025-Q4 / CERT-001 / CHALLAN-456" />
          </div>
          <div className="grid gap-2">
            <Label>Vault document id</Label>
            <Input value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="clx..." />
          </div>
          <div className="grid gap-2">
            <Label>Relation</Label>
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELATIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional audit notes" />
          </div>
          <div className="flex gap-2">
            <Button onClick={attachLink} disabled={isLinking}>{isLinking ? 'Saving…' : 'Attach link'}</Button>
            <Button variant="outline" onClick={loadLinks} disabled={isLoadingLinks}>{isLoadingLinks ? 'Loading…' : 'Load links'}</Button>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{activeEntityLabel} · {entityKey || 'No key selected'}</p>
            <div className="mt-2 space-y-2">
              {links.length === 0 ? <p className="text-muted-foreground">No links loaded.</p> : links.map((link) => (
                <div key={link.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                  <div>
                    <p className="font-medium">{link.document.title}</p>
                    <p className="text-xs text-muted-foreground">{link.document.category} · {link.document.status}</p>
                    <Badge variant="outline" className="mt-1">{link.relation}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void removeLink(link.id)}>Remove</Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax import templates & diagnostics</CardTitle>
          <CardDescription>Download starter templates and persist row-level import diagnostics in TaxImportBatch/TaxImportRow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TAX_IMPORT_TEMPLATE_TYPES.map((type) => (
              <Button key={type} type="button" variant="outline" onClick={() => void downloadTemplate(type)}>
                {type.replaceAll('_', ' ')}
              </Button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Template type</Label>
            <Select value={templateType} onValueChange={(value) => setTemplateType(value as TaxImportTemplateType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAX_IMPORT_TEMPLATE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Source file label</Label>
            <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Rows JSON</Label>
            <Textarea rows={8} value={jsonRows} onChange={(e) => setJsonRows(e.target.value)} />
          </div>

          <Button onClick={persistDiagnostics} disabled={isPersisting}>{isPersisting ? 'Persisting…' : 'Persist diagnostics'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
