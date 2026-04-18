"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Command, Zap, ShieldCheck, Wallet, SunMoon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { openAIChat } from "@/src/stores/ui/aiChatStore";

const SAMPLE_PROMPTS = [
  "How much did I spend on SEO last quarter?",
  "Show overdue receivables older than 30 days",
  "Which clients owe me the most?",
  "Summarize compliance risks this week",
  "Why did revenue drop this month?",
  "Show unreconciled transactions needing attention"
];

const THEME_CHIP_QUERY =
  "Switch my UI theme to dark mode (or light mode). You can do this instantly, or manually via Settings → Profile → Regional & Display → UI Theme (/settings/profile).";

const SUGGESTION_CHIPS = [
  { label: "Overdue receivables", icon: <Wallet className="w-3 h-3" /> },
  { label: "Cash flow summary", icon: <Zap className="w-3 h-3" /> },
  { label: "Tax compliance", icon: <ShieldCheck className="w-3 h-3" /> },
  {
    label: "Change to dark mode / light mode",
    query: THEME_CHIP_QUERY,
    icon: <SunMoon className="w-3 h-3" />,
  },
];

export function DashboardAIPromptBar() {
  const [prompt, setPrompt] = useState("");
  const [sampleIndex, setSampleIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSampleIndex((prev) => (prev + 1) % SAMPLE_PROMPTS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    
    openAIChat({ query: prompt.trim(), autoSubmit: true });
    setPrompt("");
  };

  const handleChipClick = (chip: (typeof SUGGESTION_CHIPS)[number]) => {
    openAIChat({ query: chip.query ?? chip.label, autoSubmit: true });
  };

  return (
    <div className="relative group">
      {/* Background Glow Effect (focus-driven, not hover-driven) */}
      <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/15 via-amber-500/15 to-orange-500/15 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 motion-reduce:transition-none transition-opacity duration-500 pointer-events-none" />
      
      <div className="relative space-y-3">
        {/* Header Label */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
             <div className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 dark:bg-orange-600 text-white shadow-lg shadow-orange-500/20">
              <Sparkles className="w-3 h-3" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
              Ask BabaBuilds AI
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50">
            <Command className="w-2.5 h-2.5 text-zinc-400" />
            <span className="text-[9px] font-bold text-zinc-500 tracking-tighter">AI READY</span>
          </div>
        </div>

        {/* Input Surface */}
        <form onSubmit={handleSubmit} className="relative group/form">
          <div className="relative flex items-center">
            <Input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder=""
              className={cn(
                "h-12 pl-4 pr-12 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/60",
                "focus-visible:ring-orange-500/30 focus-visible:border-orange-500/50",
                "rounded-xl text-sm font-medium transition-all duration-300",
                "group-hover/form:bg-white dark:group-hover/form:bg-zinc-900 group-hover/form:border-orange-500/30"
              )}
            />
            
            {/* Animated Sample Prompts */}
            <AnimatePresence mode="wait">
              {!prompt && (
                <motion.div
                  key={sampleIndex}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  className="absolute left-4 pointer-events-none text-zinc-400 dark:text-zinc-500 text-sm font-medium"
                >
                  {SAMPLE_PROMPTS[sampleIndex]}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!prompt.trim()}
              className={cn(
                "absolute right-2 p-2 rounded-lg transition-all duration-300",
                prompt.trim() 
                  ? "bg-orange-600 dark:bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-100" 
                  : "text-zinc-300 dark:text-zinc-700 scale-90 opacity-0 pointer-events-none"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleChipClick(chip)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                "bg-white dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/60 text-zinc-500",
                "hover:border-orange-500/30 hover:bg-orange-50/50 dark:hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400"
              )}
            >
              {chip.icon}
              {chip.label}
            </button>
          ))}
          <div className="ml-auto text-[9px] font-bold text-zinc-400/60 uppercase tracking-tighter">
            Query runs automatically
          </div>
        </div>
      </div>
    </div>
  );
}
