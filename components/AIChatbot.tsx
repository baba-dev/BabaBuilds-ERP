"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { 
  MessageSquare, X, Send, Bot, User, Loader2, 
  Trash2, Maximize2, Minimize2, Sparkles, ArrowRight, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const QUICK_PROMPTS = [
  "📈 What's my estimated tax liability?",
  "📊 How close am I to the ₹20L GST limit?",
  "💸 Log a ₹10,000 expense for 'Office Rent'",
  "🤝 Onboard Global Tech (contact@global.com)",
  "📧 Send a reminder for overdue invoices",
  "📝 Draft an invoice for Acme Corp for ₹50,000",
  "🔄 Which monthly retainers are due?",
  "🎯 Convert my last proposal to an invoice",
  "🏦 Find unreconciled bank transactions",
  "📅 Remind me to call client X tomorrow"
];

const DEFAULT_GREETING = { 
  role: 'assistant' as const, 
  content: "Hello! I am your Executive AI Assistant. I'm connected to your ERP. How can I help you today?" 
};

export default function AIChatbot() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession(); 
  
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string, actionExecuted?: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const workspaceId = (session as any)?.workspaceId;
  const storageKey = workspaceId ? `cfo_chat_history_${workspaceId}` : null;

  useEffect(() => {
    if (status === "loading") return; 
    
    if (storageKey) {
      const savedChat = localStorage.getItem(storageKey);
      if (savedChat) {
        try { setMessages(JSON.parse(savedChat)); } 
        catch (e) { setMessages([DEFAULT_GREETING]); }
      } else {
        setMessages([DEFAULT_GREETING]);
      }
    } else {
      setMessages([DEFAULT_GREETING]);
    }
    setIsInitialized(true);
  }, [status, storageKey]);

  useEffect(() => {
    if (isInitialized && storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, isInitialized, storageKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isExpanded, isLoading]);

  useEffect(() => {
    if (isOpen && !isLoading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isLoading, isExpanded]);

  const clearChat = () => {
    if (confirm("Are you sure you want to clear the conversation history?")) {
      setMessages([DEFAULT_GREETING]);
      if (storageKey) localStorage.removeItem(storageKey);
    }
  };

  const closeChat = () => {
    setIsOpen(false);
    setTimeout(() => setIsExpanded(false), 300);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    setInput(""); 
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text, 
          // Bug 8 fix: filter by content instead of slicing by position (slice(1) silently
          // drops the first real message if localStorage didn't start with the greeting).
          history: messages.filter(
            m => !(m.role === 'assistant' && m.content === DEFAULT_GREETING.content)
          ).slice(-10),
          context: {
            currentRoute: pathname,
            pageTitle: typeof document !== 'undefined' ? document.title : 'Unknown'
          }
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${data.error}` }]);
      } else {
        let actionMsg = "";

        if (data.action && data.action.type === 'NAVIGATE') {
          actionMsg = `Navigating to ${data.action.path}...`;
          
          if (data.action.payload) {
            sessionStorage.setItem('erp_ai_payload', JSON.stringify({
              path: data.action.path,
              data: data.action.payload,
              timestamp: new Date().getTime()
            }));
            actionMsg = `Navigating to ${data.action.path} and preparing your form...`;
          }
          
          router.push(data.action.path);
          setIsExpanded(false); 
        }

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.reply,
          actionExecuted: actionMsg || undefined 
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "**Network error occurred.** Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isInitialized || status === "loading") return null; 

  return (
    <>
      {isOpen && isExpanded && (
        <div 
          className="fixed inset-0 z-[90] bg-zinc-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div 
        className={`flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-zinc-950 border border-purple-200 dark:border-purple-900/50 z-[100] transition-all duration-300 ease-in-out
          ${isOpen 
            ? isExpanded 
              ? 'fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] bottom-[max(env(safe-area-inset-bottom),0.5rem)] w-full rounded-none opacity-100 scale-100 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:inset-x-auto sm:w-[95vw] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:h-[85dvh] sm:max-h-[calc(100dvh-2.5rem)]' 
              : 'fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-0 w-full h-[70dvh] max-h-[calc(100dvh-6rem)] rounded-t-2xl opacity-100 scale-100 origin-bottom sm:right-6 sm:w-[400px] sm:max-w-[calc(100vw-3rem)] sm:h-auto sm:max-h-[calc(100dvh-8rem)] sm:min-h-[520px] sm:rounded-xl sm:origin-bottom-right'
            : 'fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-0 w-full h-[70dvh] max-h-[calc(100dvh-6rem)] rounded-t-2xl opacity-0 scale-95 pointer-events-none origin-bottom sm:right-6 sm:w-[400px] sm:max-w-[calc(100vw-3rem)] sm:h-auto sm:max-h-[calc(100dvh-8rem)] sm:min-h-[520px] sm:rounded-xl sm:origin-bottom-right'
          }`}
      >
        {/* HEADER */}
        <CardHeader className="p-4 bg-purple-900 dark:bg-purple-950 text-white flex flex-row justify-between items-center space-y-0 shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-800 dark:bg-purple-900 flex items-center justify-center border border-purple-700 dark:border-purple-800">
              <Bot className="w-4 h-4 text-purple-200" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold tracking-wide">
                {isExpanded ? "AI Executive Assistant" : "AI Assistant"}
              </CardTitle>
              <p className="text-[10px] text-purple-300 font-medium uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={clearChat} title="Clear Chat" className="h-10 w-10 sm:h-8 sm:w-8 text-purple-200 hover:bg-purple-800 dark:hover:bg-purple-900 hover:text-white">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? "Minimize" : "Expand"} className="h-10 w-10 sm:h-8 sm:w-8 text-purple-200 hover:bg-purple-800 dark:hover:bg-purple-900 hover:text-white">
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={closeChat} title="Close" className="h-10 w-10 sm:h-8 sm:w-8 text-purple-200 hover:bg-purple-800 dark:hover:bg-purple-900 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        {/* MESSAGES AREA */}
        <CardContent className="flex-1 p-4 overflow-y-auto space-y-5 bg-zinc-50/50 dark:bg-zinc-900/30" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>
              
            <div className="flex flex-col gap-1 max-w-[85%]">
                <div className={`p-3.5 rounded-2xl text-[14px] leading-relaxed shadow-sm transition-colors ${msg.role === 'user' ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-tr-none' : 'bg-white dark:bg-zinc-900 border border-purple-100/50 dark:border-purple-900/30 text-zinc-800 dark:text-zinc-200 rounded-tl-none'}`}>
                  
                  <div className={`prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-pre:text-zinc-900 dark:prose-pre:text-zinc-100 ${msg.role === 'user' ? 'prose-invert dark:prose-neutral' : 'dark:prose-invert'}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  
                </div>

                {msg.actionExecuted && (
                  <div className="flex items-center gap-2 mt-1 px-2 py-1.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/50 rounded-lg text-xs font-medium text-purple-700 dark:text-purple-300 animate-in fade-in slide-in-from-top-2">
                    <ArrowRight className="w-3 h-3" />
                    {msg.actionExecuted}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* QUICK PROMPTS */}
          {messages.length === 1 && !isLoading && (
            <div className="flex flex-col gap-2 pt-4 animate-in fade-in slide-in-from-bottom-4">
              <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider ml-11">Suggested Queries</p>
              <div className="flex flex-wrap gap-2 ml-11">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button key={idx} onClick={() => sendMessage(prompt)} className="text-xs bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 hover:border-purple-200 dark:hover:border-purple-800/50 transition-all text-left font-medium active:scale-95 shadow-sm">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TYPING INDICATOR */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="px-4 py-3.5 bg-white dark:bg-zinc-900 border border-purple-100/50 dark:border-purple-900/30 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce delay-150"></span>
                <span className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          )}
        </CardContent>

        {/* INPUT FORM */}
        <form onSubmit={handleFormSubmit} className="p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-white dark:bg-zinc-950 border-t border-purple-100 dark:border-zinc-800 flex gap-2 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-none z-10 shrink-0">
          <Input 
            ref={inputRef}
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder={isExpanded ? "Ask about your finances or give me a task..." : "Ask your AI..."}
            className={`flex-1 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-purple-600 dark:focus-visible:ring-purple-500 focus-visible:bg-white dark:focus-visible:bg-zinc-900 transition-all ${isExpanded ? 'h-12 text-base rounded-xl' : 'rounded-lg'}`} 
            disabled={isLoading} 
          />
          <Button type="submit" size="icon" className={`bg-purple-900 dark:bg-purple-600 hover:bg-purple-800 dark:hover:bg-purple-700 shrink-0 shadow-md text-white transition-all ${input.trim() ? 'scale-100' : 'opacity-80'} ${isExpanded ? 'h-12 w-12 rounded-xl' : 'rounded-lg'}`} disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>

        {/* HELP CENTER LINK */}
        <div className="px-3 py-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center shrink-0">
          <a
            href="/help"
            className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors uppercase tracking-widest"
          >
            <BookOpen className="w-3 h-3" />
            Help Center & Docs
          </a>
        </div>
      </div>

      {/* FLOATING ACTION BUTTON */}
      {/* Bug 9 fix: hide FAB whenever chat is open (isOpen) so it doesn't overlap page
          content as a floating X. The header close button handles dismissal instead. */}
      <div className={`fixed bottom-[max(env(safe-area-inset-bottom),1.5rem)] right-6 z-[100] transition-all duration-300 ${isOpen || isExpanded ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`h-14 w-14 rounded-full flex items-center justify-center text-white shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 ${isOpen ? 'bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 rotate-90 shadow-zinc-400/50' : 'bg-purple-900 dark:bg-purple-600 hover:bg-purple-800 dark:hover:bg-purple-500 hover:shadow-purple-900/40 rotate-0'}`}
        >
          {isOpen ? <X className="w-6 h-6 -rotate-90 transition-transform duration-300" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>
    </>
  );
}
