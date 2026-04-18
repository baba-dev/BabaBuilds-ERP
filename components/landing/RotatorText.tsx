"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const words = ["on Autopilot", "at Scale", "Globally", "with AI"];

export default function RotatorText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="relative inline-flex items-center justify-center overflow-hidden h-fit w-full text-center sm:inline-block sm:w-auto mt-2 sm:mt-0 pb-1 align-top">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={index}
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 100, damping: 15 }}
          className="bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 bg-clip-text text-transparent block"
          style={{ position: 'relative' }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
