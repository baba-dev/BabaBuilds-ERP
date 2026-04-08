"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react"; 
import { UserCircle, Globe, Bell, Save, ShieldCheck, Mail, Clock, LayoutDashboard, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { GEOGRAPHY_DB } from "@/lib/geography";
import { getCurrencySymbol } from "@/lib/currency";

const uniqueCurrencies = Array.from(new Set(Object.values(GEOGRAPHY_DB).map(g => g.currency))).sort();
const uniqueLocales = Array.from(new Set(Object.values(GEOGRAPHY_DB).map(g => g.locale))).sort();

export default function ProfileSettingsPage() {
  const { update } = useSession(); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    theme: "system",
    dateFormat: "DD/MM/YYYY",
    timeZone: "Asia/Kolkata",
    locale: "en-IN",
    currencyFormat: "INR",
    defaultLandingPage: "/dashboard",
    transactionalAlerts: true,
    marketingEmails: false,
    weeklyReport: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && theme) {
      setFormData((prev) => ({ ...prev, theme }));
    }
  }, [theme, mounted]);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          const cleanedData = Object.fromEntries(
            Object.entries(data).map(([key, val]) => [key, val ?? ""])
          );
          delete cleanedData.theme;
          setFormData((prev) => ({ ...prev, ...cleanedData }));
        }
      })
      .catch(() => toast.error("Failed to load profile data."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const toastId = toast.loading("Saving personal preferences...");

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await update(); 
        toast.success("Profile updated successfully.", { id: toastId });
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || "Failed to save profile.", { id: toastId });
      }
    } catch (err) {
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const CustomToggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      aria-label={label}
      title={label}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
        checked ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-800"
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );

  const selectClass = "flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50";

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center transition-colors duration-300">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="text-center space-y-2 mb-10">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/20 mb-6">
            <UserCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            User & Personal Settings
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
            Manage your personal identity, invoice templates, and regional preferences across the ERP.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* 2. REGIONAL & DISPLAY PREFERENCES */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
             {/* ... KEEP YOUR EXISTING REGIONAL CONTENT HERE ... */}
             <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Globe className="w-5 h-5 text-indigo-600" /> Regional & Display
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">UI Theme</Label>
                  <select value={formData.theme} onChange={(e) => { const newTheme = e.target.value; setFormData({ ...formData, theme: newTheme }); setTheme(newTheme); }} className={selectClass}>
                    <option value="system">System Default</option>
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">Default Landing Page</Label>
                  <div className="relative">
                    <LayoutDashboard className="absolute left-3 top-3 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <select value={formData.defaultLandingPage} onChange={(e) => setFormData({ ...formData, defaultLandingPage: e.target.value })} className={`${selectClass} pl-9`}>
                      <option value="/dashboard">Dashboard</option>
                      <option value="/invoice">New Invoice</option>
                      <option value="/clients">Client CRM</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">Time Zone</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <select value={formData.timeZone} onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })} className={`${selectClass} pl-9`}>
                      <option value="Asia/Kolkata">India Standard Time (IST)</option>
                      <option value="Asia/Dubai">Gulf Standard Time (GST)</option>
                      <option value="Europe/London">Greenwich Mean Time (GMT)</option>
                      <option value="America/New_York">Eastern Time (US & Canada)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">Date Format</Label>
                  <select value={formData.dateFormat} onChange={(e) => setFormData({ ...formData, dateFormat: e.target.value })} className={selectClass}>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">Currency Display</Label>
                  <select value={formData.currencyFormat} onChange={(e) => setFormData({ ...formData, currencyFormat: e.target.value })} className={selectClass}>
                    {uniqueCurrencies.map(c => (
                      <option key={c} value={c}>{c} ({getCurrencySymbol(c)})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">Number Locale (Commas)</Label>
                  <select value={formData.locale} onChange={(e) => setFormData({ ...formData, locale: e.target.value })} className={selectClass}>
                    {uniqueLocales.map(l => (
                      <option key={l} value={l}>
                        {l} (e.g. {new Intl.NumberFormat(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(100000)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. NOTIFICATIONS */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            {/* ... KEEP YOUR EXISTING NOTIFICATIONS CONTENT HERE ... */}
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Bell className="w-5 h-5 text-amber-500" /> Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base dark:text-zinc-200">Transactional Alerts</Label>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Receive emails when invoices are paid or retainers execute.</p>
                </div>
                <CustomToggle label="Toggle transactional email alerts" checked={formData.transactionalAlerts} onChange={() => setFormData({ ...formData, transactionalAlerts: !formData.transactionalAlerts })} />
              </div>
              <Separator className="dark:bg-zinc-800" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base dark:text-zinc-200">Weekly AI Report</Label>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Get a Monday morning summary of your financial health.</p>
                </div>
                <CustomToggle label="Toggle weekly performance report emails" checked={formData.weeklyReport} onChange={() => setFormData({ ...formData, weeklyReport: !formData.weeklyReport })} />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-6 flex items-center justify-end gap-4 p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-20">
            <Button type="submit" size="lg" className="bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 text-white min-w-[200px]" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Profile</>}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}