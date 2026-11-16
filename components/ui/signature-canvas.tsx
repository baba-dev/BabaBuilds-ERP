"use client";

import { useRef, useState, useEffect } from "react";
import { Button } from "./button";
import { RotateCcw, PenTool } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (base64Data: string) => void;
  onClear?: () => void;
}

export function SignatureCanvas({ onSave, onClear }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high-DPI scaling
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.strokeStyle = "#4f46e5"; // Indigo-600 premium brand color
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasDrawn(true);

    // Dynamic save on draw
    onSave(canvas.toDataURL("image/png"));
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSave("");
    if (onClear) onClear();
  };

  return (
    <div className="space-y-3">
      <div className="relative border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 overflow-hidden h-44 shadow-inner transition-all hover:border-indigo-300 dark:hover:border-indigo-800/60">
        {!hasDrawn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 pointer-events-none select-none animate-in fade-in duration-300">
            <PenTool className="w-6 h-6 mb-2 text-indigo-500/50" />
            <p className="text-xs font-bold uppercase tracking-widest">Draw your signature here</p>
            <p className="text-[11px] text-zinc-500 mt-1">Use your mouse, trackpad, or finger</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full cursor-crosshair touch-none"
        />
      </div>
      
      {hasDrawn && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={clearCanvas}
            className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1.5 h-8 px-2.5 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear signature
          </Button>
        </div>
      )}
    </div>
  );
}
