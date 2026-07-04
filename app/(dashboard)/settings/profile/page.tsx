"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react"; 
import { startRegistration } from "@simplewebauthn/browser";
import { UserCircle, Globe, Bell, Save, ShieldCheck, Clock, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isPasskeySaving, setIsPasskeySaving] = useState(false);
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
    } catch {
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPasskey = async () => {
    if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
      toast.error("Passkeys are not available in this browser. Try Safari, Chrome, Edge, or your mobile PWA.");
      return;
    }

    setIsPasskeySaving(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkeys/register/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Unable to start passkey setup.");
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const payload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) throw new Error(payload.error || "Unable to save this passkey.");
      toast.success("Passkey added to this device.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey setup was cancelled or failed.");
    } finally {
      setIsPasskeySaving(false);
    }
  };

  const handlePasswordSave = async () => {
    setIsPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Unable to update password.");
      setPasswordForm({ currentPassword: "", newPassword: "" });
      toast.success("Password updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const selectTriggerClass = "h-10 w-full rounded-md border-zinc-200 bg-white text-zinc-900 focus-visible:ring-indigo-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";

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
    <div className="min-h-screen bg-zinc-50 px-4 py-6 transition-colors duration-300 dark:bg-zinc-950 md:px-8 md:py-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
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
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">UI Theme</Label>
                  <Select
                    value={formData.theme}
                    onValueChange={(newTheme) => {
                      setFormData({ ...formData, theme: newTheme });
                      setTheme(newTheme);
                    }}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System Default</SelectItem>
                      <SelectItem value="light">Light Mode</SelectItem>
                      <SelectItem value="dark">Dark Mode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">Default Landing Page</Label>
                  <div className="relative">
                    <LayoutDashboard className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <Select
                      value={formData.defaultLandingPage}
                      onValueChange={(value) => setFormData({ ...formData, defaultLandingPage: value })}
                    >
                      <SelectTrigger className={`${selectTriggerClass} pl-9`}>
                        <SelectValue placeholder="Select landing page" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/dashboard">Dashboard</SelectItem>
                        <SelectItem value="/invoice">New Invoice</SelectItem>
                        <SelectItem value="/clients">Client CRM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">Time Zone</Label>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <Select
                      value={formData.timeZone}
                      onValueChange={(value) => setFormData({ ...formData, timeZone: value })}
                    >
                      <SelectTrigger className={`${selectTriggerClass} pl-9`}>
                        <SelectValue placeholder="Select time zone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Kolkata">India Standard Time (IST)</SelectItem>
                        <SelectItem value="Asia/Dubai">Gulf Standard Time (GST)</SelectItem>
                        <SelectItem value="Europe/London">Greenwich Mean Time (GMT)</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">Date Format</Label>
                  <Select
                    value={formData.dateFormat}
                    onValueChange={(value) => setFormData({ ...formData, dateFormat: value })}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">Currency Display</Label>
                  <Select
                    value={formData.currencyFormat}
                    onValueChange={(value) => setFormData({ ...formData, currencyFormat: value })}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCurrencies.map(c => (
                        <SelectItem key={c} value={c}>{c} ({getCurrencySymbol(c)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium dark:text-zinc-300">Number Locale (Commas)</Label>
                  <Select
                    value={formData.locale}
                    onValueChange={(value) => setFormData({ ...formData, locale: value })}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue placeholder="Select locale" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueLocales.map(l => (
                        <SelectItem key={l} value={l}>
                          {l} (e.g. {new Intl.NumberFormat(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(100000)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            <CardContent className="space-y-6 p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base dark:text-zinc-200">Transactional Alerts</Label>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Receive emails when invoices are paid or retainers execute.</p>
                </div>
                <Switch
                  aria-label="Toggle transactional email alerts"
                  checked={formData.transactionalAlerts}
                  onCheckedChange={(checked) => setFormData({ ...formData, transactionalAlerts: checked })}
                />
              </div>
              <Separator className="dark:bg-zinc-800" />
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-base dark:text-zinc-200">Weekly AI Report</Label>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Get a Monday morning summary of your financial health.</p>
                </div>
                <Switch
                  aria-label="Toggle weekly performance report emails"
                  checked={formData.weeklyReport}
                  onCheckedChange={(checked) => setFormData({ ...formData, weeklyReport: checked })}
                />
              </div>
            </CardContent>
          </Card>



          <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Passkeys</CardTitle>
              <CardDescription>Add a passkey to this device for the fastest phishing-resistant login path across mobile PWA, desktop Chrome/Edge, Windows Hello/PIN, and Safari.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">Use Face ID, Touch ID, Android screen lock, Windows Hello, or a hardware security key instead of typing a password.</p>
              <Button type="button" variant="outline" onClick={handleAddPasskey} disabled={isPasskeySaving} className="w-full sm:w-auto">
                {isPasskeySaving ? "Adding passkey..." : "Add passkey to this device"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /> Password sign-in</CardTitle>
              <CardDescription>Set or change your password. High-risk roles still need phishing-resistant MFA/passkey policy coverage.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="Required when changing an existing password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="At least 12 characters" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="button" variant="outline" onClick={handlePasswordSave} disabled={isPasswordSaving || passwordForm.newPassword.length < 12}>
                  {isPasswordSaving ? "Saving..." : "Update password"}
                </Button>
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
