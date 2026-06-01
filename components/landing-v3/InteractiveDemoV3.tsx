"use client";

import { useState } from "react";
import { m, AnimatePresence, LazyMotion, domAnimation } from "framer-motion";
import { Check, Link as LinkIcon, Send, DollarSign, BellRing, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

export default function InteractiveDemoV3() {
  const t = useTranslations("LandingV3.InteractiveDemo");
  const [clientName, setClientName] = useState("Acme Corp");
  const [amount, setAmount] = useState("1500");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [demoState, setDemoState] = useState<"idle" | "generating" | "success">("idle");
  const [copied, setCopied] = useState(false);

  const isValid = clientName.trim().length > 0 && Number(amount) > 0;

  const handleGenerate = () => {
    if (!isValid) return;
    setDemoState("generating");
    setTimeout(() => {
      setDemoState("success");
    }, 2000);
  };

  const resetDemo = () => {
    setDemoState("idle");
    setCopied(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText("pay.bababuilds.com/inv-1x9a");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount) || 0);

  return (
    <section className="bg-zinc-50 py-24 dark:bg-zinc-900/50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {t("title1")} <br />
            <span className="text-orange-600 dark:text-orange-500">{t("title2")}</span>
          </h2>
          <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-300">
            {t("subtitle")}
          </p>
        </div>

        <LazyMotion features={domAnimation}>
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid md:grid-cols-2">
              <div className="border-b border-zinc-200 p-8 dark:border-zinc-800 md:border-b-0 md:border-r">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t("createInvoice")}</h3>
                  {demoState === "success" && (
                    <Button variant="ghost" size="sm" onClick={resetDemo} className="text-xs">
                      {t("resetDemo")}
                    </Button>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="clientName">{t("clientName")}</Label>
                    <Input
                      id="clientName"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      disabled={demoState !== "idle"}
                      className="h-12 rounded-xl dark:bg-zinc-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">{t("amount")}</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={demoState !== "idle"}
                        className="h-12 rounded-xl pl-12 dark:bg-zinc-900"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="space-y-0.5">
                      <Label className="text-base font-bold">{t("autoReminders")}</Label>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("autoRemindersDesc")}</p>
                    </div>
                    <Switch
                      checked={remindersEnabled}
                      onCheckedChange={setRemindersEnabled}
                      disabled={demoState !== "idle"}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={demoState !== "idle" || !isValid}
                    className="h-14 w-full rounded-xl bg-zinc-900 text-lg font-bold text-white hover:bg-zinc-800 dark:bg-orange-600 dark:hover:bg-orange-700 disabled:opacity-50"
                  >
                    {demoState === "idle" && (
                      <>
                        {t("generateLink")} <Send className="ml-2 h-5 w-5" />
                      </>
                    )}
                    {demoState === "generating" && (
                      <m.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-white"
                      />
                    )}
                    {demoState === "success" && (
                      <>
                        {t("done")} <Check className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="relative flex flex-col items-center justify-center bg-zinc-50 p-8 dark:bg-zinc-900">
                <AnimatePresence mode="wait">
                  {demoState === "idle" && (
                    <m.div
                      key="idle"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex flex-col items-center text-center"
                    >
                      <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                        <LinkIcon className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
                      </div>
                      <p className="font-medium text-zinc-500 dark:text-zinc-400">
                        {t("magicText")}
                      </p>
                    </m.div>
                  )}

                  {demoState === "generating" && (
                    <m.div
                      key="generating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-6"
                    >
                      <div className="flex gap-2">
                        <div className="h-3 w-3 animate-bounce rounded-full bg-orange-500" />
                        <div className="h-3 w-3 animate-bounce rounded-full bg-orange-500 [animation-delay:-0.15s]" />
                        <div className="h-3 w-3 animate-bounce rounded-full bg-orange-500 [animation-delay:-0.3s]" />
                      </div>
                      <p className="font-bold text-zinc-600 dark:text-zinc-300">{t("generating")}</p>
                    </m.div>
                  )}

                  {demoState === "success" && (
                    <m.div
                      key="success"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full space-y-6"
                    >
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-900/20">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-800/50">
                          <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h4 className="text-xl font-black text-emerald-900 dark:text-emerald-50">
                          {t("invoiceSent", { amount: formattedAmount, client: clientName })}
                        </h4>
                        
                        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200/50 bg-white px-3 py-2 dark:border-emerald-800/50 dark:bg-emerald-950">
                          <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                            pay.bababuilds.com/inv-1x9a
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-800"
                            onClick={copyToClipboard}
                          >
                            {copied ? (
                              <><Check className="mr-1 h-3 w-3" /> {t("copied")}</>
                            ) : (
                              <><Copy className="mr-1 h-3 w-3" /> {t("copyLink")}</>
                            )}
                          </Button>
                        </div>
                      </div>

                      {remindersEnabled && (
                        <m.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ delay: 0.3 }}
                          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <BellRing className="h-5 w-5 text-orange-500" />
                            <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{t("scheduledReminders")}</h4>
                          </div>
                          
                          <div className="relative space-y-6 pl-4 before:absolute before:inset-y-0 before:left-1.5 before:w-0.5 before:bg-zinc-100 dark:before:bg-zinc-800">
                            {[
                              { label: t("reminder1"), time: t("pending") },
                              { label: t("reminder2"), time: t("pending") },
                              { label: t("reminder3"), time: t("pending") },
                            ].map((step, i) => (
                              <m.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + i * 0.2 }}
                                className="relative flex items-center gap-4"
                              >
                                <div className="absolute -left-[21px] h-3 w-3 rounded-full border-2 border-orange-500 bg-white dark:bg-zinc-950" />
                                <div className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{step.label}</div>
                                <div className="text-xs font-bold text-orange-600 dark:text-orange-500">{step.time}</div>
                              </m.div>
                            ))}
                          </div>
                        </m.div>
                      )}
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
