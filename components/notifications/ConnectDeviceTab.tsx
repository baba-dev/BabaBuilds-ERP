'use client';

import * as React from 'react';
import {
  MonitorSmartphone,
  Github,
  Smartphone,
  Laptop,
  ArrowRight,
  ExternalLink,
  QrCode,
  MapPin,
  Clock,
  Send,
  MessageSquare,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

type Platform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'desktop';

interface Session {
  id: string;
  ip: string;
  userAgent: string;
  expires: string;
  lastSeen: string;
  isCurrent: boolean;
}

const cardSurfaceClass =
  'rounded-2xl border border-zinc-200/70 bg-white/90 shadow-sm transition-all duration-300 dark:border-zinc-800/60 dark:bg-zinc-900/55 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]';

const glassHeaderClass =
  'relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8 dark:bg-indigo-500/10';

const typography = {
  title: 'text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100',
  subtitle: 'text-sm text-zinc-600 dark:text-zinc-400',
  metadata: 'text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500',
};

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'desktop';
}

function parseUserAgent(ua: string) {
  if (ua.includes('iPhone')) return { name: 'iPhone', icon: <Smartphone className="h-4 w-4" /> };
  if (ua.includes('Android')) return { name: 'Android Device', icon: <Smartphone className="h-4 w-4" /> };
  if (ua.includes('Windows')) return { name: 'Windows PC', icon: <Laptop className="h-4 w-4" /> };
  if (ua.includes('Macintosh')) return { name: 'MacBook', icon: <Laptop className="h-4 w-4" /> };
  return { name: 'Desktop Device', icon: <Laptop className="h-4 w-4" /> };
}

