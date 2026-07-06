"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Lock, ShieldCheck, Smartphone, Trash2, Chrome, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type SecurityState = {
  email: string | null;
  password: { configured: boolean; updatedAt: string | null };
  google: { connected: boolean; accounts: { id: string; providerAccountId: string }[] };
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null; deviceType: string | null; backedUp: boolean; transports: string | null }[];
  sessions: { strategy: string; activeDatabaseSessions: { id: string; expires: string }[] };
  guardrails: { loginMethodCount: number; canDisconnectGoogle: boolean };
};

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export default function AccountSecurityPage() {
  const [data, setData] = useState<SecurityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPasskey, setSavingPasskey] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [renames, setRenames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const state = (await readJson(await fetch("/api/settings/security", { cache: "no-store" }))) as SecurityState;
      setData(state);
      setRenames(Object.fromEntries(state.passkeys.map((passkey) => [passkey.id, passkey.name])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load account security.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loginMethods = useMemo(() => [
    { label: "Password", connected: Boolean(data?.password.configured), icon: Lock, detail: data?.password.configured ? `Updated ${formatDate(data.password.updatedAt)}` : "No password set" },
    { label: "Google", connected: Boolean(data?.google.connected), icon: Chrome, detail: data?.google.connected ? `${data.google.accounts.length} Google account${data.google.accounts.length === 1 ? "" : "s"} connected` : "Not connected" },
    { label: "Passkeys", connected: Boolean(data?.passkeys.length), icon: KeyRound, detail: `${data?.passkeys.length ?? 0} registered` },
  ], [data]);

  async function updatePassword() {
    setSavingPassword(true);
    try {
      await readJson(await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwordForm) }));
      toast.success(data?.password.configured ? "Password changed." : "Password set.");
      setPasswordForm({ currentPassword: "", newPassword: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function addPasskey() {
    if (!window.PublicKeyCredential) {
      toast.error("This browser does not support passkeys.");
      return;
    }
    setSavingPasskey(true);
    try {
      const options = await readJson(await fetch("/api/auth/passkeys/register/options", { method: "POST" }));
      const credential = await startRegistration({ optionsJSON: options });
      await readJson(await fetch("/api/auth/passkeys/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) }));
      toast.success("Passkey added.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add passkey.");
    } finally {
      setSavingPasskey(false);
    }
  }

  async function renamePasskey(id: string) {
    try {
      await readJson(await fetch(`/api/settings/security/passkeys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renames[id] }) }));
      toast.success("Passkey renamed.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to rename passkey.");
    }
  }

  async function deletePasskey(id: string) {
    try {
      await readJson(await fetch(`/api/settings/security/passkeys/${id}`, { method: "DELETE" }));
      toast.success("Passkey deleted.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete passkey.");
    }
  }

  async function disconnectGoogle() {
    try {
      await readJson(await fetch("/api/settings/security/google", { method: "DELETE" }));
      toast.success("Google disconnected.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disconnect Google.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-orange-600">Settings</p>
          <h1 className="text-3xl font-bold tracking-tight">Account security</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage sign-in methods for {data?.email || "your account"}. At least one usable login method must remain connected.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {loginMethods.map(({ label, connected, icon: Icon, detail }) => (
          <Card key={label}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-orange-600" /><Badge variant={connected ? "default" : "secondary"}>{connected ? "Connected" : "Not set"}</Badge></div>
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription>{loading ? "Loading..." : detail}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Password</CardTitle><CardDescription>Set or change the password used by email/password sign-in.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {data?.password.configured && <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} /></div>}
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} placeholder="At least 12 characters with letters and numbers" /></div>
          <div className="sm:col-span-2"><Button onClick={() => void updatePassword()} disabled={savingPassword || passwordForm.newPassword.length < 12}>{savingPassword ? "Saving..." : data?.password.configured ? "Change password" : "Set password"}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Passkeys</CardTitle><CardDescription>Use Face ID, Touch ID, Windows Hello, Android screen lock, or a hardware security key.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => void addPasskey()} disabled={savingPasskey}><Smartphone className="mr-2 h-4 w-4" />{savingPasskey ? "Adding passkey..." : "Add passkey"}</Button>
          <Separator />
          {data?.passkeys.length ? data.passkeys.map((passkey) => (
            <div key={passkey.id} className="rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="space-y-2"><Label htmlFor={`passkey-${passkey.id}`}>Passkey name</Label><Input id={`passkey-${passkey.id}`} value={renames[passkey.id] || ""} onChange={(e) => setRenames((prev) => ({ ...prev, [passkey.id]: e.target.value }))} /></div>
                <Button variant="outline" onClick={() => void renamePasskey(passkey.id)}><Pencil className="mr-2 h-4 w-4" />Rename</Button>
                <Button variant="destructive" onClick={() => void deletePasskey(passkey.id)} disabled={(data.guardrails.loginMethodCount ?? 0) <= 1}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Created {formatDate(passkey.createdAt)} · Last used {formatDate(passkey.lastUsedAt)} · {passkey.deviceType || "unknown device"}{passkey.backedUp ? " · synced" : ""}</p>
            </div>
          )) : <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Chrome className="h-5 w-5" />Google sign-in</CardTitle><CardDescription>Connect OAuth sign-in. Google can only be disconnected when password or a passkey remains.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => void signIn("google", { callbackUrl: "/settings/security" })} disabled={data?.google.connected}>Connect Google</Button>
          <Button variant="outline" onClick={() => void disconnectGoogle()} disabled={!data?.google.connected || !data?.guardrails.canDisconnectGoogle}>Disconnect Google</Button>
          {!data?.guardrails.canDisconnectGoogle && <p className="basis-full text-sm text-amber-600">Add another sign-in method before disconnecting Google.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Active sessions</CardTitle><CardDescription>This app uses {data?.sessions.strategy.toUpperCase() || "JWT"} sessions. Database session rows are shown when available.</CardDescription></CardHeader>
        <CardContent>{data?.sessions.activeDatabaseSessions.length ? <ul className="space-y-2 text-sm">{data.sessions.activeDatabaseSessions.map((session) => <li key={session.id}>Session expires {formatDate(session.expires)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No database-backed sessions are active for this JWT session configuration.</p>}</CardContent>
      </Card>
    </main>
  );
}
