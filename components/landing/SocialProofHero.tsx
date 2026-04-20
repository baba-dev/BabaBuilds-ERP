"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

export default function SocialProofHero() {
  const avatars = [
    "https://i.pravatar.cc/100?img=11",
    "https://i.pravatar.cc/100?img=32",
    "https://i.pravatar.cc/100?img=47",
    "https://i.pravatar.cc/100?img=12",
    "https://i.pravatar.cc/100?img=44",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6"
    >
      <div className="flex -space-x-3">
        {avatars.map((src, i) => (
          <img
            key={i}
            src={src}
            alt="Customer"
            className="h-10 w-10 rounded-full border-2 border-surface-base object-cover shadow-sm"
          />
        ))}
      </div>
      <div className="flex flex-col items-center sm:items-start">
        <div className="flex gap-1 text-amber-500">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current" />
          ))}
        </div>
        <p className="mt-1 text-xs font-semibold text-muted-body">
          <span className="font-bold text-foreground">Trusted by 2,500+</span> successful teams
        </p>
        <p className="mt-1 text-[11px] font-medium text-muted-body">
          Built for Indian and global tax workflows
        </p>
      </div>
    </motion.div>
  );
}
