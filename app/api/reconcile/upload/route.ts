import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Groq from 'groq-sdk';
import Papa from 'papaparse'; 
import { scanBuffer } from '@/lib/security/clamav';
import { decrypt } from '@/lib/encryption';

// HELPER: Sanitize PII from bank descriptions before sending to LLM
const sanitizeDescription = (desc: string) => {
  if (!desc) return "Unknown";
  // Strip likely 10+ digit account/phone numbers to protect PII
  return desc.replace(/\b\d{10,}\b/g, "[REDACTED]");
};

const robustJsonParse = (text: string) => {
  try {
    // Attempt 1: Standard parse
    return JSON.parse(text);
  } catch (error) {
    try {
      // Attempt 2: Strip Markdown and conversational wrappers
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIndex = cleaned.indexOf('{');
      const endIndex = cleaned.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1) {
        const extracted = cleaned.substring(startIndex, endIndex + 1);
        return JSON.parse(extracted);
      }
      return null;
    } catch (fallbackError) {
      // Attempt 3: If it was cut off due to max_tokens, salvage the array
      console.warn("Attempting to salvage truncated JSON...");
      const match = text.match(/\[([\s\S]*)\]/); // Try to grab the array contents
      if (match) {
         try {
           // Force close the array and JSON wrapper
           return JSON.parse(`{"suggestions": [${match[1].replace(/,\s*$/, '')}]}`);
         } catch(e) { return null; }
      }
      return null;
    }
  }
};

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK & BYOK FETCH
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId } 
    });

    const userApiKeyEncrypted = profile?.groqApiKey;
    let userApiKey = "";

    if (userApiKeyEncrypted) {
      try {
        userApiKey = decrypt(userApiKeyEncrypted);
      } catch (e) {
        console.error("Failed to decrypt Groq API key:", e);
        userApiKey = userApiKeyEncrypted;
      }
    }

    if (!userApiKey) {
      return NextResponse.json({ 
        error: "Please configure your Groq API Key in Business Settings to use AI Reconciliation." 
      }, { status: 400 });
    }

    // 2. EXTRACT & PARSE THE CSV FILE
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const fileBytes = await file.arrayBuffer();
    const buffer = Buffer.from(fileBytes);
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });

    const fileText = buffer.toString('utf-8');
    
    // Parse CSV
    const parsed = Papa.parse(fileText, { header: true, skipEmptyLines: true });
    
    let rawTransactions: any[] = [];
    parsed.data.forEach((row: any, index: number) => {
      const cleanAmount = (val: any) => parseFloat(String(val || '0').replace(/,/g, ''));
      const debit = cleanAmount(row['Debit'] || row['Withdrawal'] || row['Paid Out']);
      const credit = cleanAmount(row['Credit'] || row['Deposit'] || row['Paid In']);
      
      const amount = debit > 0 ? debit : credit;
      if (amount > 0 && !isNaN(amount)) {
        rawTransactions.push({
          id: `txn_${index}`,
          date: row['Date'] || row['Transaction Date'] || new Date().toISOString(),
          description: row['Description'] || row['Narration'] || row['Particulars'] || 'Unknown',
          amount: amount,
          type: debit > 0 ? 'DEBIT' : 'CREDIT'
        });
      }
    });

    if (rawTransactions.length === 0) {
      return NextResponse.json({ 
        error: "Could not detect valid transactions. Please ensure your CSV has standard bank headers (e.g., Date, Description, Debit, Credit)." 
      }, { status: 400 });
    }

    // 3. FETCH DATABASE STATE FOR PASS 1 (Exact Matches)
    const pendingInvoices = await prisma.invoice.findMany({
      where: { workspaceId, status: 'Pending' }
    });

    const autoMatched: any[] = [];
    const unresolvedTransactions: any[] = [];

    // PASS 1: THE EXACT MATH MATCHER
    for (const txn of rawTransactions) {
      let matched = false;

      if (txn.type === 'CREDIT') {
        const matchingInvoiceIndex = pendingInvoices.findIndex(inv => inv.totalAmount === txn.amount);
        if (matchingInvoiceIndex !== -1) {
          const matchingInvoice = pendingInvoices[matchingInvoiceIndex];
          autoMatched.push({
            ...txn,
            matchType: "INVOICE",
            matchId: matchingInvoice.invoiceNumber,
            confidence: 100
          });
          matched = true;
          pendingInvoices.splice(matchingInvoiceIndex, 1); 
        }
      }

      if (!matched) {
        unresolvedTransactions.push(txn);
      }
    }

    // 4. PASS 2: GROQ AI SEMANTIC MATCHING
    let aiSuggestions: any[] = [];

    if (unresolvedTransactions.length > 0) {
      const groq = new Groq({ apiKey: userApiKey });

      // Optimized System Prompt with 3-Shot example to allow usage of smaller/faster model
      const systemPrompt = `You are an elite forensic accountant for an Indian business.
      I will provide you with a JSON array of unresolved bank transactions.
      Analyze the 'description' field and categorize the expense or income.
      
      For DEBITS (money out), suggest an 'aiCategory' (e.g., Software, Meals, Bank Fees) and 'aiVendor'.
      For CREDITS (money in), suggest if it's a 'Refund', 'Uncategorized Income', or 'Capital Injection'.
      
      Example output format:
      {"suggestions": [{"id": "txn_1", "aiCategory": "Software", "aiVendor": "AWS", "reason": "Cloud hosting"}]}
      
      You MUST respond in strictly valid JSON format matching this schema:
      {
        "suggestions": [
          {
            "id": "String",
            "aiCategory": "String",
            "aiVendor": "String",
            "reason": "String"
          }
        ]
      }`;

      // BATCHING: Fixes the critical slice(0, 50) data loss issue
      const CHUNK_SIZE = 40; 
      let allGroqSuggestions: any[] = [];
      const MAX_RETRIES = 1; // Retry once per chunk if parsing or network fails

      for (let i = 0; i < unresolvedTransactions.length; i += CHUNK_SIZE) {
        const chunk = unresolvedTransactions.slice(i, i + CHUNK_SIZE);
        
        // TOKEN OPTIMIZATION & PII FIX
        const optimizedChunk = chunk.map(txn => ({
          id: txn.id,
          description: sanitizeDescription(txn.description),
          type: txn.type
        }));

        let chunkSuccess = false;
        let attempts = 0;

        while (!chunkSuccess && attempts <= MAX_RETRIES) {
          try {
            attempts++;
            const completion = await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(optimizedChunk) }
              ],
              temperature: 0.1,
              response_format: { type: "json_object" } 
            });

            const rawContent = completion.choices[0].message.content || "{}";
            
            // SMART TACTIC: Use our resilient parser
            const groqResponse = robustJsonParse(rawContent);
            
            if (groqResponse && groqResponse.suggestions && Array.isArray(groqResponse.suggestions)) {
              allGroqSuggestions = [...allGroqSuggestions, ...groqResponse.suggestions];
              chunkSuccess = true; // Break out of the retry loop
            } else {
              throw new Error("Parsed JSON did not match expected schema.");
            }

          } catch (chunkError) {
            console.warn(`Chunk ${i} failed on attempt ${attempts}.`, chunkError);
            if (attempts > MAX_RETRIES) {
              console.error(`Giving up on chunk ${i} after ${attempts} attempts. Falling back to manual mapping.`);
              // We do NOT throw an error here. We let the loop continue to the next chunk.
              // The items in this specific chunk will seamlessly fall through to the manual "Uncategorized" mapping below.
            } else {
              // Optional: Add a small delay (e.g., 500ms) before retrying to respect rate limits
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
      }

      // GRACEFUL FALLBACK: Map everything back. If AI failed/skipped a row, it defaults to Uncategorized instead of disappearing
      aiSuggestions = unresolvedTransactions.map(txn => {
        const suggestion = allGroqSuggestions.find((s: any) => s.id === txn.id);
        return suggestion 
          ? { ...txn, ...suggestion } 
          : { 
              ...txn, 
              aiCategory: "Uncategorized", 
              aiVendor: "Unknown", 
              reason: "Pending manual review." 
            };
      });
    }

    // 5. RETURN THE WIZARD PAYLOAD
    return NextResponse.json({
      autoMatched,
      aiSuggestions,
      ignored: [] 
    });

  } catch (error: any) {
    console.error("Reconciliation Error:", error);
    // SECURITY FIX: Prevent leaking raw Groq SDK errors/API keys to the client
    return NextResponse.json({ 
      error: 'Failed to process bank statement securely. Please check your data or API key.' 
    }, { status: 500 });
  }
}