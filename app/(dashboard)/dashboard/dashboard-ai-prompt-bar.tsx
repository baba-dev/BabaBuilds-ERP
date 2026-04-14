"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Command, ArrowRight, Zap, ShieldCheck, Wallet } from "lucide-react";
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

const SUGGESTION_CHIPS = [
  { label: "Overdue receivables", icon: <Wallet className="w-3 h-3" /> },
  { label: "Cash flow summary", icon: <Zap className="w-3 h-3" /> },
  { label: "Tax compliance", icon: <ShieldCheck className="w-3 h-3" /> },
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
    
    openAIChat({ query: prompt.trim() });
    setPrompt("");
  };

  const handleChipClick = (label: string) => {
    openAIChat({ query: label });
  };

  return (
    <div className="relative group">
      {/* Background Glow Effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="relative space-y-3">
        {/* Header Label */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
             <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 dark:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
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
                "focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500/50",
                "rounded-xl text-sm font-medium transition-all duration-300",
                "group-hover/form:bg-white dark:group-hover/form:bg-zinc-900 group-hover/form:border-indigo-500/30"
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
                  ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-100" 
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
              onClick={() => handleChipClick(chip.label)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                "bg-white dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/60 text-zinc-500",
                "hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400"
              )}
            >
              {chip.icon}
              {chip.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 text-[9px] font-bold text-zinc-400/60 uppercase tracking-tighter">
            Press <span className="px-1 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50">Enter</span> to query
          </div>
        </div>
      </div>
    </div>
  );
}
