"use client";

import { useState, useEffect, use } from "react";
import { format } from "date-fns";
import { CheckCircle2, FileText, Building2, MessageSquareDashed } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { formatCurrency } from "@/lib/currency";

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);  
  const { fCurrency, currency, locale } = useFormat();
  const [proposal, setProposal] = useState<any>(null);
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
        setProposal(data.proposal || data); 
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProposal();
  }, [token]);

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
        body: JSON.stringify({ email: clientEmail }), 
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to accept proposal");
      }

      // Update local state to reflect accepted status
      setProposal({ ...proposal, status: "ACCEPTED" });
      setShowConfirmModal(false);
      toast.success("Proposal successfully signed and accepted!");
      
    } catch (err: any) {
      setAcceptError(err.message);
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

      if (res.ok) {
        // Optimistic UI Update
        setProposal({ ...proposal, status: 'REVISION_REQUESTED' });
        setIsDeclineModalOpen(false);
        toast.success("Feedback sent! We'll review and get back to you shortly.");
      } else {
        toast.error("Failed to submit feedback. Please try again.");
      }
    } catch (error) {
      toast.error("A network error occurred.");
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
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-12 pb-8 border-b border-zinc-100">
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

            {/* Scope of Work */}
            <div className="space-y-6 mb-12">
              <h3 className="text-lg font-bold text-zinc-900">Scope of Work & Investment</h3>
              <div className="space-y-4">
                {proposal.items?.map((item: any, i: number) => (
                  <div key={i} className="p-4 bg-zinc-50 rounded-lg flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <p className="font-bold text-zinc-900">{item.title}</p>
                      {item.description && <p className="text-sm text-zinc-500 mt-1">{item.description}</p>}
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="font-bold text-zinc-900">{formatMoney(item.quantity * item.unitPrice)}</p>
                      <p className="text-xs text-zinc-500">Qty: {item.quantity} × {formatMoney(item.unitPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end pt-6 border-t border-zinc-200 mb-12">
              <div className="w-full sm:w-64 space-y-3">
                <div className="flex justify-between text-zinc-900 font-black text-2xl pt-3">
                  <span>Total Value</span>
                  <span className="text-indigo-600">{formatMoney(proposal.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Action Area */}
            <div className="bg-zinc-50 p-6 rounded-xl border border-zinc-200 text-center">
              {proposal.status === "ACCEPTED" || proposal.status === "INVOICED" ? (
                <div className="flex flex-col items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-12 h-12 mb-3" />
                  <h3 className="text-lg font-bold">Proposal Accepted</h3>
                  <p className="text-sm text-emerald-700/80 mt-1">Thank you! This proposal has been digitally signed.</p>
                </div>
              ) : proposal.status === "REVISION_REQUESTED" || proposal.status === "REJECTED" ? (
                <div className="flex flex-col items-center justify-center text-amber-600">
                  <MessageSquareDashed className="w-12 h-12 mb-3" />
                  <h3 className="text-lg font-bold">Revisions Requested</h3>
                  <p className="text-sm text-amber-700/80 mt-1">We've received your feedback and will update the proposal shortly.</p>
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
          <div className="py-2">
            <Input
              type="email"
              placeholder="client@company.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
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
              className="w-full sm:w-auto"
              onClick={handleConfirmAccept}
              disabled={isAccepting}
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
              Let us know what you'd like us to adjust. We'll revise the proposal and notify you when it's ready.
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
