"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Repeat, Sparkles, Loader2, Info } from "lucide-react";
import { format, addMonths } from "date-fns";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { getErrorMessage } from "@/lib/error-utils";

type RetainerItemInput = {
  title: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  serviceTemplateId?: string;
};

type FormData = {
  clientId: string;
  frequency: string;
  autoAppendMonth: boolean;
  nextBillingDate: string;
  items: RetainerItemInput[];
};

type BuilderClient = { id: string; name: string };
type BuilderCatalogItem = {
  id: string;
  name: string;
  defaultPrice: number | string;
  sacCode?: { igstRate?: number } | null;
};

interface RetainerBuilderProps {
  clients: BuilderClient[];
  catalog: BuilderCatalogItem[];
  onSuccess: () => void;
  onCancel: () => void;
  defaultClient?: string;
  defaultService?: string;
}

export default function RetainerBuilder({ clients, catalog, onSuccess, onCancel, defaultClient, defaultService }: RetainerBuilderProps) {
  const t = useTranslations('Retainers');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, control, handleSubmit, watch, setValue } = useForm<FormData>({
    defaultValues: {
      clientId: defaultClient || "",
      frequency: "MONTHLY",
      autoAppendMonth: true,
      nextBillingDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
      items: [{
        title: "",
        quantity: 1,
        unitPrice: 0,
        serviceTemplateId: defaultService || ""
      }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const formValues = watch();

  const handleServiceSelect = (index: number, serviceId: string) => {
    const service = catalog.find((s) => s.id === serviceId);
    if (service) {
      setValue(`items.${index}.serviceTemplateId`, service.id);
      setValue(`items.${index}.title`, service.name);
      setValue(`items.${index}.unitPrice`, Number(service.defaultPrice));
      setValue(`items.${index}.taxRate`, service.sacCode?.igstRate || 0);
    }
  };

  const calculateMRR = () => {
    let multiplier = 1;
    if (formValues.frequency === "QUARTERLY") multiplier = 1/3;
    if (formValues.frequency === "ANNUALLY") multiplier = 1/12;
    
    const subtotal = formValues.items.reduce((sum: number, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
    return subtotal * multiplier;
  };

  const calculateProration = () => {
    // Basic conceptual proration for visual only
    const date = new Date(formValues.nextBillingDate);
    const day = date.getDate();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const subtotal = formValues.items.reduce((sum: number, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
    if (day > 1) {
      const remainingDays = daysInMonth - day + 1;
      return (subtotal / daysInMonth) * remainingDays;
    }
    return null;
  };

  const mrr = calculateMRR();
  const arr = mrr * 12;
  const proration = calculateProration();

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Configuring Retainer Engine...");
    try {
      const payload = {
        clientId: data.clientId,
        frequency: data.frequency,
        autoAppendMonth: data.autoAppendMonth,
        nextBillingDate: new Date(data.nextBillingDate).toISOString(),
        items: data.items.map(i => ({
          title: i.title,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          taxRate: Number(i.taxRate) || 0,
          serviceTemplateId: i.serviceTemplateId || null
        }))
      };

      const res = await fetch('/api/retainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to create retainer");

      toast.success("Retainer activated successfully!", { id: toastId });
      onSuccess();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="shadow-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden relative">
      {/* Sticky MRR Impact Widget */}
      <div className="absolute top-4 right-4 hidden md:flex flex-col items-end gap-1 p-3 bg-gradient-to-br from-indigo-50 to-emerald-50 dark:from-indigo-900/20 dark:to-emerald-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl shadow-sm z-10">
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{t('mrr_impact')}</span>
        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">${mrr.toFixed(2)}</span>
        <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('arr', { currency: '$', amount: arr.toFixed(2) })}</span>
      </div>

      <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-emerald-500 w-full" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="p-6 md:p-8 space-y-8">

          {/* Section 1: Client & Config */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
            <div className="space-y-2 md:col-span-1">
              <Label className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t('select_client_builder')}</Label>
              <Select value={formValues.clientId} onValueChange={(v) => setValue('clientId', v)} required>
                <SelectTrigger className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-11 font-bold shadow-sm">
                  <SelectValue placeholder={t('select_client_builder_ph')} />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-1">
              <Label className="text-zinc-700 dark:text-zinc-300 font-bold text-xs uppercase tracking-widest">{t('billing_freq')}</Label>
              <Select value={formValues.frequency} onValueChange={(v) => setValue('frequency', v)}>
                <SelectTrigger className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-11 font-bold shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="ANNUALLY">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label className="text-zinc-700 dark:text-zinc-300 font-bold text-xs uppercase tracking-widest">{t('first_invoice_date')}</Label>
              <Input
                type="date"
                {...register('nextBillingDate')}
                required
                className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 h-11 font-bold shadow-sm"
              />
            </div>
          </div>

          {/* Proration Alert */}
          {proration !== null && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800/50 text-sm font-medium">
              <Info className="w-5 h-5" />
              <div>
                <strong>{t('mid_month_start')}</strong> <span dangerouslySetInnerHTML={{ __html: t('prorated_msg', { currency: '$', amount: proration.toFixed(2) }) }} />
              </div>
            </div>
          )}

          {/* Section 2: Multi-Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('recurring_services')}</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ title: "", quantity: 1, unitPrice: 0 })} className="text-xs font-bold uppercase">
                <Plus className="w-4 h-4 mr-1" /> {t('btn_add_item')}
              </Button>
            </div>

            {fields.map((field, index: number) => (
              <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="col-span-12 md:col-span-4 space-y-2">
                  <Label className="text-xs font-bold uppercase text-zinc-500">{t('col_service_template')}</Label>
                  <Select value={formValues.items[index]?.serviceTemplateId || ""} onValueChange={(v) => handleServiceSelect(index, v)}>
                    <SelectTrigger className="bg-white dark:bg-zinc-950 h-10 font-medium">
                      <SelectValue placeholder={t('custom_service')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">{t('custom_service_opt')}</SelectItem>
                      {catalog?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-12 md:col-span-4 space-y-2">
                  <Label className="text-xs font-bold uppercase text-zinc-500">{t('col_description')}</Label>
                  <Input {...register(`items.${index}.title` as const)} placeholder={t('ph_description')} required className="bg-white dark:bg-zinc-950 h-10" />
                </div>

                <div className="col-span-4 md:col-span-1 space-y-2">
                  <Label className="text-xs font-bold uppercase text-zinc-500">{t('col_qty')}</Label>
                  <Input type="number" min="1" {...register(`items.${index}.quantity` as const)} required className="bg-white dark:bg-zinc-950 h-10 text-center" />
                </div>

                <div className="col-span-6 md:col-span-2 space-y-2">
                  <Label className="text-xs font-bold uppercase text-zinc-500">{t('col_unit_price')}</Label>
                  <Input type="number" step="0.01" min="0" {...register(`items.${index}.unitPrice` as const)} required className="bg-white dark:bg-zinc-950 h-10" />
                </div>

                <div className="col-span-2 md:col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" className="h-10 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => remove(index)} disabled={fields.length === 1}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Section 3: Smart Naming Toggle */}
          <div className={`p-5 rounded-xl border-2 transition-all duration-300 ${formValues.autoAppendMonth ? 'border-purple-300 dark:border-purple-500/50 bg-purple-50/30 dark:bg-purple-900/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-extrabold uppercase tracking-wider text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Sparkles className={`w-4 h-4 ${formValues.autoAppendMonth ? 'text-purple-600' : 'text-zinc-400'}`} />
                  Smart Invoice Naming
                </Label>
                <p className="text-xs text-zinc-500">Automatically appends the billing month to invoice line items (e.g., &quot;SEO Services (June 2026)&quot;).</p>
              </div>
              <Switch checked={formValues.autoAppendMonth} onCheckedChange={(v) => setValue('autoAppendMonth', v)} className="data-[state=checked]:bg-purple-600" />
            </div>
          </div>

        </CardContent>
        <CardFooter className="bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 p-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} className="uppercase text-xs font-bold tracking-widest px-6 h-12">Cancel</Button>
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-widest text-xs h-12 px-8 shadow-sm transition-all" disabled={isSubmitting}>
            {isSubmitting ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Configuring</span> : <span className="flex items-center gap-2"><Repeat className="w-4 h-4" /> Activate Retainer</span>}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
