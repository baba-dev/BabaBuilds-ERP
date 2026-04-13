"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sidebarItems } from "@/components/navigation/sidebar-items";
import { openAIChat } from "@/src/stores/ui/aiChatStore";

const GROUP_LABEL_FALLBACKS: Record<string, string> = {
  overview: "Overview",
  operations: "Operations",
  sales: "Sales",
  finance: "Finance",
  compliance: "Compliance",
  workspace: "Workspace",
};

const GROUP_LABEL_TRANSLATION_KEYS: Record<string, string> = {
  overview: "group_overview",
  operations: "group_operations",
  sales: "group_sales",
  finance: "group_finance",
  compliance: "group_compliance",
  workspace: "group_workspace",
};

const DEBOUNCE_MS = 200;

export function SidebarSearch() {
  const router = useRouter();
  const t = useTranslations("Sidebar");
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    const handleSlashFocus = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleSlashFocus);
    return () => window.removeEventListener("keydown", handleSlashFocus);
  }, []);

  const getGroupLabel = (groupKey: string) => {
    const translationKey = GROUP_LABEL_TRANSLATION_KEYS[groupKey];
    if (translationKey && t.has(translationKey)) return t(translationKey);
    return GROUP_LABEL_FALLBACKS[groupKey] ?? groupKey;
  };

  const filterByQuery = (query: string) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sidebarItems;

    return sidebarItems.filter((item) => {
      const label = t(item.key).toLowerCase();
      const groupLabel = getGroupLabel(item.groupKey).toLowerCase();
      const keywordMatch = item.keywords.some((keyword) => keyword.toLowerCase().includes(needle));
      return label.includes(needle) || groupLabel.includes(needle) || keywordMatch;
    });
  };

  const filteredItems = filterByQuery(debouncedSearchText);
  const liveFilteredItems = filterByQuery(searchText);

  const shouldShowAskAI = searchText.trim().length > 0 && filteredItems.length === 0;
  const shouldShowAskAILive = searchText.trim().length > 0 && liveFilteredItems.length === 0;
  const selectableCount = shouldShowAskAILive ? 1 : liveFilteredItems.length;
  const activeIndex = selectableCount > 0 ? Math.min(selectedIndex, selectableCount - 1) : 0;

  const handleOpenSelection = (index: number) => {
    if (shouldShowAskAILive) {
      openAIChat({ query: searchText });
      return;
    }

    const item = liveFilteredItems[index];
    if (!item) return;
    router.push(item.path);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!selectableCount) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % selectableCount);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + selectableCount) % selectableCount);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleOpenSelection(activeIndex);
    }
  };

  return (
    <div className="px-2 pt-2 pb-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          ref={inputRef}
          value={searchText}
          onChange={(event) => {
            setSearchText(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search menu (/)"
          className="h-9 border-zinc-700/70 bg-zinc-900/60 pl-9 text-zinc-100 placeholder:text-zinc-400 focus-visible:ring-indigo-500"
          aria-label="Sidebar search"
        />
      </div>

      {searchText.trim().length > 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-zinc-800/80 bg-zinc-900/40 p-1">
          {shouldShowAskAI ? (
            <button
              type="button"
              className={cn(
                "w-full rounded-md px-3 py-2 text-left transition-colors",
                activeIndex === 0 ? "bg-indigo-600/90 text-white" : "text-zinc-200 hover:bg-zinc-800",
              )}
              onMouseEnter={() => setSelectedIndex(0)}
              onClick={() => openAIChat({ query: searchText })}
            >
              <p className="text-sm font-semibold">No matches found</p>
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-200">
                <Sparkles className="h-3.5 w-3.5" />
                Ask Inhouse AI
              </div>
            </button>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => router.push(item.path)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeIndex === index ? "bg-indigo-600/90 text-white" : "text-zinc-200 hover:bg-zinc-800",
                )}
              >
                <span className="truncate">{t(item.key)}</span>
                <span className="ml-2 shrink-0 text-xs text-zinc-300">{getGroupLabel(item.groupKey)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
