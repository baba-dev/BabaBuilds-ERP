"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function HeroMotionDecor() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 right-10 h-44 w-44 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-6 left-6 h-36 w-36 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute -top-16 right-10 h-44 w-44 rounded-full bg-indigo-500/25 blur-3xl"
        animate={{ y: [0, 20, 0], x: [0, -12, 0], opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-6 left-6 h-36 w-36 rounded-full bg-violet-500/20 blur-3xl"
        animate={{ y: [0, -14, 0], x: [0, 10, 0], opacity: [0.25, 0.55, 0.25] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <motion.div
        className="absolute inset-[12%] rounded-[2rem] border border-white/15 dark:border-white/10"
        animate={{ rotate: [0, 1.2, -1.2, 0], scale: [1, 1.01, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
