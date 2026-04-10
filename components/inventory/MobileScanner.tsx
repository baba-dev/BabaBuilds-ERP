"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MobileScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (decodedText: string) => void;
}

export function MobileScanner({ open, onOpenChange, onScan }: MobileScannerProps) {
  const [hasCamera, setHasCamera] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let unmounted = false;

    const startScanner = async () => {
      if (!open) return;
      setIsInitializing(true);

      try {
        const hasCameras = await Html5Qrcode.getCameras();
        if (unmounted) return;
        if (hasCameras && hasCameras.length > 0) {
          setHasCamera(true);
          scannerRef.current = new Html5Qrcode("reader");
          await scannerRef.current.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              if (scannerRef.current?.isScanning) {
                onScan(decodedText);
                onOpenChange(false);
              }
            },
            (errorMessage) => {
              // Ignore standard frame scan errors
            }
          );
        } else {
          setHasCamera(false);
        }
      } catch (err) {
        console.error("Scanner setup failed:", err);
        if (!unmounted) {
          setHasCamera(false);
          toast.error("Failed to access camera for scanning.");
        }
      } finally {
        if (!unmounted) setIsInitializing(false);
      }
    };

    if (open) {
      setTimeout(startScanner, 100); // Small delay to let the Dialog mount the DOM element
    } else {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        }).catch(console.error);
      }
    }

    return () => {
      unmounted = true;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(console.error);
      }
    };
  }, [open, onOpenChange, onScan]);

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) onOpenChange(false);
    }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-zinc-950 border-zinc-800">
        <DialogHeader className="p-4 bg-zinc-900 border-b border-zinc-800">
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-400" /> Barcode Scanner
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Point your camera at a barcode or QR code to search the inventory ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full bg-black flex items-center justify-center">
          {isInitializing ? (
            <div className="flex flex-col items-center justify-center text-zinc-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm font-bold uppercase tracking-widest">Initializing Camera...</p>
            </div>
          ) : !hasCamera ? (
            <div className="text-center p-6">
              <p className="text-rose-500 font-bold mb-2">Camera Not Found or Blocked</p>
              <p className="text-zinc-500 text-sm">Please ensure you have granted camera permissions in your browser.</p>
            </div>
          ) : null}
          
          <div id="reader" className="w-full h-full" style={{ display: isInitializing || !hasCamera ? 'none' : 'block' }}></div>
          
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-6 h-6" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