export function ConnectDeviceTab() {
  const [platform, setPlatform] = React.useState<Platform | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(true);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [isSendingLink, setIsSendingLink] = React.useState(false);

  const githubReleaseUrl = 'https://github.com/baba-dev/BabaBuilds-ERP/releases';
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://erp.bababuilds.com';

  const fetchSessions = React.useCallback(async () => {
    try {
      setIsLoadingSessions(true);
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  React.useEffect(() => {
    setPlatform(detectPlatform());
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (id: string) => {
    try {
      setRevokingId(id);
      const res = await fetch(`/api/auth/sessions?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Session revoked successfully');
        setSessions(prev => prev.filter(s => s.id !== id));
      } else {
        toast.error('Failed to revoke session');
      }
    } catch (error) {
      toast.error('An error occurred while revoking session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleSendLink = async (type: 'sms' | 'whatsapp') => {
    if (!phoneNumber) {
       toast.error('Please enter a phone number');
       return;
    }
    setIsSendingLink(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSendingLink(false);
    toast.success(`Install link sent via ${type === 'sms' ? 'SMS' : 'WhatsApp'}!`);
    setPhoneNumber('');
  };

  return (
    <div className="min-w-0 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      
      {/* 1. Million Dollar Header & QR Hand-off */}
      <section className={glassHeaderClass}>
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-[100px]" />
        <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-violet-500/10 blur-[100px]" />
        
        <div className="relative flex flex-col items-center gap-10 @3xl:flex-row @3xl:items-start">
          <div className="min-w-0 w-full flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5">
              <QrCode className="h-4 w-4 text-indigo-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                Instant Mobile Hand-off
              </span>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white @md:text-4xl">
                One Scan. <span className="text-indigo-500">Total Sync.</span>
              </h2>
              <p className="max-w-xl text-lg font-medium text-zinc-600 dark:text-zinc-400">
                Move your entire workspace from desktop to mobile in seconds. Scan the secure token to auto-install and sign in.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
               <Button size="lg" className="h-14 rounded-2xl bg-zinc-900 px-8 font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
                 <Github className="mr-3 h-5 w-5" />
                 Latest GitHub Release
               </Button>
               <Button variant="outline" size="lg" className="h-14 rounded-2xl border-zinc-200 bg-white/50 px-8 font-bold backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                 Manual Setup Guide
               </Button>
            </div>
          </div>

          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto shrink-0 rounded-3xl border border-white/20 bg-white p-6 shadow-2xl @3xl:mx-0 dark:bg-zinc-950"
          >
            <div className="relative">
               <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-white p-2">
                 <QRCodeSVG 
                    value={appUrl} 
                    size={176}
                    level="H"
                    includeMargin={false}
                    imageSettings={{
                      src: "/favicon.ico",
                      x: undefined,
                      y: undefined,
                      height: 32,
                      width: 32,
                      excavate: true,
                    }}
                 />
               </div>
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                 <MonitorSmartphone className="h-24 w-24 text-indigo-500" />
               </div>
            </div>
            <p className="mt-4 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
               Secure Token: Ready
            </p>
          </motion.div>
        </div>
      </section>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={typography.title}>Active Device Manager</h3>
            <p className={typography.subtitle}>Authorized sessions currently accessing your ERP</p>
          </div>
          <Badge variant="outline" className="rounded-lg border-indigo-500/20 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400">
            {sessions.length} Active {sessions.length === 1 ? 'Session' : 'Sessions'}
          </Badge>
        </div>

        <Card className={cardSurfaceClass}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[300px] text-[10px] font-bold uppercase tracking-widest">Device Info</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Network</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingSessions ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-400" />
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {sessions.map((session) => {
                      const { name, icon } = parseUserAgent(session.userAgent);
                      return (
                        <motion.tr
                          key={session.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                {icon}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                  {name}
                                  {session.isCurrent && (
                                    <Badge variant="secondary" className="ml-2 h-4 rounded px-1.5 text-[8px] font-black uppercase">
                                      This Device
                                    </Badge>
                                  )}
                                </p>
                                <p className="max-w-[200px] truncate text-[10px] text-zinc-500">{session.userAgent}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                <MapPin className="h-3 w-3" />
                                {session.ip}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                <Clock className="h-3 w-3" />
                                {new Date(session.expires).toLocaleDateString()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {!session.isCurrent && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevokeSession(session.id)}
                                disabled={revokingId === session.id}
                                className="h-9 w-9 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              >
                                {revokingId === session.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* 4. Push to Device Magic Links */}
      <section className="space-y-6">
        <h3 className={typography.title}>Send Install Link to Device</h3>
        <div className="grid grid-cols-1 gap-6 @md:grid-cols-2 @5xl:grid-cols-3">
          
          <Card className={cn(cardSurfaceClass, '@5xl:col-span-2')}>
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-8 @md:flex-row @md:items-start">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 shrink-0">
                  <Send className="h-8 w-8" />
                </div>
                <div className="min-w-0 w-full flex-1 space-y-6">
                  <div>
                    <h4 className="text-xl font-black text-zinc-900 dark:text-white">Push to Phone</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Get the secure link sent via SMS or WhatsApp for zero-friction setup.</p>
                  </div>
                  
                  <div className="flex flex-col gap-3 @sm:flex-row">
                    <div className="relative flex-1">
                      <Input 
                        placeholder="+1 (555) 000-0000" 
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="h-12 rounded-xl border-zinc-200 bg-zinc-50/50 pl-10 dark:border-zinc-800 dark:bg-zinc-900/50"
                      />
                      <Smartphone className="absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400" />
                    </div>
                    <div className="flex gap-3">
                       <Button 
                          onClick={() => handleSendLink('sms')}
                          disabled={isSendingLink}
                          className="h-12 rounded-xl bg-zinc-900 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
                        >
                         {isSendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send SMS'}
                       </Button>
                       <Button 
                          variant="outline" 
                          onClick={() => handleSendLink('whatsapp')}
                          disabled={isSendingLink}
                          className="h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                        >
                         <MessageSquare className="mr-2 h-4 w-4 text-emerald-500" />
                         WhatsApp
                       </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cardSurfaceClass}>
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  <ExternalLink className="h-5 w-5 text-zinc-400" />
                </div>
                <h4 className="font-bold text-zinc-900 dark:text-white">Manual Links</h4>
              </div>
              <div className="space-y-2">
                <Button variant="ghost" className="w-full justify-between h-10 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                   <span className="text-xs font-medium">Download Android APK</span>
                   <ArrowRight className="h-3 w-3" />
                </Button>
                <Button variant="ghost" className="w-full justify-between h-10 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                   <span className="text-xs font-medium">View iOS Installation Guide</span>
                   <ArrowRight className="h-3 w-3" />
                </Button>
                <Button variant="ghost" className="w-full justify-between h-10 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                   <span className="text-xs font-medium">Windows Desktop Build</span>
                   <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </section>

      {/* Footer Branding */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-200/80 pt-6 @md:flex-row dark:border-zinc-800/50">
        <div className="flex items-center gap-2">
           <Badge className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg">PRO</Badge>
           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Enterprise Sync Active</span>
        </div>
        <div className="flex gap-6">
           <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors">Documentation</a>
           <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors">Privacy Policy</a>
           <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors">Support</a>
        </div>
      </div>
    </div>
  );
}
