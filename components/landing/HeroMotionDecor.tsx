"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export default function HeroMotionDecor() {
  const reduceMotion = useReducedMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (reduceMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate mouse position relative to center of screen, normalized between -1 and 1
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [reduceMotion]);

  if (reduceMotion) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
         {/* Simple static grid */}
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/10 via-transparent to-transparent bg-[length:30px_30px] opacity-20" />
         
        <div className="absolute -top-16 right-10 h-[30vw] w-[30vw] rounded-full bg-orange-500/15 blur-[120px]" />
        <div className="absolute bottom-6 left-6 h-[25vw] w-[25vw] rounded-full bg-amber-500/10 blur-[100px]" />
      </div>
    );
  }

  // Perspective calculations based on mouse
  const rotateX = mousePosition.y * -5; // tilt up/down
  const rotateY = mousePosition.x * 5; // tilt left/right

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden perspective-1000">
      {/* Premium subtle grid and noise background */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />

      {/* Dynamic Floating Orbs */}
      <motion.div
        className="absolute -top-10 -right-10 h-[400px] w-[400px] rounded-full bg-orange-500/25 blur-[120px]"
        animate={{ 
          x: [0, 30, 0], 
          y: [0, -20, 0],
          scale: [1, 1.1, 1] 
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      
      <motion.div
        className="absolute bottom-10 -left-10 h-[350px] w-[350px] rounded-full bg-orange-600/15 blur-[100px]"
        animate={{ 
          x: [0, -20, 0], 
          y: [0, 30, 0],
          scale: [1, 1.05, 1] 
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      <motion.div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-amber-500/10 blur-[130px]"
        animate={{ opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Frame border with perspective rotation */}
      <motion.div
        className="absolute inset-[10%] rounded-[2.5rem] border border-white/20 dark:border-white/10 shadow-[inset_0_0_80px_rgba(255,255,255,0.05)] bg-white/5 backdrop-blur-sm"
        animate={{ 
          rotateX, 
          rotateY,
          translateZ: 20
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20 }}
      />
    </div>
  );
}
