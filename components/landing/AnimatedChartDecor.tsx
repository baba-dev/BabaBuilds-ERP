"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function AnimatedChartDecor() {
  const reduceMotion = useReducedMotion();

  // Create an array for bar heights
  const bars = [40, 65, 45, 80, 55, 90, 70];

  if (reduceMotion) {
    return (
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 hidden lg:block opacity-50">
        <div className="flex items-end gap-2 h-40 w-64 bg-surface-elevated/40 backdrop-blur-md border border-border/80 rounded-2xl p-4 shadow-2xl">
          {bars.map((height, i) => (
            <div key={i} className="flex-1 bg-orange-500/50 rounded-t-sm" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-[-10%] top-[15%] hidden lg:block z-20 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, x: 50, y: 20 }}
        animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
        transition={{ 
          opacity: { duration: 0.8 }, 
          x: { duration: 0.8, type: "spring" },
          y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }
        }}
        className="relative group perspective-1000"
      >
        <div className="flex items-end gap-2 h-48 w-72 bg-gradient-to-br from-surface-elevated to-surface-base backdrop-blur-xl border border-white/10 dark:border-white/5 rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
          {bars.map((height, i) => (
            <motion.div
              key={i}
              className="w-full bg-gradient-to-t from-orange-600/80 to-amber-400/80 rounded-t-md shadow-[0_0_15px_rgba(249,115,22,0.22)]"
              initial={{ height: 0 }}
              animate={{ height: [`${height * 0.5}%`, `${height}%`, `${height * 0.8}%`] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}
          
          {/* A floating tag on the chart */}
          <motion.div 
            className="absolute -top-4 -left-6 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            +84% Sales
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
