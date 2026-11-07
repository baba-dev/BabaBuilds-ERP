"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Counts smoothly to a new amount (skipped for reduced-motion users). */
export function AnimatedMoney({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });
  const previous = useRef(value);
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    if (reduce) {
      setText(formatRef.current(value));
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.45,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setText(formatRef.current(v)),
      onComplete: () => {
        previous.current = value;
        setText(formatRef.current(value));
      },
    });
    return () => {
      previous.current = value;
      controls.stop();
    };
  }, [value, reduce]);

  return <span className={className}>{text}</span>;
}
