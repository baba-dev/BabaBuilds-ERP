"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { PiggyBank, ShieldPlus, Landmark, TrendingUp, Calculator, AlertCircle, CheckCircle2, Globe2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";

export default function WealthAndTaxPlanner() {
  const t = useTranslations('Tax');
  const [investments, setInvestments] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- GLOBALIZATION ENGINE ---
  const { 
    fCurrency, 
    currency, 
    locale, 
    dateFormat = "dd/MM/yyyy",
    countryCode = "IN",
    taxLabel = "Tax"
  } = useFormat();
  
  const currencySymbol = getCurrencySymbol(currency, locale);
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState("");
  const [assetName, setAssetName] = useState("");
  const [amount, setAmount] = useState("");

  // Tax Settings State
  const [hasSeniorParents, setHasSeniorParents] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/tax') {
          if (data.date) setDate(data.date);
          if (data.category) setCategory(data.category);
          if (data.assetName || data.title) setAssetName(data.assetName || data.title);
          if (data.amount) setAmount(data.amount.toString());
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) { 
        console.error("Failed to parse AI payload"); 
        toast.warning("AI auto-fill failed. Please fill the form manually.");
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      const invRes = await fetch('/api/investments');
      const invData = await invRes.json();
      setInvestments(Array.isArray(invData) ? invData : []);

      const revRes = await fetch('/api/invoices');
      const revData = await revRes.json();
      if (Array.isArray(revData)) {
        const revenue = revData.reduce((sum: number, inv: any) => sum + inv.totalAmount, 0);
        setTotalRevenue(revenue);
      } else {
        setTotalRevenue(0);
      }
    } catch (err) {
      console.error("Failed to load data");
      toast.error("Failed to load tax planner data. Please refresh.");
    } finally {
      setInvestments([]);
      setTotalRevenue(0);
    }
  };

  // --- WEALTH CALCULATIONS (Global) ---
  const totalNetWorth = investments.reduce((sum, inv) => sum + inv.amount, 0);
  
  // --- TAX CALCULATIONS (Indian FY25-26 / AY26-27 Estimation) ---
  // These will safely equal 0 if not used by the UI
  const presumptiveIncome = totalRevenue * 0.5; 

  const raw80C = investments.filter(i => i.category === '80C (LIC, PPF, ELSS)').reduce((sum, i) => sum + i.amount, 0);
  const eligible80C = Math.min(raw80C, 150000);
  const percent80C = (eligible80C / 150000) * 100;

  const raw80D = investments.filter(i => i.category === '80D (Health Insurance)').reduce((sum, i) => sum + i.amount, 0);
  const max80DLimit = hasSeniorParents ? 75000 : 25000;
  const eligible80D = Math.min(raw80D, max80DLimit);

  const calculateOldRegime = (income: number) => {
    const taxable = Math.max(0, income - eligible80C - eligible80D);
    if (taxable <= 500000) return 0; 
    let tax = 0;
    if (taxable > 250000) tax += Math.min(taxable - 250000, 250000) * 0.05;
    if (taxable > 500000) tax += Math.min(taxable - 500000, 500000) * 0.20;
    if (taxable > 1000000) tax += (taxable - 1000000) * 0.30;
    return tax;
  };

  const calculateNewRegime = (income: number) => {
    if (income <= 700000) return 0; 
    let tax = 0;
    if (income > 300000) tax += Math.min(income - 300000, 300000) * 0.05;
    if (income > 600000) tax += Math.min(income - 600000, 300000) * 0.10;
    if (income > 900000) tax += Math.min(income - 900000, 300000) * 0.15;
    if (income > 1200000) tax += Math.min(income - 1200000, 300000) * 0.20;
    if (income > 1500000) tax += (income - 1500000) * 0.30;
    return tax;
  };

  const oldTax = calculateOldRegime(presumptiveIncome);
  const newTax = calculateNewRegime(presumptiveIncome);
  const isOldBetter = oldTax < newTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const toastId = toast.loading("Logging investment...");
    try {
      const res = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, assetName, amount }),
      });
      if (res.ok) {
        setAssetName(""); setAmount(""); setCategory("");
        toast.success("Investment logged successfully.", { id: toastId });
        fetchData();
      } else {
        toast.error("Failed to save investment. Please try again.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="max-w-7xl mx-auto w-full">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title')}</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium text-sm">{t('description', { taxLabel })}</p>
          </div>
        </div>

        {/* TOP ROW: WEALTH & DEDUCTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-indigo-800 dark:text-indigo-400">{t('total_wealth')}</CardTitle>
              <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">{fCurrency(totalNetWorth)}</div>
              <p className="text-xs uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-400/80 mt-1">{t('total_wealth_desc')}</p>
            </CardContent>
          </Card>

          {/* JURISDICTIONAL TOGGLE: Indian 80C vs Global Estimate */}
          {countryCode === "IN" ? (
            <>
              <Card className="shadow-sm border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-zinc-900">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-400">{t('sec_80c')}</CardTitle>
                  <ShieldPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{fCurrency(eligible80C)}</div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      <span>{t('limit_15_lakhs')}</span>
                      <span>{t('utilized', { percent: percent80C.toFixed(0) })}</span>
                    </div>
                    <Progress value={percent80C} className="h-2 bg-zinc-100 dark:bg-zinc-800 [&>div]:bg-emerald-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                 <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('presumptive')}</CardTitle>
                  <Calculator className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{fCurrency(presumptiveIncome)}</div>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mt-1">{t('tax_baseline')}</p>
                </CardContent>
              </Card>
            </>
          ) : (
             <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 md:col-span-2 flex flex-col justify-center items-center p-6 text-center">
                <Globe2 className="w-6 h-6 text-zinc-300 dark:text-zinc-600 mb-2" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('regional_compliance')}</h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-md">{t('regional_desc')}</p>
             </Card>
          )}
        </div>

        {/* MIDDLE ROW: TAX REGIME COMPARATOR (Only show for India) */}
        {countryCode === "IN" && (
          <div className="bg-zinc-900 dark:bg-zinc-950 rounded-xl p-6 text-white shadow-xl border dark:border-zinc-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-amber-400 h-5 w-5" />
                <h2 className="text-lg font-bold tracking-tight">{t('advance_tax')} <span className="text-sm font-medium text-zinc-400 ml-2">{t('fy_estimate')}</span></h2>
              </div>
              <div className="flex items-center gap-3 bg-zinc-800/50 dark:bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-700 dark:border-zinc-800">
                <input
                  type="checkbox"
                  id="seniorParents"
                  checked={hasSeniorParents}
                  onChange={(e) => setHasSeniorParents(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-500 bg-zinc-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 accent-indigo-500"
                />
                <Label htmlFor="seniorParents" className="text-xs font-bold uppercase tracking-wider text-zinc-300 cursor-pointer">
                  {t('include_parents')}
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className={`p-4 rounded-lg border transition-colors ${isOldBetter ? 'border-emerald-500 bg-emerald-950/30' : 'border-zinc-800 dark:border-zinc-800/50 bg-zinc-900/50'}`}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-zinc-400 font-bold text-xs uppercase tracking-widest">{t('old_regime')}</h3>
                  {isOldBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                </div>
                <div className="text-3xl font-bold mb-1">{fCurrency(oldTax)}</div>
                <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">{t('old_regime_desc', { amount: fCurrency(eligible80C + eligible80D) })}</p>
              </div>
              
              <div className={`p-4 rounded-lg border transition-colors ${!isOldBetter ? 'border-emerald-500 bg-emerald-950/30' : 'border-zinc-800 dark:border-zinc-800/50 bg-zinc-900/50'}`}>
                 <div className="flex justify-between items-start mb-2">
                  <h3 className="text-zinc-400 font-bold text-xs uppercase tracking-widest">{t('new_regime')}</h3>
                  {!isOldBetter && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                </div>
                <div className="text-3xl font-bold mb-1">{fCurrency(newTax)}</div>
                <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">{t('new_regime_desc')}</p>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM ROW: FORM & LEDGER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <CardHeader className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 pb-6 rounded-t-xl">
                <CardTitle className="text-xl font-bold tracking-tight dark:text-zinc-50">{t('log_asset')}</CardTitle>
                <CardDescription className="dark:text-zinc-400 text-xs font-medium mt-1">{t('log_asset_desc')}</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit} className="bg-zinc-50/50 dark:bg-zinc-950/50">
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('date')}</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark] font-bold text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('asset_class')}</Label>
                    <Select value={category} onValueChange={setCategory} required>
                      <SelectTrigger className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold text-xs">
                        <SelectValue placeholder={t('select_type')} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        {countryCode === "IN" && (
                          <>
                            <SelectItem value="80C (LIC, PPF, ELSS)" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">80C (LIC, PPF, ELSS)</SelectItem>
                            <SelectItem value="80D (Health Insurance)" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">80D (Health Insurance)</SelectItem>
                          </>
                        )}
                        <SelectItem value="Equity / Mutual Funds" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Equity / Mutual Funds</SelectItem>
                        <SelectItem value="Fixed Deposit (FD)" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Fixed Deposit (FD)</SelectItem>
                        <SelectItem value="Gold / Precious Metals" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Gold / Precious Metals</SelectItem>        
                        <SelectItem value="Cash / Savings Account" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold">Cash / Savings Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('description_label')}</Label>
                    <Input placeholder="e.g., Vanguard S&amp;P 500" value={assetName} onChange={(e) => setAssetName(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">{t('amount_label', { currency: currency })}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 dark:text-zinc-400 font-bold text-sm">{currencySymbol}</span>
                      <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1" className="pl-8 bg-white dark:bg-zinc-950 dark:border-zinc-800 font-bold dark:text-indigo-400 text-indigo-700" />
                    </div>
                  </div>
                </CardContent>
                <div className="p-4 bg-white dark:bg-zinc-900 border-t dark:border-zinc-800 rounded-b-xl">
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 text-xs font-bold uppercase tracking-widest" disabled={isSubmitting}>
                    {t('add_to_portfolio')}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-8">
             <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 h-full bg-white dark:bg-zinc-900">
              <CardHeader className="border-b border-zinc-200 dark:border-zinc-800">
                <CardTitle className="dark:text-zinc-50 text-sm font-bold uppercase tracking-wider">{t('asset_ledger')}</CardTitle>
                <CardDescription className="dark:text-zinc-400 text-xs font-medium">{t('ledger_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50 dark:bg-zinc-900/80">
                      <TableRow className="dark:border-zinc-800 hover:bg-transparent">
                        <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_date')}</TableHead>
                        <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_asset')}</TableHead>
                        <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_category')}</TableHead>
                        <TableHead className="text-right dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_amount', { currency: currency })}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.map((inv) => (
                        <TableRow key={inv.id} className="dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <TableCell className="text-xs font-medium dark:text-zinc-300">{format(new Date(inv.date), safeDateFormat)}</TableCell>
                          <TableCell className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{inv.assetName}</TableCell>
                          <TableCell>
                            <span className={`text-xs uppercase tracking-wider px-2 py-1 rounded-md font-bold ${
                              inv.category.includes('80C') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              inv.category.includes('80D') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                              inv.category.includes('Gold') ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50' :
                              'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}>
                              {inv.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-bold text-sm text-indigo-700 dark:text-indigo-400">
                            {fCurrency(inv.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {investments.length === 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={4} className="text-center py-12 text-zinc-400 dark:text-zinc-500 border-b-0 text-xs font-bold uppercase tracking-widest">
                            {t('no_assets')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}