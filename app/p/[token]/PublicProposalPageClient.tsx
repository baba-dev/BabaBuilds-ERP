"use client";

import { useState, useEffect, use } from "react";
import { format } from "date-fns";
import { CheckCircle2, FileText, Building2, MessageSquareDashed, Image as ImageIcon, Video } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { formatCurrency } from "@/lib/currency";
import { SignatureCanvas } from "@/components/ui/signature-canvas";
import { getApiErrorMessage, getErrorMessage } from "@/lib/error-utils";

type PublicProposalItem = {
  id?: string;
  title: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  isOptional?: boolean;
  isSelected?: boolean;
};

type PublicProposal = {
  id: string;
  proposalNo?: string | null;
  title: string;
  status: string;
  currency?: string;
  locale?: string;
  createdAt: string;
  validUntil: string;
  subtotal: number;
  estimatedTax: number;
  clientSignatureBase64?: string | null;
  client?: { name?: string | null; email?: string | null } | null;
  items?: PublicProposalItem[];
  richSections?: Array<{ title?: string; body?: string; mediaUrl?: string }>;
  richMedia?: Array<{ title?: string; url?: string; kind?: string }>;
  billingMilestones?: Array<{ id?: string; title: string; description?: string | null; dueDate?: string | null; amount: number; status?: string }>;
};

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);  
  const { fCurrency, currency, locale } = useFormat();
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [items, setItems] = useState<PublicProposalItem[]>([]);
  const [signatureBase64, setSignatureBase64] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Security Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  // Request Changes Modal State
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);
  const displayCurrency = proposal?.currency || currency;
  const displayLocale = proposal?.locale || locale;
  const formatMoney = (amount: number | null | undefined) =>
    displayCurrency === currency && displayLocale === locale
      ? fCurrency(amount)
      : formatCurrency(amount, displayCurrency, displayLocale);

  // Fetch the proposal data when the page loads
  useEffect(() => {
    const fetchProposal = async () => {
      try {
        const res = await fetch(`/api/p/${token}`); 
        if (!res.ok) throw new Error("Proposal not found or link has expired.");
        const data = await res.json();
        const prop = data.proposal || data;
        setProposal(prop); 
        if (prop && prop.items) {
          setItems(prop.items);
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };
    fetchProposal();
  }, [token]);

  // Dynamic Totals Calculation based on selected items
  const subtotal = items
    .filter((item) => !item.isOptional || item.isSelected)
    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

  const calculatedTax = proposal && proposal.subtotal > 0
    ? subtotal * (Number(proposal.estimatedTax) / Number(proposal.subtotal))
    : 0;

  const grandTotalAmount = subtotal + calculatedTax;

  // Telemetry: Record initial view and heartbeats based on viewport scroll depth
  useEffect(() => {
    if (!proposal?.id) return;

    // A. Post initial view action
    fetch(`/api/proposals/${proposal.id}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        sectionTitle: "Cover Pitch",
        dwellTimeSeconds: 0,
        eventType: "VIEW"
      })
    }).catch(() => null);

    // B. Setup observer for heartbeats on scrolling
    let activeSection = "Cover Pitch";
    let entryTime = Date.now();

    const sendHeartbeat = (section: string, durationMs: number) => {
      if (durationMs < 1500) return; // Ignore quick scrolls under 1.5s
      fetch(`/api/proposals/${proposal.id}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sectionTitle: section,
          dwellTimeSeconds: Math.round(durationMs / 1000),
          eventType: "HEARTBEAT"
        })
      }).catch(() => null);
    };

    const observerOptions = {
      root: null,
      rootMargin: "-20% 0px -20% 0px", // Trigger when section occupies the middle 60% of viewport
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionName = entry.target.getAttribute("data-section-name");
          if (sectionName && activeSection !== sectionName) {
            const duration = Date.now() - entryTime;
            sendHeartbeat(activeSection, duration);
            
            activeSection = sectionName;
            entryTime = Date.now();
          }
        }
      });
    }, observerOptions);

    const targets = document.querySelectorAll("[data-section-name]");
    targets.forEach((t) => observer.observe(t));

    return () => {
      const duration = Date.now() - entryTime;
      sendHeartbeat(activeSection, duration);
      observer.disconnect();
    };
  }, [proposal?.id, token]);

  // Handle accepting the proposal
  const handleConfirmAccept = async () => {
    if (!clientEmail.trim()) {
      setAcceptError("Please enter your email address.");
      return;
    }

    setIsAccepting(true);
    try {
      const response = await fetch(`/api/p/${token}`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: clientEmail,
          selectedItemIds: items.filter(i => !i.isOptional || i.isSelected).map(i => i.id),
          signatureBase64
        }), 
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to accept proposal");
      }

      // Update local state to reflect accepted status
      setProposal((prev) => (prev ? { ...prev, status: "ACCEPTED", clientSignatureBase64: signatureBase64 } : prev));
      setShowConfirmModal(false);
      toast.success("Proposal successfully signed and accepted!");
      
    } catch (err: unknown) {
      setAcceptError(getErrorMessage(err));
    } finally {
      setIsAccepting(false);
    }
  };

  // Handle requesting changes
  const handleRequestChanges = async () => {
    if (!declineReason.trim()) {
      toast.error("Please provide a reason so we know what to adjust.");
      return;
    }

    setIsSubmittingDecline(true);
    try {
      const res = await fetch(`/api/p/${token}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'REVISION_REQUESTED',
          clientNote: declineReason
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const message = getApiErrorMessage(payload, getErrorMessage(payload, "Failed to submit feedback. Please try again."));
        throw new Error(message);
      }

      // Optimistic UI Update
      setProposal((prev) => (prev ? { ...prev, status: 'REVISION_REQUESTED' } : prev));
      setIsDeclineModalOpen(false);
      toast.success("Feedback sent! We'll review and get back to you shortly.");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "A network error occurred.";
      toast.error(msg);
    } finally {
      setIsSubmittingDecline(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-500">Loading proposal securely...</div>;
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4 text-center">
        <FileText className="w-12 h-12 text-zinc-300 mb-4" />
        <h1 className="text-xl font-bold text-zinc-800 mb-2">Proposal Unavailable</h1>
        <p className="text-zinc-500">{error || "This link may be invalid or expired."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* Proposal Document */}
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-zinc-200">
          <div className="h-2 bg-indigo-600 w-full" />
          
          <div className="p-8 sm:p-12">
            <div data-section-name="Cover Pitch" className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-12 pb-8 border-b border-zinc-100">
              <div>
                <h1 className="text-3xl font-black text-zinc-900 mb-2">{proposal.title}</h1>
                <p className="text-zinc-500 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Prepared for {proposal.client?.name || "Valued Client"}
                </p>
              </div>
              <div className="text-left sm:text-right text-sm text-zinc-500 space-y-1">
                <p>Date: <span className="font-medium text-zinc-900">{format(new Date(proposal.createdAt), 'MMM dd, yyyy')}</span></p>
                <p>Valid Until: <span className="font-medium text-zinc-900">{format(new Date(proposal.validUntil), 'MMM dd, yyyy')}</span></p>
                <p>Reference: <span className="font-mono text-zinc-900">{proposal.proposalNo}</span></p>
              </div>
            </div>

            {(proposal.richSections?.length ?? 0) > 0 ? (
              <div data-section-name="Highlights" className="space-y-5 mb-10">
                <h3 className="text-lg font-bold text-zinc-900">Proposal Highlights</h3>
                {(proposal.richSections ?? []).map((section, idx: number) => (
                  <div key={`${section.title}-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-sm font-bold text-zinc-900">{section.title}</p>
                    {section.body ? <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap">{section.body}</p> : null}
                    {section.mediaUrl ? (
                      <a href={section.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-xs font-semibold text-indigo-600 hover:underline">
                        View attached media
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Scope of Work */}
            <div data-section-name="Scope & Deliverables" className="space-y-6 mb-12">
              <h3 className="text-lg font-bold text-zinc-900">Scope of Work & Investment</h3>
              <div className="space-y-4">
                {items.map((item, i: number) => {
                  const isAcceptedOrInvoiced = proposal.status === "ACCEPTED" || proposal.status === "INVOICED" || proposal.status === "REVISION_REQUESTED";
                  return (
                    <div key={i} className={`p-4 bg-zinc-50 rounded-xl flex items-start gap-4 border transition-all ${
                      item.isOptional && !item.isSelected ? 'opacity-50 border-dashed border-zinc-200' : 'border-zinc-200'
                    }`}>
                      {item.isOptional && (
                        <input
                          type="checkbox"
                          disabled={isAcceptedOrInvoiced}
                          checked={!!item.isSelected}
                          onChange={() => {
                            setItems(prev => prev.map((it, idx) => idx === i ? { ...it, isSelected: !it.isSelected } : it));
                          }}
                          className="mt-1.5 h-4.5 w-4.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-zinc-900">{item.title}</p>
                          {item.isOptional && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-800 rounded">
                              Optional Add-on
                            </span>
                          )}
                        </div>
                        {item.description && <p className="text-sm text-zinc-500 mt-1">{item.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-zinc-900">{formatMoney(item.quantity * item.unitPrice)}</p>
                        <p className="text-xs text-zinc-500">Qty: {item.quantity} × {formatMoney(item.unitPrice)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {Array.isArray(proposal.billingMilestones) && proposal.billingMilestones.length > 0 ? (
              <div data-section-name="Billing Schedule" className="space-y-6 mb-12">
                <h3 className="text-lg font-bold text-zinc-900">Billing Schedule</h3>
                <p className="text-sm text-zinc-500">Payments are structured based on progress milestones, invoiced upon completion of deliverables:</p>
                <div className="space-y-4">
                  {(proposal.billingMilestones ?? []).map((milestone, i: number) => (
                    <div key={i} className="p-4 border border-zinc-200 bg-zinc-50 rounded-xl flex justify-between gap-4">
                      <div>
                        <p className="font-bold text-zinc-900">{milestone.title}</p>
                        {milestone.description && <p className="text-sm text-zinc-500 mt-1">{milestone.description}</p>}
                        {milestone.dueDate && (
                          <p className="text-xs text-zinc-400 mt-1">
                            Target Date: {format(new Date(milestone.dueDate), "MMM dd, yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-indigo-600">{formatMoney(milestone.amount)}</p>
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                          milestone.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                          milestone.status === 'INVOICED' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-zinc-200 text-zinc-700'
                        }`}>
                          {milestone.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {Array.isArray(proposal.richMedia) && proposal.richMedia.length > 0 ? (
              <div data-section-name="Attached Media" className="space-y-4 mb-12">
                <h3 className="text-lg font-bold text-zinc-900">Rich Media</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(proposal.richMedia ?? []).map((media, idx: number) => (
                    <a
                      key={`${media.url}-${idx}`}
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300 transition-colors"
                    >
                      <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                        {media.kind === "video" ? <Video className="w-4 h-4 text-indigo-600" /> : <ImageIcon className="w-4 h-4 text-indigo-600" />}
                        {media.title || (media.kind === "video" ? "Video attachment" : "Image attachment")}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 break-all">{media.url}</p>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Totals */}
            <div className="flex justify-end pt-6 border-t border-zinc-200 mb-12">
              <div className="w-full sm:w-64 space-y-3">
                <div className="flex justify-between text-zinc-900 font-black text-2xl pt-3">
                  <span>Total Value</span>
                  <span className="text-indigo-600">{formatMoney(grandTotalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Action Area */}
            <div data-section-name="Signature Panel" className="bg-zinc-50 p-6 rounded-xl border border-zinc-200 text-center">
              {proposal.status === "ACCEPTED" || proposal.status === "INVOICED" ? (
                <div className="flex flex-col items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-12 h-12 mb-3" />
                  <h3 className="text-lg font-bold">Proposal Accepted</h3>
                  <p className="text-sm text-emerald-700/80 mt-1">Thank you! This proposal has been digitally signed.</p>
                  {proposal.clientSignatureBase64 && (
                    <div className="mt-4 p-3 bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-emerald-800/40 rounded-xl shadow-inner max-w-[220px] mx-auto animate-in zoom-in duration-300">
                      <p className="text-[9px] uppercase font-bold tracking-widest text-zinc-400 mb-1 border-b pb-1 text-center">Digital Signature</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable */}
                      <img src={proposal.clientSignatureBase64} alt="Client Signature" className="h-16 w-auto object-contain mx-auto animate-in fade-in" />
                    </div>
                  )}
                </div>
              ) : proposal.status === "REVISION_REQUESTED" || proposal.status === "REJECTED" ? (
                <div className="flex flex-col items-center justify-center text-amber-600">
                  <MessageSquareDashed className="w-12 h-12 mb-3" />
                  <h3 className="text-lg font-bold">Revisions Requested</h3>
                  <p className="text-sm text-amber-700/80 mt-1">We&apos;ve received your feedback and will update the proposal shortly.</p>
                </div>
              ) : (
                <>
                  <p className="text-zinc-600 mb-4 text-sm">By clicking below, you agree to the scope of work and investment detailed above.</p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => setIsDeclineModalOpen(true)}
                      className="w-full sm:w-auto"
                    >
                      <MessageSquareDashed className="w-5 h-5 mr-2" />
                      Request Changes
                    </Button>
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => setShowConfirmModal(true)}
                      className="w-full sm:w-auto"
                    >
                      Review & Accept Proposal
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Security Verification Modal */}
      <Dialog
        open={showConfirmModal}
        onOpenChange={(open) => {
          setShowConfirmModal(open);
          if (!open) {
            setAcceptError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Identity</DialogTitle>
            <DialogDescription>
              To digitally sign this document, please confirm the email address associated with your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 block mb-1">Confirm Email Address</label>
              <Input
                type="email"
                placeholder="client@company.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 block mb-1">Draw Digital Signature</label>
              <SignatureCanvas onSave={setSignatureBase64} />
            </div>
          </div>

          {acceptError && <p className="text-rose-500 text-sm font-medium bg-rose-50 p-2 rounded">{acceptError}</p>}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              size="default"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowConfirmModal(false);
                setAcceptError("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="default"
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={handleConfirmAccept}
              disabled={isAccepting || !clientEmail.trim() || !signatureBase64}
            >
              {isAccepting ? "Verifying..." : "Sign & Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes / Decline Modal */}
      <Dialog open={isDeclineModalOpen} onOpenChange={setIsDeclineModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Let us know what you&apos;d like us to adjust. We&apos;ll revise the proposal and notify you when it&apos;s ready.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Can we adjust the scope of Phase 2? / The payment terms are a bit tight..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="min-h-[120px] resize-none"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              size="default"
              className="w-full sm:w-auto"
              onClick={() => setIsDeclineModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="default"
              className="w-full sm:w-auto"
              disabled={isSubmittingDecline}
              onClick={handleRequestChanges}
            >
              {isSubmittingDecline ? "Sending..." : "Send Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
